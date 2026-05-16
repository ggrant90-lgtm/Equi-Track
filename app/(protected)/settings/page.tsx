import { createServerComponentClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { NotificationPrefsForm } from "./NotificationPrefsForm";

/**
 * Settings landing. Phase 1 ships the notification-preferences
 * section; more sections (timezone, accessibility, etc.) plug in here
 * later.
 */
export default async function SettingsPage() {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select(
      "notifications_enabled, notification_prefs, nudges_disabled, current_streak, longest_streak",
    )
    .eq("id", user.id)
    .maybeSingle();

  const masterEnabled = profile?.notifications_enabled !== false;
  const prefs = (profile?.notification_prefs ?? {}) as Record<string, boolean>;
  const initial = {
    masterEnabled,
    activity: prefs.activity !== false,
    reminders: prefs.reminders !== false,
    financial: prefs.financial !== false,
    tips: prefs.tips !== false,
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="font-serif text-3xl font-semibold text-barn-dark">
        Settings
      </h1>
      <p className="mt-2 text-barn-dark/65">
        App preferences and notifications.
      </p>

      <section className="mt-8">
        <h2 className="font-serif text-xl font-semibold text-barn-dark">
          Notifications
        </h2>
        <p className="mt-1 text-sm text-barn-dark/65">
          Choose which kinds of notifications show up in your bell. You can
          always turn them all off with the master switch.
        </p>
        <div className="mt-4 rounded-2xl border border-barn-dark/10 bg-white p-5">
          <NotificationPrefsForm initial={initial} />
        </div>
      </section>
    </div>
  );
}
