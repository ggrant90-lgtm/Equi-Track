import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Nudge registry — contextual prompts that appear at the right
 * moment to teach features without being pushy.
 *
 * Each nudge has:
 *   - key:        unique identifier; stored in profiles.seen_nudges
 *                 once dismissed (or after the user clicks the action)
 *   - priority:   higher wins when multiple nudges qualify on the
 *                 same page. Max one nudge per page load.
 *   - condition:  runs cheaply against the supabase client and
 *                 returns true when the nudge is relevant *now*.
 *                 Should be a single small query at most.
 *   - copy:       title (1 line, short), body (1-2 sentences),
 *                 actionLabel (verb phrase), actionHref (where the
 *                 action link goes).
 *
 * Conventions:
 *   - Never guilt-trip. Tone is "hey, did you know..." not "you
 *     forgot..."
 *   - Always offer a dismiss path; respect `nudges_disabled`.
 *   - Once a key is in seen_nudges, it never resurfaces.
 */

export interface NudgeContext {
  userId: string;
  /** Path the user is currently on, lower-cased without query string. */
  path: string;
  /** From the profile: master toggle for the user. */
  hasBusinessPro: boolean;
  hasBreedersPro: boolean;
}

export interface NudgeDef {
  key: string;
  priority: number;
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
  /** Returns true when the nudge should fire. Cheap queries only. */
  check: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: SupabaseClient<any>,
    ctx: NudgeContext,
  ) => Promise<boolean>;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

async function userLogCount(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<number> {
  const [{ count: a }, { count: h }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .eq("logged_by", userId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("health_records")
      .select("id", { count: "exact", head: true })
      .eq("logged_by", userId),
  ]);
  return (a ?? 0) + (h ?? 0);
}

async function ownedBarnIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("barns")
    .select("id")
    .eq("owner_id", userId);
  return ((data ?? []) as Array<{ id: string }>).map((b) => b.id);
}

// ────────────────────────────────────────────────────────────────────────────
// Nudge definitions
// ────────────────────────────────────────────────────────────────────────────

const NUDGE_BILLABLE_TO: NudgeDef = {
  key: "nudge_billable_to",
  priority: 80,
  title: "Charge it to the owner",
  body:
    "You logged a billable entry. Set billable_to and it shows up in your receivables and on the next invoice.",
  actionLabel: "Open receivables",
  actionHref: "/business-pro/receivables",
  async check(supabase, ctx) {
    if (!ctx.hasBusinessPro) return false;
    const barnIds = await ownedBarnIds(supabase, ctx.userId);
    if (barnIds.length === 0) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: horses } = await (supabase as any)
      .from("horses")
      .select("id")
      .in("barn_id", barnIds);
    const horseIds = ((horses ?? []) as Array<{ id: string }>).map((h) => h.id);
    if (horseIds.length === 0) return false;
    // Any priced entry in the last 14 days with no billable_to?
    const since = new Date(Date.now() - 14 * 86400000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .in("horse_id", horseIds)
      .in("cost_type", ["revenue", "pass_through"])
      .gt("total_cost", 0)
      .is("billable_to_user_id", null)
      .is("client_id", null)
      .gte("created_at", since)
      .limit(1);
    return (count ?? 0) > 0;
  },
};

const NUDGE_SCAN_COGGINS: NudgeDef = {
  key: "nudge_scan_coggins",
  priority: 70,
  title: "Did you know? You can scan papers.",
  body:
    "Photograph registration papers or coggins tests and BarnBook will fill in the details for you.",
  actionLabel: "Try it",
  actionHref: "/identify",
  async check(supabase, ctx) {
    // Has at least one horse, has never scanned any document.
    const barnIds = await ownedBarnIds(supabase, ctx.userId);
    if (barnIds.length === 0) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: horseCount } = await (supabase as any)
      .from("horses")
      .select("id", { count: "exact", head: true })
      .in("barn_id", barnIds);
    if ((horseCount ?? 0) === 0) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: docCount } = await (supabase as any)
      .from("horse_documents")
      .select("id", { count: "exact", head: true })
      .eq("uploaded_by_user_id", ctx.userId);
    return (docCount ?? 0) === 0;
  },
};

