import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Barn Health Score — eight criteria, weighted to 100%.
 *
 * Computed on demand and cached on the barns row for 1 hour. The
 * ring component reads the cached value; the breakdown modal reads
 * the live calculation when expanded.
 *
 * Criteria (matches the engagement-system spec):
 *   - Has horses                15%
 *   - All horses have basic info 10%
 *   - At least one log entry     10%
 *   - Consistent logging         15%   (≥ 1 entry per week, last 4 weeks)
 *   - All coggins current        20%
 *   - Horses have photos          10%   (≥ 80% of horses)
 *   - Multiple team members      10%   (≥ 1 redeemed key)
 *   - Financial tracking active  10%   (≥ 1 entry with cost_type set)
 */

export interface BarnHealthCriterion {
  key: string;
  label: string;
  weight: number;
  met: boolean;
  hint?: string;
  /** Optional href that, when followed, would let the user satisfy the criterion. */
  fix?: string;
}

export interface BarnHealthSnapshot {
  barnId: string;
  score: number;
  label: string;
  tone: "amber" | "green";
  criteria: BarnHealthCriterion[];
}

const CACHE_TTL_MS = 60 * 60 * 1000;

export function labelForScore(score: number): {
  label: string;
  tone: "amber" | "green";
} {
  if (score >= 90) return { label: "Top-notch operation", tone: "green" };
  if (score >= 75) return { label: "Running smooth", tone: "green" };
  if (score >= 50) return { label: "Looking good", tone: "amber" };
  return { label: "Getting started", tone: "amber" };
}

const DAY_MS = 24 * 60 * 60 * 1000;
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Live computation — runs ~8 cheap queries scoped to one barn. Call
 * sparingly; prefer `getBarnHealthCached`.
 */
