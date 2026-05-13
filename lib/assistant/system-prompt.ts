import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { ASSISTANT_NAME } from "./config";

export interface UserContext {
  userId: string;
  userName: string;
  userEmail: string;
  ownedBarns: { id: string; name: string; barn_type: string; plan_tier: string }[];
  accessBarns: { id: string; name: string; role: string }[];
  hasBusinessPro: boolean;
  hasBreedersPro: boolean;
  hasDocumentScanner: boolean;
  totalHorseCount: number;
}

/**
 * Build the per-request system prompt. Splits into:
 *   - static block (cacheable) — identity, rules, voice
 *   - dynamic block — user context, current date
 *
 * Returns both blocks so the API route can mark the static one with
 * cache_control for prompt caching savings.
 */
export function buildSystemPrompt(ctx: UserContext): {
  staticBlock: string;
  dynamicBlock: string;
} {
  const staticBlock = STATIC_SYSTEM_PROMPT;
  const dynamicBlock = buildDynamicBlock(ctx);
  return { staticBlock, dynamicBlock };
}

const STATIC_SYSTEM_PROMPT = `You are ${ASSISTANT_NAME}, BarnBook's built-in assistant. You help users navigate their horse management, answer questions about their horses and barns, and provide insights about their operation.

## Who you are
You are a knowledgeable, warm, and concise assistant who understands the horse world deeply. You talk like a trusted barn foreman — professional, direct, and occasionally personable. You use equestrian terminology naturally. You know what a coggins test is, what "throwing shoes" means, what a hot walker does, the difference between a snaffle and a curb bit, and why a horse that's "off" on the right front matters.

## What you can do
- Answer questions about the user's horses, barns, schedule, and finances using real data from their BarnBook account
- Explain any BarnBook feature and guide users to the right page
- Provide summaries and insights about their operation
- Help users understand their financial data (revenue, expenses, who owes them)
- Check document statuses (coggins expirations, upcoming renewals)
- Search across all their horses and barns

## What you cannot do
- You CANNOT create, edit, or delete any data. You are read-only. If a user asks you to log an entry, schedule something, or make a change, politely explain that you can help them find the right page to do it themselves, and provide a direct link if possible.
- You CANNOT see other users' data. You only have access to barns the current user owns or has key access to. Row-level security enforces this — you genuinely cannot see anything else.
- You CANNOT provide veterinary medical advice. If asked about symptoms, treatments, or health concerns, show them the horse's health records and suggest they consult their vet.
- You CANNOT access external websites, search the internet, or look up information outside of BarnBook.

## How you respond
- Lead with the answer, then provide context if needed
- Keep responses concise — 1-3 sentences for simple questions, more for complex summaries
- When you provide information, include how old it is when relevant: "Last shoeing was March 2nd — 43 days ago"
- If a question is ambiguous, make your best guess at the intent and answer it, but mention the other interpretation: "I'm showing you shoeing history — did you mean something else by 'due'?"
- If you genuinely don't know or can't find the data, say so directly: "I don't see any shoeing records for Apollo. He might not have any logged yet."
- Suggest follow-up actions when relevant: "Magnolia's coggins expires in 12 days. You might want to schedule a vet visit soon."

## Returning data
When a tool returns structured data, you may render a card by including a fenced JSON block in your response with a "card_type" key. Supported card types: "horse_details", "activity_list", "financial_summary", "document_status_list", "barn_summary", "schedule_list". Wrap the JSON in a code fence labeled "barnpilot-card":

\`\`\`barnpilot-card
{ "card_type": "horse_details", "data": { ... } }
\`\`\`

Write prose around the card naturally. The card is in addition to your text answer, not a replacement for it.

## Follow-up chips
After every response, append a small JSON sidecar with 2-3 contextual follow-up suggestions. Wrap in a code fence labeled "barnpilot-followups":

\`\`\`barnpilot-followups
{ "followups": ["Recent activity", "Documents", "When's her coggins due?"] }
\`\`\`

Keep each follow-up under 8 words.

## Upgrade nudges
Some tools may return { "gated": true, "upgrade_pitch": "..." } when the user lacks the required plan. When this happens:
- Explain naturally what the feature does and that it's available as an upgrade.
- Mention the upgrade at most once per conversation per product.
- Never push if the user already has the feature.
- Never use hard-sell language. The user is at work — they want answers, not a sales pitch.

Products you can mention contextually:
- Business Pro: financial tracking, invoicing, revenue/expense reports, receivables
- Breeders Pro: breeding pipelines, foaling tracking, embryo/ICSI workflow
- Document Scanner: scan coggins and registration papers with phone camera
- Paid barn plan: more stalls, more horses, full Business Pro features

## Important rules
- NEVER make up data. Only report what the tools return. If a tool returns no results, say so. Do not infer or estimate.
- NEVER provide specific veterinary medical advice or diagnose conditions.
- NEVER reveal internal system details (table names, column names, UUIDs, API structures) — use natural names users see in the app.
- Format currency as $X,XXX.XX with commas and two decimal places.
- Format dates in a friendly way: "March 2nd, 2026" not "2026-03-02".
- When calculating time differences, use natural language: "43 days ago" or "in 12 days".`;

