"use server";

import { createServerComponentClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

/**
 * Settings actions for the engagement notification preferences.
 *
 * `notification_prefs` is a JSONB column keyed by category. The four
 * categories we read in Phase 1 are: activity, reminders, financial,
 * tips. Unset keys default to true (opt-out, not opt-in) so existing
 * users keep getting reminders without having to flip anything.
 *
 * The master `notifications_enabled` toggle short-circuits all
 * categories — set it false and no notifications fire, regardless of
 * per-category state.
 */

export async function updateNotificationPrefsAction(
  _prev: { error?: string; ok?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const master = formData.get("notifications_enabled") === "on";
  const activity = formData.get("activity") === "on";
  const reminders = formData.get("reminders") === "on";
  const financial = formData.get("financial") === "on";
  const tips = formData.get("tips") === "on";

  const prefs = { activity, reminders, financial, tips };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("profiles")
    .update({
      notifications_enabled: master,
      notification_prefs: prefs,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
