import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CELEBRATIONS,
  type CelebrationFire,
  type CelebrationFireContext,
} from "./defs";

export type { CelebrationFire, CelebrationFireContext } from "./defs";

/**
 * Run every celebration whose triggers include the current event,
 * persist any new ones, and return the freshly-fired set for UI
 * display.
 *
 * The UNIQUE constraint on user_celebrations is the source of truth:
 * we INSERT ... ON CONFLICT DO NOTHING and only treat the insert as
 * a "fire" if it returns a row. A celebration that's already been
 * shown is silently skipped, even if its condition still matches.
 *
 * Failures inside individual celebrations are isolated — one broken
 * check never blocks the others.
 */
export async function checkCelebrations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  ctx: CelebrationFireContext,
): Promise<CelebrationFire[]> {
  const matching = CELEBRATIONS.filter((c) => c.triggers.includes(ctx.event));
  if (matching.length === 0) return [];

  const candidates = await Promise.all(
    matching.map(async (def) => {
      try {
        return await def.check(supabase, ctx);
      } catch (err) {
        console.warn(
          "[engagement.celebrations] check failed",
          def.id,
          (err as Error).message,
        );
        return null;
      }
    }),
  );

  const fires: CelebrationFire[] = [];
  for (const c of candidates) {
    if (!c) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("user_celebrations")
      .insert({
        user_id: ctx.userId,
        celebration_key: c.key,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      // 23505 = unique_violation → already shown; quietly skip.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((error as any).code !== "23505") {
        console.warn(
          "[engagement.celebrations] insert failed",
          c.key,
          error.message,
        );
      }
      continue;
    }
    if (data) fires.push(c);
  }
  return fires;
}

/**
 * Lookup helper for the dashboard load path: pull any celebrations
 * the user hasn't seen yet but that were inserted by another path.
 * Phase 1 doesn't actively use this — every fire happens inline in
 * an action — but it's a stable surface for Phase 2 when celebrations
 * may be precomputed by a cron.
 */
export async function pendingCelebrationsForUser(): Promise<CelebrationFire[]> {
  return [];
}