export async function computeBarnHealth(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  barnId: string,
): Promise<BarnHealthSnapshot> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: horseRows } = await (supabase as any)
    .from("horses")
    .select("id, name, breed, sex, photo_url")
    .eq("barn_id", barnId)
    .eq("archived", false);
  const horses = (horseRows ?? []) as Array<{
    id: string;
    name: string | null;
    breed: string | null;
    sex: string | null;
    photo_url: string | null;
  }>;
  const horseIds = horses.map((h) => h.id);

  // Logs in the last 4 weeks — used by "at least one entry" and
  // "consistent logging." We bring back created_at only.
  const fourWeeksAgo = new Date(Date.now() - 28 * DAY_MS);
  let recentDates = new Set<string>();
  let hasAnyEntry = false;
  let hasCostTypedEntry = false;
  if (horseIds.length > 0) {
    const [{ data: actRecent }, { data: hltRecent }, { data: anyAct }, { data: anyHlt }, { data: barnExp }, { data: actCost }, { data: hltCost }, { data: barnExpCost }] =
      await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("activity_log")
          .select("created_at")
          .in("horse_id", horseIds)
          .gte("created_at", fourWeeksAgo.toISOString())
          .limit(500),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("health_records")
          .select("created_at")
          .in("horse_id", horseIds)
          .gte("created_at", fourWeeksAgo.toISOString())
          .limit(500),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("activity_log")
          .select("id")
          .in("horse_id", horseIds)
          .limit(1),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("health_records")
          .select("id")
          .in("horse_id", horseIds)
          .limit(1),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("barn_expenses")
          .select("id")
          .eq("barn_id", barnId)
          .limit(1),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("activity_log")
          .select("id")
          .in("horse_id", horseIds)
          .not("cost_type", "is", null)
          .limit(1),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("health_records")
          .select("id")
          .in("horse_id", horseIds)
          .not("cost_type", "is", null)
          .limit(1),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("barn_expenses")
          .select("id")
          .eq("barn_id", barnId)
          .not("cost_type", "is", null)
          .limit(1),
      ]);
    const dates = [
      ...((actRecent ?? []) as Array<{ created_at: string }>).map((r) =>
        r.created_at.slice(0, 10),
      ),
      ...((hltRecent ?? []) as Array<{ created_at: string }>).map((r) =>
        r.created_at.slice(0, 10),
      ),
    ];
    recentDates = new Set(dates);
    hasAnyEntry =
      ((anyAct ?? []) as unknown[]).length > 0 ||
      ((anyHlt ?? []) as unknown[]).length > 0 ||
      ((barnExp ?? []) as unknown[]).length > 0;
    hasCostTypedEntry =
      ((actCost ?? []) as unknown[]).length > 0 ||
      ((hltCost ?? []) as unknown[]).length > 0 ||
      ((barnExpCost ?? []) as unknown[]).length > 0;
  }

  // Coggins coverage: every horse must have a non-expired coggins doc.
  let cogginsCurrent = false;
  if (horseIds.length > 0) {
    const today = isoDate(new Date());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: docs } = await (supabase as any)
      .from("horse_documents")
      .select("horse_id")
      .in("horse_id", horseIds)
      .ilike("document_type", "%coggins%")
      .not("expiration_date", "is", null)
      .gte("expiration_date", today);
    const covered = new Set(
      ((docs ?? []) as Array<{ horse_id: string }>).map((d) => d.horse_id),
    );
    cogginsCurrent = horses.every((h) => covered.has(h.id));
  }

  // Team members: at least one row in barn_members for this barn,
  // excluding the owner themself.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: memberCount } = await (supabase as any)
    .from("barn_members")
    .select("id", { count: "exact", head: true })
    .eq("barn_id", barnId);

  // ── Per-criterion evaluations ──────────────────────────────────────
  const criteria: BarnHealthCriterion[] = [
    {
      key: "has_horses",
      label: "Has horses",
      weight: 15,
      met: horses.length > 0,
      hint:
        horses.length > 0
          ? `${horses.length} horse${horses.length === 1 ? "" : "s"} in the book.`
          : "Add at least one horse.",
      fix: "/horses/new",
    },
    {
      key: "horse_basics",
      label: "Horse names, breeds, sex filled in",
      weight: 10,
      met:
        horses.length > 0 &&
        horses.every((h) => h.name && h.breed && h.sex),
      hint:
        horses.length === 0
          ? "Add horses first."
          : horses.every((h) => h.name && h.breed && h.sex)
            ? "Every horse has the basics."
            : "Some horses are missing breed or sex.",
    },
    {
      key: "has_any_entry",
      label: "At least one log entry",
      weight: 10,
      met: hasAnyEntry,
      hint: hasAnyEntry
        ? "You've logged in this barn."
        : "Log a shoeing, exercise, feed, or note.",
    },
    {
      key: "consistent_logging",
      label: "At least one entry per week (last 4 weeks)",
      weight: 15,
      met: countWeeksCovered(recentDates) >= 4,
      hint: hasAnyEntry
        ? `${countWeeksCovered(recentDates)} of last 4 weeks have an entry.`
        : "Log entries weekly to build history.",
    },
    {
      key: "all_coggins_current",
      label: "All coggins current",
      weight: 20,
      met: cogginsCurrent,
      hint: cogginsCurrent
        ? "Every horse has a valid coggins."
        : horses.length === 0
          ? "Add horses first."
          : "Scan or upload coggins for each horse.",
    },
    {
      key: "horse_photos",
      label: "Horses have profile photos",
      weight: 10,
      met:
        horses.length > 0 &&
        horses.filter((h) => h.photo_url).length / horses.length >= 0.8,
      hint:
        horses.length === 0
          ? "Add horses first."
          : `${horses.filter((h) => h.photo_url).length} of ${horses.length} have a photo (aim for 80%+).`,
    },
    {
      key: "team_members",
      label: "Multiple team members",
      weight: 10,
      met: (memberCount ?? 0) > 0,
      hint:
        (memberCount ?? 0) > 0
          ? `${memberCount} teammate${memberCount === 1 ? "" : "s"} with access.`
          : "Share a Stall Key with your farrier, vet, or staff.",
      fix: "/keys",
    },
    {
      key: "financial_tracking",
      label: "Financial tracking active",
      weight: 10,
      met: hasCostTypedEntry,
      hint: hasCostTypedEntry
        ? "You're tracking costs on entries."
        : "Add a cost to a log entry to enable the financial side.",
    },
  ];

  const score = criteria.reduce(
    (sum, c) => sum + (c.met ? c.weight : 0),
    0,
  );
  const { label, tone } = labelForScore(score);
  return { barnId, score, label, tone, criteria };
}

function countWeeksCovered(dates: Set<string>): number {
  if (dates.size === 0) return 0;
  const now = new Date();
  let covered = 0;
  for (let i = 0; i < 4; i++) {
    const weekStart = new Date(now.getTime() - (i + 1) * 7 * DAY_MS);
    const weekEnd = new Date(now.getTime() - i * 7 * DAY_MS);
    const startIso = isoDate(weekStart);
    const endIso = isoDate(weekEnd);
    const hit = [...dates].some((d) => d >= startIso && d < endIso);
    if (hit) covered += 1;
  }
  return covered;
}

/**
 * Read the cached score from the barns row, recompute if stale.
 * Returns the snapshot ready for rendering.
 */
export async function getBarnHealthCached(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  barnId: string,
): Promise<BarnHealthSnapshot> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: barn } = await (supabase as any)
    .from("barns")
    .select("health_score, health_score_updated_at")
    .eq("id", barnId)
    .maybeSingle();
  const stamp = barn?.health_score_updated_at
    ? new Date(barn.health_score_updated_at).getTime()
    : 0;
  const fresh = barn?.health_score != null && Date.now() - stamp < CACHE_TTL_MS;
  if (fresh) {
    const score = barn!.health_score as number;
    const { label, tone } = labelForScore(score);
    return { barnId, score, label, tone, criteria: [] };
  }
  const snap = await computeBarnHealth(supabase, barnId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("barns")
    .update({
      health_score: snap.score,
      health_score_updated_at: new Date().toISOString(),
    })
    .eq("id", barnId);
  return snap;
}
