import { createServerComponentClient } from "@/lib/supabase-server";
import { getBarnHealthCached, computeBarnHealth } from "@/lib/engagement/health-score";
import { BarnHealthRing } from "./BarnHealthRing";
import { StreakChip } from "./StreakChip";

/**
 * Top-of-dashboard engagement strip — server component that fetches
 * the user's streak and the active barn's health score, then renders
 * the chip + ring in a horizontal strip. Pulls only what's needed
 * for first paint; the breakdown modal data is fetched live inside
 * the ring's tap target (we already pass full criteria for now since
 * compute is cheap).
 *
 * Slotted at the top of `app/(protected)/dashboard/page.tsx` — sits
 * between the page header and the DashboardTabs.
 */
export async function DashboardEngagementStrip({
  activeBarnId,
}: {
  activeBarnId: string | null;
}) {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("current_streak, longest_streak, ui_prefs")
    .eq("id", user.id)
    .maybeSingle();
  const currentStreak = (profile?.current_streak as number | null) ?? 0;
  const longestStreak = (profile?.longest_streak as number | null) ?? 0;
  const uiPrefs = (profile?.ui_prefs ?? {}) as Record<string, boolean>;
  const wantsHealthRing = uiPrefs.show_health_ring !== false;
  const wantsStreakChip = uiPrefs.show_streak_chip !== false;

  // Barn Health: only render the ring when we have a concrete active
  // barn (not the "All Barns" view) AND the user hasn't hidden it via
  // settings. Read cached value first; if it's missing entirely,
  // compute live so the first visit isn't blank.
  let healthSnapshot =
    wantsHealthRing && activeBarnId
      ? await getBarnHealthCached(supabase, activeBarnId)
      : null;
  if (healthSnapshot && healthSnapshot.criteria.length === 0) {
    // Cache hit but no criteria — re-compute so the breakdown modal
    // works. Phase 3 can cache the breakdown alongside the score.
    healthSnapshot = await computeBarnHealth(supabase, activeBarnId!);
  }

  const showStreak =
    wantsStreakChip && !(currentStreak === 0 && longestStreak === 0);
  if (!showStreak && !healthSnapshot) return null;

  return (
    <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 pt-4 sm:px-6">
      <div>
        {showStreak && (
          <StreakChip current={currentStreak} longest={longestStreak} />
        )}
      </div>
      {healthSnapshot && (
        <div>
          <BarnHealthRing snapshot={healthSnapshot} size={80} />
        </div>
      )}
    </div>
  );
}
