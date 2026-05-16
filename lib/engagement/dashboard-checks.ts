import type { SupabaseClient } from "@supabase/supabase-js";
import { runEngagementHooks } from "./dispatcher";
import { stashPendingCelebrations } from "./pending-celebrations";

/**
 * Dashboard-load engagement checks.
 *
 * Some celebrations can only fire after the underlying data shifts
 * outside the user's direct action — `all_coggins_current` (a doc may
 * have been added by a teammate, archived a horse, etc.) and
 * `first_profitable_month` (computed from the prior calendar month's
 * totals, which has nothing to do with the user's last click).
 *
 * We fire `dashboard_loaded` for each owned barn so per-barn checks
 * see their context. Defs that don't need a barn (first_profitable_
 * month) short-circuit on their own internal guards after the first
 * pass — the celebrations insert UNIQUE constraint plus an early
 * "prior wins?" query keeps redundant invocations cheap.
 *
 * Fire-and-forget from the dashboard page; failures swallowed.
 */
export async function runDashboardEngagementChecks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: barns } = await (supabase as any)
      .from("barns")
      .select("id, name")
      .eq("owner_id", userId);
    const barnList = (barns ?? []) as Array<{ id: string; name: string }>;
    if (barnList.length === 0) {
      // Even without barns we may want first_profitable_month to no-op
      // cleanly; but with no barns it'll early-exit on the barn lookup.
      const eng = await runEngagementHooks(supabase, {
        userId,
        event: "dashboard_loaded",
      });
      if (eng.celebrations.length > 0) {
        await stashPendingCelebrations(eng.celebrations);
      }
      return;
    }

    // Fire once per barn; the dispatcher routes each registered def
    // by event type. all_coggins_current uses barnId; the others
    // self-guard.
    const allFires = [];
    for (const b of barnList) {
      const eng = await runEngagementHooks(supabase, {
        userId,
        event: "dashboard_loaded",
        barnId: b.id,
        barnName: b.name,
      });
      allFires.push(...eng.celebrations);
    }
    if (allFires.length > 0) {
      await stashPendingCelebrations(allFires);
    }
  } catch (err) {
    console.warn(
      "[engagement.dashboard-checks] failed",
      (err as Error).message,
    );
  }
}
