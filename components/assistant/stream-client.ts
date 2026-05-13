/**
 * SSE consumer for /api/assistant/chat.
 *
 * We can't use EventSource because the request body needs to be POST, so
 * this parses the SSE wire format from a fetch ReadableStream by hand.
 *
 * Each event in the spec looks like:
 *
 *   event: text_delta
 *   data: {"text": "Hello"}
 *
 *   event: tool_start
 *   data: {"name": "search_horses", "id": "..."}
 *
 *   event: done
 *   data: {"tokens": {...}}
 *
 * The route emits these events:
 *   text_delta         — append .text to the assistant message
 *   tool_start         — Claude is about to call a tool
 *   tool_result_pending — server has begun executing the tool
 *   tool_result        — server has the tool result; includes .result payload
 *   error              — fatal stream error
 *   done               — stream finished cleanly
 */

export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_start"; name: string; id: string }
  | { type: "tool_result_pending"; name: string; id: string }
  | { type: "tool_result"; name: string; id: string; result: unknown }
  | { type: "error"; message: string }
  | { type: "done"; tokens?: Record<string, number> };

export interface StreamChatRequest {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  conversation_id: string;
  signal?: AbortSignal;
}

/**
 * POST to /api/assistant/chat and yield parsed SSE events.
 * Errors from the response body propagate as { type: "error" } events,
 * and a 429 throws a RateLimitError so the caller can render a clean
 * "limit reached" state.
 */
export async function* streamChat(
  req: StreamChatRequest,
): AsyncGenerator<StreamEvent> {
  const res = await fetch("/api/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: req.messages,
      conversation_id: req.conversation_id,
    }),
    signal: req.signal,
  });

  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    throw new RateLimitError(
      body?.error ?? "Rate limit reached.",
      Number(res.headers.get("Retry-After") ?? "0"),
    );
  }

  if (!res.ok || !res.body) {
    let msg = "I'm having trouble thinking right now. Try again in a moment.";
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* no-op */
    }
    yield { type: "error", message: msg };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line.
      let sep: number;
      while ((sep = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const evt = parseSseBlock(raw);
        if (evt) yield evt;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseBlock(block: string): StreamEvent | null {
  let event = "";
  let dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!event || dataLines.length === 0) return null;
  let data: unknown;
  try {
    data = JSON.parse(dataLines.join("\n"));
  } catch {
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  switch (event) {
    case "text_delta":
      return { type: "text_delta", text: String(d.text ?? "") };
    case "tool_start":
      return { type: "tool_start", name: String(d.name), id: String(d.id) };
    case "tool_result_pending":
      return {
        type: "tool_result_pending",
        name: String(d.name),
        id: String(d.id),
      };
    case "tool_result":
      return {
        type: "tool_result",
        name: String(d.name),
        id: String(d.id),
        result: d.result,
      };
    case "error":
      return { type: "error", message: String(d.message ?? "Error") };
    case "done":
      return { type: "done", tokens: d.tokens };
    default:
      return null;
  }
}

export class RateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
