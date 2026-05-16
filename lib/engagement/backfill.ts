import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-admin";
import { createNotification } from "./notifications/create";

/**
 * One-time backfill of engagement state for existing users.
 *
 * The engagement layer launched after many users had already been
 * happily logging entries, adding horses, and building real history.
 * Without a backfill, their bell is empty and their streak is 0 even
 * though they have weeks of records in the book.
 *
 * What this does (idempotent, runs at most once per user):
 *
 *   1. Computes `current_streak` and `longest_streak` from the user's
 *      historical log dates (activity_log + health_records) and
 *      writes them to profiles.
 *
 *   2. Inserts "already-shown" rows in user_celebrations for any
 *      Phase-1 celebrations whose conditions are met by existing
 *      history (first_horse, first_entry, streak_7, streak_30).
 *      These are silent — we mark them shown so we don't pop a
 *      retro "first horse!" overlay months after the fact.
 *
 *   3. Generates a welcome flight: 2-3 notifications celebrating
 *      what the user has already accomplished. This is what the user
 *      sees in the bell — a real signal that the system is alive.
 *
 * Guarded by a `__backfill_v1` row in user_celebrations; the UNIQUE
 * constraint prevents double-runs even under concurrent dashboard
 * loads.
 */

const BACKFILL_KEY = "__backfill_v1";

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function prevDayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function isOneDayApart(earlier: string, later: string): boolean {
  return prevDayOf(later) === earlier;
}

export async function runBackfillIfNeeded(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();

    // ── Guard: claim the backfill slot. INSERT with ON-CONFLICT-via
    //    -unique-violation means at most one call ever proceeds.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: claim, error: claimErr } = await (admin as any)
      .from("user_celebrations")
      .insert({
        user_id: userId,
        celebration_key: BACKFILL_KEY,
      })
      .select("id")
      .maybeSingle();
    if (claimErr) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((claimErr as any).code === "23505") return; // already ran
      console.warn("[engagement.backfill] claim failed", claimErr.message);
      return;
    }
    if (!claim) return;

    // ── 1. Compute streak from log history ────────────────────────
    const [actRes, hltRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any)
        .from("activity_log")
        .select("created_at")
        .eq("logged_by", userId)
        .limit(10000),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (admin as any)
        .from("health_records")
        .select("created_at")
        .eq("logged_by", userId)
        .limit(10000),
    ]);
    const dateSet = new Set<string>();
    for (const r of [
      ...((actRes.data ?? []) as Array<{ created_at: string }>),
      ...((hltRes.data ?? []) as Array<{ created_at: string }>),
    ]) {
      if (r.created_at) dateSet.add(r.created_at.slice(0, 10));
    }
    const sortedDates = [...dateSet].sort();

    let longest = 0;
    let run = 0;
    let prev: string | null = null;
    for (const d of sortedDates) {
      if (prev && isOneDayApart(prev, d)) {
        run += 1;
      } else {
        run = 1;
      }
      if (run > longest) longest = run;
      prev = d;
    }

    const today = todayUTC();
    const yesterday = yesterdayUTC();
    let currentStreak = 0;
    let anchor: string | null = null;
    if (dateSet.has(today)) anchor = today;
    else if (dateSet.has(yesterday)) anchor = yesterday;
    if (anchor) {
      let cursor: string | null = anchor;
      while (cursor && dateSet.has(cursor)) {
        currentStreak += 1;
        cursor = prevDayOf(cursor);
      }
    }

    const lastActive = sortedDates.length > 0
      ? sortedDates[sortedDates.length - 1]
      : null;

    // Write streak fields if anything changed. Don't overwrite a
    // higher current_streak — a user who logged in the past 60s
    // already had the live updater bump them, which can race with
    // this backfill. Take the max.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: priorProfile } = await (admin as any)
      .from("profiles")
      .select("current_streak, longest_streak, last_active_date")
      .eq("id", userId)
      .maybeSingle();
    const priorCurrent = (priorProfile?.current_streak as number | null) ?? 0;
    const priorLongest = (priorProfile?.longest_streak as number | null) ?? 0;
    const priorLastActive = (priorProfile?.last_active_date as string | null) ?? null;

    const nextCurrent = Math.max(priorCurrent, currentStreak);
    const nextLongest = Math.max(priorLongest, longest);
    const nextLastActive =
      lastActive && (!priorLastActive || lastActive > priorLastActive)
        ? lastActive
        : priorLastActive;

    if (
      nextCurrent !== priorCurrent ||
      nextLongest !== priorLongest ||
      nextLastActive !== priorLastActive
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any)
        .from("profiles")
        .update({
          current_streak: nextCurrent,
          longest_streak: nextLongest,
          last_active_date: nextLastActive,
        })
        .eq("id", userId);
    }

    // ── 2. Silently mark past celebrations as already shown ───────
    const totalEntries =
      ((actRes.data ?? []) as unknown[]).length +
      ((hltRes.data ?? []) as unknown[]).length;
    const silentKeys: string[] = [];
    if (totalEntries > 0) silentKeys.push("first_entry");
    if (nextLongest >= 7) silentKeys.push("streak_7");
    if (nextLongest >= 30) silentKeys.push("streak_30");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: horseCount } = await (admin as any)
      .from("horses")
      .select("id", { count: "exact", head: true })
      .eq("created_by", userId)
      .eq("archived", false);
    if ((horseCount ?? 0) > 0) silentKeys.push("first_horse");

    if (silentKeys.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (admin as any)
        .from("user_celebrations")
        .upsert(
          silentKeys.map((key) => ({
            user_id: userId,
            celebration_key: key,
          })),
          { onConflict: "user_id,celebration_key", ignoreDuplicates: true },
        );
    }

    // ── 3. Welcome flight of notifications ────────────────────────
    // First: the friendly "welcome to your inbox" pin.
    await createNotification({
      userId,
      type: "system",
      title: "Welcome aboard 🐴",
      body:
        "BarnBook will let you know about activity in your barns, paperwork coming due, and milestones you hit. This is your spot for it.",
      icon: "🛎️",
      link: "/settings",
      priority: 8,
    });

    // Second: stats summary if there's anything interesting to say.
    const facts: string[] = [];
    if ((horseCount ?? 0) > 0) {
      facts.push(`${horseCount} ${horseCount === 1 ? "horse" : "horses"}`);
    }
    if (totalEntries > 0) {
      facts.push(
        `${totalEntries.toLocaleString()} ${totalEntries === 1 ? "entry" : "entries"} logged`,
      );
    }
    if (facts.length > 0) {
      const body =
        nextLongest >= 2
          ? `${facts.join(" · ")}. Your record streak is ${nextLongest} ${nextLongest === 1 ? "day" : "days"}.`
          : `${facts.join(" · ")}.`;
      await createNotification({
        userId,
        type: "system",
        title: "By the numbers",
        body,
        icon: "📊",
        link: "/dashboard",
        priority: 7,
      });
    }

    // Third: a streak callout when the user has a notable record.
    if (nextLongest >= 7) {
      const isCurrent = nextCurrent >= 7;
      await createNotification({
        userId,
        type: "milestone",
        title: isCurrent
          ? `🔥 ${nextCurrent}-day streak going`
          : `🔥 Personal best: ${nextLongest} days`,
        body: isCurrent
          ? "Log an entry today to keep it alive."
          : "Start logging again to push it higher.",
        icon: "🔥",
        link: "/dashboard",
        priority: 6,
      });
    }
  } catch (err) {
    console.warn(
      "[engagement.backfill] failed",
      (err as Error).message,
    );
  }
}
