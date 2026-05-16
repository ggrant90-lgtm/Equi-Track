import type { SupabaseClient } from "@supabase/supabase-js";
import type { StreakResult } from "@/lib/engagement/streak";

/**
 * Celebration registry — central definitions for every "moment" the
 * app can celebrate. The engagement dispatcher walks this registry,
 * runs only the entries whose `triggers` include the current event,
 * evaluates each `condition`, and surfaces the ones that fire.
 *
 * Each celebration's `key` is unique per user; the UNIQUE constraint
 * on user_celebrations enforces at-most-once display. Keys may embed
 * context (e.g., barn id) so "all coggins current" can fire once per
 * barn, not once per user globally.
 */

export type EngagementEvent =
  | "horse_created"
  | "log_created"
  | "document_scanned"
  | "key_redeemed"
  | "month_rollover"
  | "dashboard_loaded";

export type CelebrationTier = "warm" | "bold";

export interface CelebrationFireContext {
  userId: string;
  /** Surface-level event, plus arbitrary data the def may need. */
  event: EngagementEvent;
  horseId?: string;
  barnId?: string;
  /** Streak result, when the dispatcher just ran the streak updater. */
  streak?: StreakResult | null;
  /** Friendly name (horse name, barn name) the celebration may template. */
  horseName?: string;
  barnName?: string;
}

export interface CelebrationFire {
  /** Full unique key inserted into user_celebrations (may include ids). */
  key: string;
  title: string;
  message: string;
  icon?: string;
  tier: CelebrationTier;
  shareEnabled: boolean;
  shareMessage?: string;
}

export interface CelebrationDef {
  /** Stable internal id — used for logging, not stored. */
  id: string;
  triggers: EngagementEvent[];
  check: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: SupabaseClient<any>,
    ctx: CelebrationFireContext,
  ) => Promise<CelebrationFire | null>;
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 1 celebrations
// ────────────────────────────────────────────────────────────────────────────

const FIRST_HORSE: CelebrationDef = {
  id: "first_horse",
  triggers: ["horse_created"],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async check(supabase: SupabaseClient<any>, ctx) {
    // Count horses across barns the user owns. The fire condition is
    // "this is the first" — we run cheap COUNT keyed off owner_id.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ownedBarns } = await (supabase as any)
      .from("barns")
      .select("id")
      .eq("owner_id", ctx.userId);
    const ids = ((ownedBarns ?? []) as Array<{ id: string }>).map((b) => b.id);
    if (ids.length === 0) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from("horses")
      .select("id", { count: "exact", head: true })
      .in("barn_id", ids)
      .eq("archived", false);
    if ((count ?? 0) !== 1) return null;

    const name = ctx.horseName?.trim() || "Your first horse";
    return {
      key: "first_horse",
      title: "Welcome to the barn",
      message: `${name} is officially on the books. Every great barn starts with one.`,
      icon: "🐴",
      tier: "warm",
      shareEnabled: true,
      shareMessage: `Started our BarnBook journey with ${name} 🐴`,
    };
  },
};

const FIRST_ENTRY: CelebrationDef = {
  id: "first_entry",
  triggers: ["log_created"],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async check(supabase: SupabaseClient<any>, ctx) {
    // First entry across activity_log + health_records that the user
    // authored. Cheap: limit 2, look for prior rows other than the
    // one just inserted (we get called *after* insert, so a single
    // row means "this is the first").
    const [{ count: act }, { count: hlt }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("activity_log")
        .select("id", { count: "exact", head: true })
        .eq("logged_by", ctx.userId),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("health_records")
        .select("id", { count: "exact", head: true })
        .eq("logged_by", ctx.userId),
    ]);
    const total = (act ?? 0) + (hlt ?? 0);
    if (total !== 1) return null;

    const name = ctx.horseName?.trim() || "your horse";
    return {
      key: "first_entry",
      title: "First record in the book",
      message: `That's the start of ${name}'s story. The best barns keep the best records.`,
      icon: "📖",
      tier: "warm",
      shareEnabled: false,
    };
  },
};

const STREAK_7: CelebrationDef = {
  id: "streak_7",
  triggers: ["log_created"],
  async check(_supabase, ctx) {
    if (!ctx.streak) return null;
    if (ctx.streak.current !== 7) return null;
    return {
      key: "streak_7",
      title: "One week straight",
      message:
        "7 days of consistent records. Your horses' history is building itself.",
      icon: "🔥",
      tier: "warm",
      shareEnabled: true,
      shareMessage: "7 days straight of barn records on BarnBook 📋🔥",
    };
  },
};

