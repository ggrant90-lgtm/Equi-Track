"use server";

import { createServerComponentClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

/**
 * Per-user UI preferences action.
 *
 * Writes to profiles.ui_prefs (JSONB). All keys treat absence as "on"
 * on the read path, so passing `false` is the only way to hide a
 * widget. This keeps the schema future-proof without per-widget
 * migrations.
 */
export type UiPrefsState = { ok?: boolean; error?: string };

export async function updateUiPrefsAction(
  _prev: UiPrefsState | null,
  formData: FormData,
): Promise<UiPrefsState> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const prefs = {
    show_health_ring: formData.get("show_health_ring") === "on",
    show_streak_chip: formData.get("show_streak_chip") === "on",
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("profiles")
    .update({
      ui_prefs: prefs,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) return { error: error.message };

  // Re-render the dashboard so the strip picks up the change immediately.
  revalidatePath("/dashboard");
  revalidatePath("/settings");
  return { ok: true };
}
