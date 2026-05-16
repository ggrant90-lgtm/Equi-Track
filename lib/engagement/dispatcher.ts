import type { SupabaseClient } from "@supabase/supabase-js";
import { updateStreakForUser, type StreakResult } from "./streak";
import {
  checkCelebrations,
  type CelebrationFire,
} from "./celebrations";
import type { EngagementEvent } from "./celebrations/defs";
import {
  createNotification,
  recipientsForBarn,
  isCategoryEnabledForUser,
} from "./notifications/create";

/**
 * Engagement dispatcher — single entry point.
 *
 * Server actions that mutate user-facing state (log create, horse
 * create, key redeem, document scan) call `runEngagementHooks` after
 * their main work succeeds. The dispatcher decides which streak
 * update, which celebration checks, and which notification fanouts
 * to run based on the event type.
 *
 * Calls are awaited so the page revalidate sees the latest streak
 * and any newly-fired celebrations get queued — but the entire body
 * is wrapped in a top-level try/catch, so engagement failures NEVER
 * break the user's action.
 *
 * Returns the celebrations that fired (zero or more), so the caller
 * can hand them to the CelebrationProvider on the client.
 */

export interface EngagementInput {
  userId: string;
  event: EngagementEvent;
  barnId?: string;
  horseId?: string;
  /** Display names for celebrations to template into. Optional —
   *  defs fall back to generic copy when missing. */
  horseName?: string;
  barnName?: string;
  /** For log_created: name of the actor (for activity notifications
   *  to other users). */
  actorName?: string;
  /** For log_created: type of the log entry (e.g., "shoeing"). */
  logType?: string;
}

export interface EngagementResult {
  celebrations: CelebrationFire[];
  streak: StreakResult | null;
}

export async function runEngagementHooks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  input: EngagementInput,
): Promise<EngagementResult> {
  const result: EngagementResult = { celebrations: [], streak: null };
  try {
    // 1. Streak update on log_created — must run before celebration
    //    checks so streak_7 / streak_30 see the new value.
    if (input.event === "log_created") {
      result.streak = await updateStreakForUser(supabase, input.userId);
    }

    // 2. Celebration checks — registry-driven, only those whose
    //    triggers include the current event run.
    result.celebrations = await checkCelebrations(supabase, {
      userId: input.userId,
      event: input.event,
      barnId: input.barnId,
      horseId: input.horseId,
      horseName: input.horseName,
      barnName: input.barnName,
      streak: result.streak,
    });

    // 3. Notification fanout — log_created notifies the barn owner.
    //    Fire-and-forget; not awaited for the result to return.
    if (input.event === "log_created" && input.barnId) {
      void fanoutActivityNotification(supabase, input).catch((err) => {
        console.warn(
          "[engagement.dispatcher] activity fanout failed",
          (err as Error).message,
        );
      });
    }
  } catch (err) {
    // Top-level safety net. Engagement is best-effort.
    console.warn(
      "[engagement.dispatcher] hook failed",
      (err as Error).message,
    );
  }
  return result;
}

async function fanoutActivityNotification(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  input: EngagementInput,
): Promise<void> {
  if (!input.barnId) return;
  const recipients = await recipientsForBarn(
    supabase,
    input.barnId,
    input.userId,
  );
  if (recipients.length === 0) return;

  const actor = input.actorName?.trim() || "A teammate";
  const horse = input.horseName?.trim() || "a horse";
  const verbType = input.logType?.trim() || "entry";
  const dateKey = new Date().toISOString().slice(0, 10);

  for (const recipientId of recipients) {
    const enabled = await isCategoryEnabledForUser(
      supabase,
      recipientId,
      "activity",
    );
    if (!enabled) continue;

    await createNotification({
      userId: recipientId,
      type: "activity",
      title: `${actor} logged a ${verbType}`,
      body: `New entry on ${horse}.`,
      icon: "🪪",
      link: input.horseId ? `/horses/${input.horseId}` : undefined,
      relatedBarnId: input.barnId,
      relatedHorseId: input.horseId,
      groupKey: `activity:${input.userId}:${dateKey}`,
      groupTitleAt: (count) => `${actor} logged ${count} entries today`,
      groupBodyAt: (count) =>
        `${count} new entries in your barn from ${actor}.`,
    });
  }
}