const STREAK_30: CelebrationDef = {
  id: "streak_30",
  triggers: ["log_created"],
  async check(_supabase, ctx) {
    if (!ctx.streak) return null;
    if (ctx.streak.current !== 30) return null;
    return {
      key: "streak_30",
      title: "Thirty days. No excuses.",
      message:
        "A full month of daily records. Your horses' next owner will thank you for this.",
      icon: "🔥",
      tier: "bold",
      shareEnabled: true,
      shareMessage: "30 days straight of barn records on BarnBook 🔥📋",
    };
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Phase 2 celebrations
// ────────────────────────────────────────────────────────────────────────────

/**
 * Barn-size milestones — 10, 25, 50 horses. Key embeds the barn id
 * so a user with multiple barns fires once per barn per milestone.
 * Fires only on the exact count to avoid retro-firing if horses are
 * archived and re-added.
 */
function makeBarnMilestone(threshold: number, copy: {
  title: string;
  message: (barnName: string) => string;
  share: (barnName: string) => string;
}): CelebrationDef {
  return {
    id: `barn_milestone_${threshold}`,
    triggers: ["horse_created"],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async check(supabase: SupabaseClient<any>, ctx) {
      if (!ctx.barnId) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (supabase as any)
        .from("horses")
        .select("id", { count: "exact", head: true })
        .eq("barn_id", ctx.barnId)
        .eq("archived", false);
      if ((count ?? 0) !== threshold) return null;
      const barnName = ctx.barnName?.trim() || "Your barn";
      return {
        key: `barn_milestone_${threshold}_${ctx.barnId}`,
        title: copy.title,
        message: copy.message(barnName),
        icon: "🐴",
        tier: "bold",
        shareEnabled: true,
        shareMessage: copy.share(barnName),
      };
    },
  };
}

const BARN_10 = makeBarnMilestone(10, {
  title: "Ten strong",
  message: (n) => `${n} just hit double digits. That's a real operation.`,
  share: (n) => `${n} just hit 10 horses on BarnBook 🐴🔟`,
});

const BARN_25 = makeBarnMilestone(25, {
  title: "Twenty-five and growing",
  message: (n) => `${n} is running 25 head. Serious barn, serious records.`,
  share: (n) => `25 horses strong at ${n} 💪`,
});

const BARN_50 = makeBarnMilestone(50, {
  title: "Fifty head",
  message: (n) =>
    `Half a hundred horses under one roof. ${n} is the real deal.`,
  share: (n) => `50 horses managed on BarnBook at ${n} 🏆`,
});

/**
 * 100th log entry — fires once per user when their total log count
 * (activity_log + health_records) hits exactly 100.
 */
const ENTRY_100: CelebrationDef = {
  id: "entry_count_100",
  triggers: ["log_created"],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async check(supabase: SupabaseClient<any>, ctx) {
    const [{ count: act }, { count: hlt }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("activity_log")
        .select("id", { count: "exact", head: true })
        .eq("logged_by", ctx.userId),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("health_records")
        .select("id", { count: "exact", head: true })
        .eq("logged_by", ctx.userId),
    ]);
    const total = (act ?? 0) + (hlt ?? 0);
    if (total !== 100) return null;
    return {
      key: "entry_count_100",
      title: "A hundred records deep",
      message:
        "100 entries in the book. Your horses' stories are getting rich.",
      icon: "📖",
      tier: "warm",
      shareEnabled: true,
      shareMessage: "100 records logged on BarnBook 📖",
    };
  },
};

/**
 * First document scan — fires when the user's first horse_documents
 * row is created (i.e., they just finished the scanner flow once).
 */
const FIRST_DOC_SCAN: CelebrationDef = {
  id: "first_document_scan",
  triggers: ["document_scanned"],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async check(supabase: SupabaseClient<any>, ctx) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from("horse_documents")
      .select("id", { count: "exact", head: true })
      .eq("uploaded_by_user_id", ctx.userId);
    if ((count ?? 0) !== 1) return null;
    const name = ctx.horseName?.trim() || "Your horse";
    return {
      key: "first_document_scan",
      title: "Paperwork, digitized",
      message: `No more digging through the glove box. ${name}'s records are filed and searchable.`,
      icon: "📄",
      tier: "warm",
      shareEnabled: false,
    };
  },
};

/**
 * Every horse in a barn has a current (non-expired) coggins.
 * Triggers on document scans (which usually create the coggins row)
 * and on dashboard load (so the celebration can fire after the
 * underlying data shifts, e.g., the barn just got smaller via
 * archival).
 */
