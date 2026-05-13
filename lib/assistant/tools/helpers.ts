import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

/**
 * Resolve every barn ID the user can see: owned + active memberships.
 * Used by tools that aggregate across the user's whole world (schedule,
 * financial summary, search).
 *
 * RLS would also filter these, but pre-resolving lets us:
 *   - return empty quickly when the user has zero barns
 *   - apply `.in("barn_id", ids)` for an index-friendly query plan
 */
export async function getUserBarnIds(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string[]> {
  const [ownedRes, memRes] = await Promise.all([
    supabase.from("barns").select("id").eq("owner_id", userId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("barn_members")
      .select("barn_id, status")
      .eq("user_id", userId)
      .or("status.eq.active,status.is.null"),
  ]);

  const ids = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (ownedRes.data ?? []) as any[]) ids.add(b.id as string);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of (memRes.data ?? []) as any[]) ids.add(m.barn_id as string);
  return Array.from(ids);
}

/**
 * Convert a "timeframe" enum into a [start, endInclusive] ISO date pair.
 * Dates are returned as YYYY-MM-DD strings so they match `activity_date`
 * (a date column, not a timestamp).
 */
export function resolveTimeframe(timeframe: string): {
  start: string;
  end: string;
} {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const addDays = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  switch (timeframe) {
    case "today":
      return { start: today, end: today };
    case "this_week": {
      const day = now.getDay(); // 0 = Sun
      const startD = new Date(now);
      startD.setDate(now.getDate() - day);
      const endD = new Date(startD);
      endD.setDate(startD.getDate() + 6);
      return {
        start: startD.toISOString().slice(0, 10),
        end: endD.toISOString().slice(0, 10),
      };
    }
    case "next_30_days":
      return { start: today, end: addDays(30) };
    case "next_7_days":
    default:
      return { start: today, end: addDays(7) };
  }
}

/**
 * Period helper for financial summaries. Returns the inclusive [start, end]
 * date range for an enum value.
 */
export function resolvePeriod(period: string): {
  start: string;
  end: string;
} {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed
  const isoDate = (d: Date) => d.toISOString().slice(0, 10);

  switch (period) {
    case "last_month": {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0); // last day of prev month
      return { start: isoDate(start), end: isoDate(end) };
    }
    case "this_quarter": {
      const q = Math.floor(m / 3);
      const start = new Date(y, q * 3, 1);
      return { start: isoDate(start), end: today };
    }
    case "this_year": {
      return { start: `${y}-01-01`, end: today };
    }
    case "last_30_days": {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      return { start: isoDate(start), end: today };
    }
    case "last_90_days": {
      const start = new Date(now);
      start.setDate(start.getDate() - 90);
      return { start: isoDate(start), end: today };
    }
    case "this_month":
    default: {
      const start = new Date(y, m, 1);
      return { start: isoDate(start), end: today };
    }
  }
}

/** Days between an ISO date string and today. Negative if in the future. */
export function daysAgo(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const then = new Date(isoDate).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (24 * 60 * 60 * 1000));
}