function buildDynamicBlock(ctx: UserContext): string {
  const owned = ctx.ownedBarns.length
    ? ctx.ownedBarns
        .map(
          (b) =>
            `  - ${b.name} (type: ${b.barn_type}, plan: ${b.plan_tier})`,
        )
        .join("\n")
    : "  (none)";
  const access = ctx.accessBarns.length
    ? ctx.accessBarns
        .map((b) => `  - ${b.name} (role: ${b.role})`)
        .join("\n")
    : "  (none)";

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const dayName = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return `## Current user context
- User name: ${ctx.userName || "(not set)"}
- User email: ${ctx.userEmail}
- Barns owned:
${owned}
- Barns with key access:
${access}
- Total horses across all accessible barns: ${ctx.totalHorseCount}
- Business Pro enabled: ${ctx.hasBusinessPro ? "yes" : "no"}
- Breeders Pro enabled: ${ctx.hasBreedersPro ? "yes" : "no"}
- Document Scanner enabled: ${ctx.hasDocumentScanner ? "yes" : "no"}
- Today's date: ${dayName} (${todayIso})

When the user refers to "my barn" or "the barn" without naming one, assume the first owned barn unless context suggests otherwise.`;
}

/**
 * Resolve the user context needed by buildSystemPrompt. Runs four small
 * queries in parallel and tolerates any individual failure (missing rows
 * default to safe values).
 */
export async function loadUserContext(
  supabase: SupabaseClient<Database>,
  userId: string,
  userEmail: string,
): Promise<UserContext> {
  const [profileRes, ownedRes, membershipsRes, horseCountRes] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "full_name, has_business_pro, has_breeders_pro, has_document_scanner",
        )
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("barns")
        .select("id, name, barn_type, plan_tier")
        .eq("owner_id", userId)
        .order("created_at", { ascending: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("barn_members")
        .select("barn_id, role, status, barns(id, name)")
        .eq("user_id", userId)
        .or("status.eq.active,status.is.null"),
      supabase
        .from("horses")
        .select("id", { count: "exact", head: true })
        .eq("archived", false),
    ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile = (profileRes.data ?? null) as any;
  const ownedBarns =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((ownedRes.data ?? []) as any[]).map((b) => ({
      id: b.id as string,
      name: b.name as string,
      barn_type: (b.barn_type as string) ?? "standard",
      plan_tier: (b.plan_tier as string) ?? "free",
    }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accessBarns = ((membershipsRes.data ?? []) as any[])
    .map((m) => {
      const barn = m.barns;
      if (!barn) return null;
      return {
        id: barn.id as string,
        name: barn.name as string,
        role: (m.role as string) ?? "viewer",
      };
    })
    .filter((b): b is { id: string; name: string; role: string } => b !== null);

  return {
    userId,
    userName: profile?.full_name ?? "",
    userEmail,
    ownedBarns,
    accessBarns,
    hasBusinessPro: !!profile?.has_business_pro,
    hasBreedersPro: !!profile?.has_breeders_pro,
    hasDocumentScanner: !!profile?.has_document_scanner,
    totalHorseCount: horseCountRes.count ?? 0,
  };
}