const ALL_COGGINS_CURRENT: CelebrationDef = {
  id: "all_coggins_current",
  triggers: ["document_scanned", "dashboard_loaded"],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async check(supabase: SupabaseClient<any>, ctx) {
    if (!ctx.barnId) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: horses } = await (supabase as any)
      .from("horses")
      .select("id, name")
      .eq("barn_id", ctx.barnId)
      .eq("archived", false);
    const horseList = (horses ?? []) as Array<{ id: string; name: string }>;
    if (horseList.length === 0) return null;

    const horseIds = horseList.map((h) => h.id);
    const todayIso = new Date().toISOString().slice(0, 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: docs } = await (supabase as any)
      .from("horse_documents")
      .select("horse_id, expiration_date")
      .in("horse_id", horseIds)
      .ilike("document_type", "%coggins%")
      .not("expiration_date", "is", null)
      .gte("expiration_date", todayIso);
    const docList = (docs ?? []) as Array<{ horse_id: string }>;
    const covered = new Set(docList.map((d) => d.horse_id));
    // Every horse must have at least one valid coggins.
    for (const h of horseList) {
      if (!covered.has(h.id)) return null;
    }

    const barnName = ctx.barnName?.trim() || "Your barn";
    return {
      key: `all_coggins_current_${ctx.barnId}`,
      title: "Show-ready barn",
      message: `Every horse in ${barnName} has a current coggins. That's the kind of barn people trust.`,
      icon: "✅",
      tier: "warm",
      shareEnabled: true,
      shareMessage: `Every horse at ${barnName} is show-ready — all coggins current ✅`,
    };
  },
};

/**
 * First profitable month — fires once per user, on dashboard load,
 * when the most-recently-completed calendar month's revenue exceeded
 * its expenses. The key embeds the month so the audit trail shows
 * which month did it; the "only first" rule is enforced by checking
 * for any prior first_profitable_month_* row.
 */
const FIRST_PROFITABLE_MONTH: CelebrationDef = {
  id: "first_profitable_month",
  triggers: ["dashboard_loaded"],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async check(supabase: SupabaseClient<any>, ctx) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: priorWins } = await (supabase as any)
      .from("user_celebrations")
      .select("celebration_key")
      .eq("user_id", ctx.userId)
      .like("celebration_key", "first_profitable_month_%")
      .limit(1);
    if (((priorWins ?? []) as unknown[]).length > 0) return null;

    // Most-recently-completed calendar month.
    const now = new Date();
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const lastMonthStart = new Date(
      lastMonthEnd.getFullYear(),
      lastMonthEnd.getMonth(),
      1,
    );
    const startIso = lastMonthStart.toISOString().slice(0, 10);
    const endIso = `${lastMonthEnd.toISOString().slice(0, 10)}T23:59:59.999Z`;
    const ymKey = `${lastMonthStart.getFullYear()}_${String(lastMonthStart.getMonth() + 1).padStart(2, "0")}`;

    // Pull the user's barns + horses to scope the financial query.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: barns } = await (supabase as any)
      .from("barns")
      .select("id")
      .eq("owner_id", ctx.userId);
    const barnIds = ((barns ?? []) as Array<{ id: string }>).map((b) => b.id);
    if (barnIds.length === 0) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: horses } = await (supabase as any)
      .from("horses")
      .select("id")
      .in("barn_id", barnIds);
    const horseIds = ((horses ?? []) as Array<{ id: string }>).map((h) => h.id);

    let revenue = 0;
    let expense = 0;

    const collect = async (
      table: "activity_log" | "health_records" | "barn_expenses",
      column: "horse_id" | "barn_id",
      ids: string[],
    ) => {
      if (ids.length === 0) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from(table)
        .select("total_cost, cost_type")
        .in(column, ids)
        .gte("performed_at", startIso)
        .lte("performed_at", endIso);
      for (const r of ((data ?? []) as Array<{
        total_cost: number | null;
        cost_type: string | null;
      }>)) {
        const amt = r.total_cost ?? 0;
        if (r.cost_type === "revenue") revenue += amt;
        else if (r.cost_type === "expense") expense += amt;
      }
    };

    await Promise.all([
      collect("activity_log", "horse_id", horseIds),
      collect("health_records", "horse_id", horseIds),
      collect("barn_expenses", "barn_id", barnIds),
    ]);

    if (revenue <= expense) return null;
    if (revenue === 0) return null; // not "profitable" if literally nothing came in

    const monthName = lastMonthStart.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
    return {
      key: `first_profitable_month_${ymKey}`,
      title: "In the black",
      message: `${monthName} was your first profitable month. That's what good management looks like.`,
      icon: "📈",
      tier: "bold",
      shareEnabled: true,
      shareMessage: "First profitable month in the books 📈",
    };
  },
};

export const CELEBRATIONS: CelebrationDef[] = [
  FIRST_HORSE,
  FIRST_ENTRY,
  STREAK_7,
  STREAK_30,
  BARN_10,
  BARN_25,
  BARN_50,
  ENTRY_100,
  FIRST_DOC_SCAN,
  ALL_COGGINS_CURRENT,
  FIRST_PROFITABLE_MONTH,
];
