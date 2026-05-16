import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase-admin";
import { createNotification } from "./create";

/**
 * Scheduled notification checks. Phase 1 covers coggins expirations.
 * Future phases add weekly financial summaries and overdue routine
 * activity nudges.
 *
 * These run on dashboard load — there's no cron yet. To avoid
 * regenerating the same reminder every page visit, each kind of
 * scheduled check writes a per-window-bucket guard notification with
 * a unique `group_key`; the coalescing logic in `create.ts` means a
 * second attempt within the same window is a no-op.
 *
 * Performance: each call is at most one barn query + one horse-
 * document query, both indexed. Targeted ~50ms p95 even with
 * generous horse counts.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function todayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoWeekKey(d: Date): string {
  // YYYY-WW (ISO week number, approximate — fine for grouping)
  const year = d.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const week = Math.floor(
    ((d.getTime() - start.getTime()) / DAY_MS + start.getUTCDay() + 1) / 7,
  );
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/**
 * Look for coggins documents that will expire within the next
 * 14 days (and ones that already expired today). One coalesced
 * reminder per user per week.
 */
export async function runCogginsExpiryCheck(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<void> {
  try {
    // Use the admin client for reads too here — we're scanning the
    // user's horses + their documents, all already RLS-permitted by
    // ownership, but the admin client sidesteps any join-policy edge
    // cases on horse_documents.
    const admin = createAdminClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ownedBarns } = await (admin as any)
      .from("barns")
      .select("id")
      .eq("owner_id", userId);
    const barnIds = ((ownedBarns ?? []) as Array<{ id: string }>).map(
      (b) => b.id,
    );
    if (barnIds.length === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: horses } = await (admin as any)
      .from("horses")
      .select("id, name, barn_id")
      .in("barn_id", barnIds)
      .eq("archived", false);
    const horseList = (horses ?? []) as Array<{
      id: string;
      name: string;
      barn_id: string;
    }>;
    if (horseList.length === 0) return;
    const horseIds = horseList.map((h) => h.id);

    // Find coggins documents whose expiration is within the next 14
    // days, or expired today. coggins is a document_type — schema
    // varies in this codebase; we filter by case-insensitive match.
    const today = todayUTC();
    const horizon = new Date(today.getTime() + 14 * DAY_MS);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: docs } = await (admin as any)
      .from("horse_documents")
      .select("horse_id, document_type, expires_on")
      .in("horse_id", horseIds)
      .ilike("document_type", "%coggins%")
      .not("expires_on", "is", null)
      .lte("expires_on", isoDate(horizon))
      .order("expires_on", { ascending: true });
    const docList = (docs ?? []) as Array<{
      horse_id: string;
      expires_on: string;
    }>;
    if (docList.length === 0) return;

    // Use the latest expiration date per horse (a horse may have
    // multiple coggins documents over time; the newest one is the
    // operative document).
    const latestByHorse = new Map<string, string>();
    for (const d of docList) {
      const prior = latestByHorse.get(d.horse_id);
      if (!prior || d.expires_on > prior) {
        latestByHorse.set(d.horse_id, d.expires_on);
      }
    }
    const horseMap = new Map(horseList.map((h) => [h.id, h]));
    const todayIso = isoDate(today);

    type Item = {
      horseId: string;
      horseName: string;
      expiresOn: string;
      daysUntil: number;
    };
    const items: Item[] = [];
    for (const [horseId, expiresOn] of latestByHorse.entries()) {
      const h = horseMap.get(horseId);
      if (!h) continue;
      const daysUntil = Math.floor(
        (new Date(expiresOn).getTime() - today.getTime()) / DAY_MS,
      );
      if (expiresOn < todayIso) {
        // Already expired before today — too stale to nag every load.
        // We surface only "today or in the next 14 days."
        continue;
      }
      items.push({
        horseId,
        horseName: h.name,
        expiresOn,
        daysUntil,
      });
    }
    if (items.length === 0) return;

    // One coalesced reminder per user per week.
    const groupKey = `coggins_expiring:${userId}:${isoWeekKey(today)}`;
    items.sort((a, b) => a.daysUntil - b.daysUntil);
    const soonest = items[0];
    const title =
      items.length === 1
        ? soonest.daysUntil === 0
          ? `${soonest.horseName}'s coggins expires today`
          : `${soonest.horseName}'s coggins expires in ${soonest.daysUntil} ${soonest.daysUntil === 1 ? "day" : "days"}`
        : `${items.length} coggins expiring soon`;
    const body =
      items.length === 1
        ? `Expires ${soonest.expiresOn}.`
        : `Soonest: ${soonest.horseName} on ${soonest.expiresOn}.`;

    await createNotification({
      userId,
      type: "reminder",
      title,
      body,
      icon: "📅",
      link: `/horses/${soonest.horseId}`,
      relatedHorseId: soonest.horseId,
      relatedBarnId: horseMap.get(soonest.horseId)?.barn_id,
      groupKey,
      groupTitleAt: (count) => `${count} coggins expiring soon`,
      groupBodyAt: (count) =>
        `${count} horses have coggins due in the next 14 days.`,
      priority: 9,
    });
  } catch (err) {
    console.warn(
      "[engagement.notifications] coggins check failed",
      (err as Error).message,
    );
  }
}
