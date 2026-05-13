import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { createServerComponentClient } from "@/lib/supabase-server";
import { createAnthropicClient } from "@/lib/anthropic-client";
import {
  ASSISTANT_MODEL,
  ASSISTANT_ENDPOINT,
  MAX_HISTORY_MESSAGES,
  MAX_TOOL_ROUNDS,
  MAX_TOKENS_DEFAULT,
  MAX_TOKENS_TOOL_USE,
  RATE_LIMITS_FREE,
  RATE_LIMITS_PAID,
} from "@/lib/assistant/config";
import { buildSystemPrompt, loadUserContext } from "@/lib/assistant/system-prompt";
import { ASSISTANT_TOOLS, getToolByName } from "@/lib/assistant/tools";
import { calculateCostCents } from "@/lib/assistant/pricing";
import { checkRateLimit, logApiCall } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface ChatRequestBody {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  conversation_id?: string;
}

/** SSE event helper. Each event is one JSON line. */
function sseEvent(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

/**
 * Determine whether the user counts as "paid" for rate-limit purposes.
 * Paid = any paid/comped barn OR has_business_pro OR has_breeders_pro.
 */
async function isPaidUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  hasBusinessPro: boolean,
  hasBreedersPro: boolean,
): Promise<boolean> {
  if (hasBusinessPro || hasBreedersPro) return true;
  const { count } = await supabase
    .from("barns")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .in("plan_tier", ["paid", "comped"]);
  return (count ?? 0) > 0;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { error: "Missing or empty messages array." },
      { status: 400 },
    );
  }

  // Load user context (also used for rate-limit tier determination).
  const ctx = await loadUserContext(supabase, user.id, user.email ?? "");
  const paid = await isPaidUser(
    supabase,
    user.id,
    ctx.hasBusinessPro,
    ctx.hasBreedersPro,
  );
  const limits = paid ? RATE_LIMITS_PAID : RATE_LIMITS_FREE;

  // Rate limit before doing any expensive work.
  const rl = await checkRateLimit(supabase, user.id, ASSISTANT_ENDPOINT, limits);
  if (!rl.ok) {
    const res = NextResponse.json(
      {
        error:
          rl.reason === "hour"
            ? "I've answered a lot of questions in the last hour — give me a bit and try again."
            : "I've reached my daily limit for questions. I'll be ready again tomorrow. In the meantime, you can find most info by navigating BarnBook directly.",
      },
      { status: 429 },
    );
    res.headers.set("Retry-After", String(rl.retryAfterSeconds));
    return res;
  }

  // Build the system prompt (split for prompt caching).
  const { staticBlock, dynamicBlock } = buildSystemPrompt(ctx);

  // Trim history.
  const trimmed = body.messages
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string",
    )
    .slice(-MAX_HISTORY_MESSAGES);

  // Build initial Anthropic-shape messages.
  const messages: Anthropic.MessageParam[] = trimmed.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Tool definitions for the Anthropic call.
  const tools: Anthropic.Tool[] = ASSISTANT_TOOLS.map((t) => ({
    name: t.definition.name,
    description: t.definition.description,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input_schema: t.definition.input_schema as any,
  }));

  const client = createAnthropicClient();
  const conversationId = body.conversation_id ?? null;

  // Track usage across all rounds for one assistant_usage row at the end.
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  const toolsCalled: string[] = [];
  let rounds = 0;

  const sseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: string, data: unknown) => {
        controller.enqueue(sseEvent(event, data));
      };

      let success = false;
      let errMsg: string | null = null;

      try {
        // Tool-use loop.
        let round = 0;
        while (round < MAX_TOOL_ROUNDS) {
          round++;
          rounds = round;

          const stream = client.messages.stream({
            model: ASSISTANT_MODEL,
            max_tokens:
              round === 1 ? MAX_TOKENS_DEFAULT : MAX_TOKENS_TOOL_USE,
            system: [
              {
                type: "text",
                text: staticBlock,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                cache_control: { type: "ephemeral" } as any,
              },
              { type: "text", text: dynamicBlock },
            ],
            tools,
            messages,
          });

          // Forward text deltas and tool-call signals to the client.
          for await (const event of stream) {
            if (event.type === "content_block_start") {
              if (event.content_block.type === "tool_use") {
                write("tool_start", {
                  name: event.content_block.name,
                  id: event.content_block.id,
                });
              }
            } else if (event.type === "content_block_delta") {
              if (event.delta.type === "text_delta") {
                write("text_delta", { text: event.delta.text });
              }
            }
          }

          const finalMessage = await stream.finalMessage();
          const usage = finalMessage.usage;
          inputTokens += usage.input_tokens ?? 0;
          outputTokens += usage.output_tokens ?? 0;
          cacheReadTokens += usage.cache_read_input_tokens ?? 0;
          cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;

          // Append the assistant turn to history.
          messages.push({ role: "assistant", content: finalMessage.content });

          if (finalMessage.stop_reason !== "tool_use") {
            success = true;
            break;
          }

          // Execute tool calls and append a single user turn with all
          // tool_result blocks (Anthropic's expected shape).
          const toolUses = finalMessage.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const use of toolUses) {
            toolsCalled.push(use.name);
            write("tool_result_pending", { id: use.id, name: use.name });
            const tool = getToolByName(use.name);
            let resultPayload: unknown;
            try {
              if (!tool) {
                resultPayload = { error: `Unknown tool: ${use.name}` };
              } else {
                resultPayload = await tool.handler(use.input, {
                  supabase,
                  userId: user.id,
                  hasBusinessPro: ctx.hasBusinessPro,
                });
              }
            } catch (e) {
              resultPayload = {
                error:
                  e instanceof Error
                    ? e.message
                    : "Tool execution failed.",
              };
            }

            write("tool_result", {
              id: use.id,
              name: use.name,
              result: resultPayload,
            });
            toolResults.push({
              type: "tool_result",
              tool_use_id: use.id,
              content: JSON.stringify(resultPayload),
            });
          }

          messages.push({ role: "user", content: toolResults });
        }

        if (!success && rounds >= MAX_TOOL_ROUNDS) {
          write("error", {
            message:
              "I got stuck looking that up. Try rephrasing — or open the page directly.",
          });
        }

        write("done", {
          tokens: {
            input: inputTokens,
            output: outputTokens,
            cache_read: cacheReadTokens,
            cache_write: cacheWriteTokens,
          },
        });
      } catch (e) {
        errMsg = e instanceof Error ? e.message : "Unknown error";
        write("error", {
          message:
            "I'm having trouble thinking right now. Try again in a moment, or open the page directly.",
        });
      } finally {
        controller.close();

        // Log usage (best-effort, never throws). Runs after the response
        // closes so it doesn't block the client.
        const costCents = calculateCostCents(ASSISTANT_MODEL, {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_read_input_tokens: cacheReadTokens,
          cache_creation_input_tokens: cacheWriteTokens,
        });

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("assistant_usage").insert({
            user_id: user.id,
            conversation_id: conversationId,
            model: ASSISTANT_MODEL,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cache_read_tokens: cacheReadTokens,
            cache_write_tokens: cacheWriteTokens,
            tools_called: toolsCalled,
            rounds,
            cost_cents: costCents,
            success,
            error: errMsg,
          });
        } catch {
          // swallow
        }

        await logApiCall(supabase, {
          user_id: user.id,
          endpoint: ASSISTANT_ENDPOINT,
          success,
          cost_cents: costCents,
          error: errMsg,
        });
      }
    },
  });

  return new Response(sseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
