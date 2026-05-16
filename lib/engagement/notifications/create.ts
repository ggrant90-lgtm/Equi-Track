import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-admin";

/**
 * Notification creation with coalescing.
 *
 * The engagement layer fans out notifications to other users (the
 * barn owner gets pinged when a teammate logs an entry) and to the
 * user themselves (coggins reminders, financial summaries). Writes
 * always go through the admin client so cross-user fanout works —
 * regular RLS would forbid one user from inserting a row keyed to
 * another user.
 *
 * Coalescing: every notification carries a `group_key`. If an unread
 * notification with the same key exists in the user's feed, we bump
 * its counter and rewrite the title/body in place rather than
 * inserting a second row. This is how "Jake logged 4 entries today"
 * stays a single line in the feed.
 *
 * Daily cap: we don't insert more than 10 notifications per user per
 * UTC day. When the cap is hit, low-priority types (`tip`,
 * `financial`) are dropped silently; reminders + activity still try
 * (they're more useful) but eventually also get dropped.
 */

export type NotificationType =
  | "activity"
  | "milestone"
  | "reminder"
  | "financial"
  | "tip"
  | "system";

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  icon?: string;
  link?: string;
  relatedBarnId?: string;
  relatedHorseId?: string;
  /** Coalescing key — when set, an unread match within 24h is updated
   *  in place instead of creating a new row. */
  groupKey?: string;
  /** When grouping, the title/body templates receive the current count
   *  (entries seen so far). Provide a function so the wording can vary
   *  between 2 and 4+. */
  groupTitleAt?: (count: number) => string;
  groupBodyAt?: (count: number) => string;
  /** Soft priority — higher wins when the daily cap is hit.
   *  Default: reminders 10, activity 7, milestone 5, system 4, financial 3, tip 1. */
  priority?: number;
}

const DEFAULT_PRIORITY: Record<NotificationType, number> = {
  reminder: 10,
  activity: 7,
  milestone: 5,
  system: 4,
  financial: 3,
  tip: 1,
};

const DAILY_CAP = 10;

function todayUTCStart(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Best-effort insert. Never throws. Returns the inserted/updated
 * notification id when successful, null on cap-hit or failure.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const priority = input.priority ?? DEFAULT_PRIORITY[input.type];

    // ── Coalesce first when a group key is supplied ─────────────────
    if (input.groupKey) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (admin as any)
        .from("notifications")
        .select("id, group_count")
        .eq("user_id", input.userId)
        .eq("group_key", input.groupKey)
        .eq("is_read", false)
        .gte("created_at", todayUTCStart())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        const nextCount = (existing.group_count as number) + 1;
        const nextTitle =
          input.groupTitleAt?.(nextCount) ?? input.title;
        const nextBody = input.groupBodyAt?.(nextCount) ?? input.body;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any)
          .from("notifications")
          .update({
            title: nextTitle,
            body: nextBody,
            group_count: nextCount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        return existing.id as string;
      }
    }

    // ── Daily cap check ─────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: todayCount } = await (admin as any)
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .gte("created_at", todayUTCStart());
    if ((todayCount ?? 0) >= DAILY_CAP) {
      // Drop low-priority items silently when over cap.
      if (priority < 5) return null;
    }

    // ── Insert ──────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin as any)
      .from("notifications")
      .insert({
        user_id: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        icon: input.icon ?? null,
        link: input.link ?? null,
        related_barn_id: input.relatedBarnId ?? null,
        related_horse_id: input.relatedHorseId ?? null,
        group_key: input.groupKey ?? null,
        group_count: 1,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      console.warn(
        "[engagement.notifications] insert failed",
        error.message,
      );
      return null;
    }
    return (data?.id as string) ?? null;
  } catch (err) {
    console.warn(
      "[engagement.notifications] unexpected error",
      (err as Error).message,
    );
    return null;
  }
}

/**
 * Returns the user_ids of recipients for a barn-scoped notification,
 * excluding the actor. Phase 1: owner only. Phase 2 can expand to
 * editor members based on prefs.
 */
export async function recipientsForBarn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  barnId: string,
  actorUserId: string,
): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: barn } = await (supabase as any)
    .from("barns")
    .select("owner_id")
    .eq("id", barnId)
    .maybeSingle();
  const ownerId = (barn?.owner_id as string | null) ?? null;
  if (!ownerId) return [];
  if (ownerId === actorUserId) return [];
  return [ownerId];
}

/**
 * Check the recipient's notification_prefs JSON for a given category.
 * Unset keys default to true (opt-out, not opt-in).
 */
export async function isCategoryEnabledForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
  category: "activity" | "reminders" | "financial" | "tips",
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("profiles")
    .select("notifications_enabled, notification_prefs")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return false;
  if (data.notifications_enabled === false) return false;
  const prefs = (data.notification_prefs ?? {}) as Record<string, boolean>;
  return prefs[category] !== false;
}
