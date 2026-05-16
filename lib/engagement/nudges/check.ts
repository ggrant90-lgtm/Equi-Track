import type { SupabaseClient } from "@supabase/supabase-js";
import { NUDGES, type NudgeDef, type NudgeContext } from "./defs";

/**
 * Pick the single highest-priority nudge that:
 *   - the user hasn't already seen / dismissed
 *   - whose condition currently evaluates true
 *
 * Returns null when the user has nudges_disabled, when nothing
 * qualifies, or when something goes wrong (best-effort — failures
 * are silent so the UI doesn't flash error states).
 *
 * Performance: walks the registry in priority order (highest first)
 * and short-circuits as soon as one qualifies. Each check is one or
 * two cheap queries; in practice we run at most 2-3 before finding
 * a hit or exhausting the list.
 */
export type NudgeResult = {
  key: string;
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
};

export async function pickNudgeForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  ctx: NudgeContext,
): Promise<NudgeResult | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("seen_nudges, nudges_disabled, notifications_enabled")
      .eq("id", ctx.userId)
      .maybeSingle();
    if (!profile) return null;
    if (profile.nudges_disabled === true) return null;
    if (profile.notifications_enabled === false) return null;

    const seen = new Set<string>(
      ((profile.seen_nudges ?? []) as string[]) || [],
    );

    const candidates: NudgeDef[] = [...NUDGES]
      .filter((n) => !seen.has(n.key))
      .sort((a, b) => b.priority - a.priority);

    for (const def of candidates) {
      try {
        const ok = await def.check(supabase, ctx);
        if (ok) {
          return {
            key: def.key,
            title: def.title,
            body: def.body,
            actionLabel: def.actionLabel,
            actionHref: def.actionHref,
          };
        }
      } catch (err) {
        console.warn(
          "[engagement.nudges] check failed",
          def.key,
          (err as Error).message,
        );
      }
    }
    return null;
  } catch {
    return null;
  }
}
