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

export const CELEBRATIONS: CelebrationDef[] = [
  FIRST_HORSE,
  FIRST_ENTRY,
  STREAK_7,
  STREAK_30,
];
