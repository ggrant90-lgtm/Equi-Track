import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Streak updater. Called from the engagement dispatcher whenever a
 * user creates a log-shaped entry (activity_log, health_records, or
 * future barn_expenses revenue entries).
 *
 * Semantics:
 *   - "Active day" = a calendar day on which the user created at
 *     least one log entry.
 *   - If today is already counted (last_active_date === today), no-op.
 *   - If yesterday was the last active day, increment streak by 1.
 *   - Otherwise, reset streak to 1.
 *   - longest_streak is updated whenever current_streak surpasses it.
 *
 * Timezone: all dates are computed in UTC for v1. A user logging in
 * at 11pm Pacific can land in the next UTC day and "miss" a calendar
 * day from their perspective. Acceptable trade-off until profiles
 * carry a timezone column.
 *
 * Returns the new streak values so the dispatcher can pass them to
 * downstream celebration checks (`streak_7`, `streak_30`).
 */
export interface StreakResult {
  current: number;
  longest: number;
  /** True when this call moved current_streak forward (vs no-op or reset). */
  bumped: boolean;
  /** True when current_streak became 1 from a higher prior streak. */
  resetFromPrior: boolean;
  priorCurrent: number;
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function updateStreakForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<StreakResult | null> {
  const today = todayUTC();
  const yesterday = yesterdayUTC();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("current_streak, longest_streak, last_active_date")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return null;

  const priorCurrent = (profile.current_streak as number | null) ?? 0;
  const priorLongest = (profile.longest_streak as number | null) ?? 0;
  const lastDate = (profile.last_active_date as string | null) ?? null;

  if (lastDate === today) {
    // Already counted today; no-op.
    return {
      current: priorCurrent,
      longest: priorLongest,
      bumped: false,
      resetFromPrior: false,
      priorCurrent,
    };
  }

  let next: number;
  let resetFromPrior = false;
  if (lastDate === yesterday) {
    next = priorCurrent + 1;
  } else {
    next = 1;
    resetFromPrior = priorCurrent > 0;
  }
  const longest = Math.max(priorLongest, next);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("profiles")
    .update({
      current_streak: next,
      longest_streak: longest,
      last_active_date: today,
    })
    .eq("id", userId);

  if (error) {
    // Don't throw — engagement is best-effort.
    console.warn("[engagement.streak] update failed", error.message);
    return null;
  }

  return {
    current: next,
    longest,
    bumped: next > priorCurrent,
    resetFromPrior,
    priorCurrent,
  };
}