const NUDGE_CALENDAR: NudgeDef = {
  key: "nudge_calendar",
  priority: 50,
  title: "Your barn calendar is filling in",
  body:
    "Your entries with dates auto-populate the barn calendar. Worth a look.",
  actionLabel: "Open calendar",
  actionHref: "/calendar",
  async check(supabase, ctx) {
    const total = await userLogCount(supabase, ctx.userId);
    return total >= 5;
  },
};

const NUDGE_SHARE_KEY: NudgeDef = {
  key: "nudge_share_key",
  priority: 60,
  title: "Share a key with your farrier or vet",
  body:
    "Your barn is growing. Generate a Stall Key so other professionals can log their own work.",
  actionLabel: "Generate a key",
  actionHref: "/keys",
  async check(supabase, ctx) {
    const barnIds = await ownedBarnIds(supabase, ctx.userId);
    if (barnIds.length === 0) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: horseCount } = await (supabase as any)
      .from("horses")
      .select("id", { count: "exact", head: true })
      .in("barn_id", barnIds)
      .eq("archived", false);
    if ((horseCount ?? 0) < 3) return false;
    // No member rows exist in any of their barns yet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: memberCount } = await (supabase as any)
      .from("barn_members")
      .select("id", { count: "exact", head: true })
      .in("barn_id", barnIds);
    return (memberCount ?? 0) === 0;
  },
};

const NUDGE_BARNPILOT: NudgeDef = {
  key: "nudge_barnpilot",
  priority: 55,
  title: "Quick tip — ask BarnPilot",
  body:
    "Try \"When was Magnolia last shoed?\" BarnPilot knows your horses' history.",
  actionLabel: "Open BarnPilot",
  actionHref: "/dashboard",
  async check(supabase, ctx) {
    const total = await userLogCount(supabase, ctx.userId);
    if (total < 10) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from("assistant_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId);
    return (count ?? 0) === 0;
  },
};

const NUDGE_BUSINESS_PRO_COSTS: NudgeDef = {
  key: "nudge_business_pro_costs",
  priority: 75,
  title: "You're tracking costs — nice.",
  body:
    "Business Pro gives you a full financial dashboard: revenue, expenses, who owes you, and trends.",
  actionLabel: "Learn more",
  actionHref: "/business-pro",
  async check(supabase, ctx) {
    if (ctx.hasBusinessPro) return false;
    const barnIds = await ownedBarnIds(supabase, ctx.userId);
    if (barnIds.length === 0) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: horses } = await (supabase as any)
      .from("horses")
      .select("id")
      .in("barn_id", barnIds);
    const horseIds = ((horses ?? []) as Array<{ id: string }>).map((h) => h.id);
    if (horseIds.length === 0) return false;
    // Five or more priced entries across either table.
    const [{ count: a }, { count: h }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("activity_log")
        .select("id", { count: "exact", head: true })
        .in("horse_id", horseIds)
        .gt("total_cost", 0),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("health_records")
        .select("id", { count: "exact", head: true })
        .in("horse_id", horseIds)
        .gt("total_cost", 0),
    ]);
    return (a ?? 0) + (h ?? 0) >= 5;
  },
};

const NUDGE_STREAK_RESTART: NudgeDef = {
  key: "nudge_streak_restart",
  priority: 40,
  title: "Streak ended — but starting again is easy",
  body:
    "Your record is still in the book. Log anything today to start a fresh chain.",
  actionLabel: "Add an entry",
  actionHref: "/horses",
  async check(supabase, ctx) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("current_streak, longest_streak")
      .eq("id", ctx.userId)
      .maybeSingle();
    const cur = (profile?.current_streak as number | null) ?? 0;
    const lng = (profile?.longest_streak as number | null) ?? 0;
    return cur === 0 && lng >= 7;
  },
};

export const NUDGES: NudgeDef[] = [
  NUDGE_BILLABLE_TO,
  NUDGE_BUSINESS_PRO_COSTS,
  NUDGE_SCAN_COGGINS,
  NUDGE_SHARE_KEY,
  NUDGE_BARNPILOT,
  NUDGE_CALENDAR,
  NUDGE_STREAK_RESTART,
];
