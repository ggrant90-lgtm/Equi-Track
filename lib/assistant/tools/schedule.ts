import type { AssistantTool } from "./types";
import { getUserBarnIds, resolveTimeframe } from "./helpers";

export const getUpcomingSchedule: AssistantTool = {
  definition: {
    name: "get_upcoming_schedule",
    description:
      "Get upcoming planned/scheduled events across the user's barns. Use for 'what's on the schedule', 'today's appointments', 'this week's vet visits' questions.",
    input_schema: {
      type: "object",
      properties: {
        timeframe: {
          type: "string",
          enum: ["today", "this_week", "next_7_days", "next_30_days"],
          description: "Time window. Default next_7_days.",
        },
        barn_id: {
          type: "string",
          description: "Optional: limit to a specific barn",
        },
        horse_id: {
          type: "string",
          description: "Optional: limit to a specific horse",
        },
        entry_type: {
          type: "string",
          description: "Optional: filter by activity type (vet, shoeing, etc.)",
        },
      },
    },
  },
  handler: async (input, ctx) => {
    const args = (input ?? {}) as {
      timeframe?: string;
      barn_id?: string;
      horse_id?: string;
      entry_type?: string;
    };
    const { start, end } = resolveTimeframe(args.timeframe ?? "next_7_days");

    const barnIds = args.barn_id
      ? [args.barn_id]
      : await getUserBarnIds(ctx.supabase, ctx.userId);
    if (barnIds.length === 0) return { entries: [] };

    let q = ctx.supabase
      .from("activity_log")
      .select(
        "id, activity_type, title, notes, activity_date, performed_at, performed_by_name, horse_id, barn_id, horses(name), barns(name)",
      )
      .eq("status", "planned")
      .gte("activity_date", start)
      .lte("activity_date", end)
      .in("barn_id", barnIds)
      .order("activity_date", { ascending: true })
      .limit(50);

    if (args.horse_id) q = q.eq("horse_id", args.horse_id);
    if (args.entry_type) q = q.eq("activity_type", args.entry_type);

    const { data, error } = await q;
    if (error) return { entries: [], error: "Couldn't load schedule." };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entries = ((data ?? []) as any[]).map((r) => ({
      id: r.id as string,
      type: r.activity_type as string | null,
      title: r.title as string | null,
      notes: r.notes as string | null,
      date: r.activity_date as string | null,
      performed_at: r.performed_at as string | null,
      performed_by: r.performed_by_name as string | null,
      horse_id: r.horse_id as string | null,
      horse_name: (r.horses?.name as string | null) ?? null,
      barn_id: r.barn_id as string | null,
      barn_name: (r.barns?.name as string | null) ?? null,
    }));

    return { entries, range: { start, end } };
  },
};

export const searchLogEntries: AssistantTool = {
  definition: {
    name: "search_log_entries",
    description:
      "Search across log entries by keyword in notes, by activity type, by performer name, or by horse. Use this when the user wants to find something specific across their history.",
    input_schema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description: "Optional: search in notes or title",
        },
        entry_type: { type: "string", description: "Optional activity type filter" },
        performer_name: {
          type: "string",
          description: "Optional: filter by who performed the work",
        },
        horse_name: {
          type: "string",
          description: "Optional: filter by horse name (partial match)",
        },
        barn_id: { type: "string", description: "Optional: limit to a barn" },
        days_back: {
          type: "number",
          description: "Optional: how many days back to search. Default 365.",
        },
        limit: {
          type: "number",
          description: "Optional: max results. Default 20, max 50.",
        },
      },
    },
  },
  handler: async (input, ctx) => {
    const args = (input ?? {}) as {
      keyword?: string;
      entry_type?: string;
      performer_name?: string;
      horse_name?: string;
      barn_id?: string;
      days_back?: number;
      limit?: number;
    };

    const daysBack = Math.max(1, Math.min(args.days_back ?? 365, 3650));
    const limit = Math.max(1, Math.min(args.limit ?? 20, 50));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffIso = cutoff.toISOString().slice(0, 10);

    const barnIds = args.barn_id
      ? [args.barn_id]
      : await getUserBarnIds(ctx.supabase, ctx.userId);
    if (barnIds.length === 0) return { entries: [] };

    let q = ctx.supabase
      .from("activity_log")
      .select(
        "id, activity_type, title, notes, activity_date, performed_at, performed_by_name, total_cost, horse_id, barn_id, horses(name), barns(name)",
      )
      .gte("activity_date", cutoffIso)
      .in("barn_id", barnIds)
      .order("activity_date", { ascending: false })
      .limit(limit);

    if (args.entry_type) q = q.eq("activity_type", args.entry_type);
    if (args.performer_name)
      q = q.ilike("performed_by_name", `%${args.performer_name}%`);
    if (args.keyword) {
      // Match keyword in notes OR title
      q = q.or(`notes.ilike.%${args.keyword}%,title.ilike.%${args.keyword}%`);
    }

    const { data, error } = await q;
    if (error) return { entries: [], error: "Couldn't search entries." };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rows = ((data ?? []) as any[]).map((r) => ({
      id: r.id as string,
      type: r.activity_type as string | null,
      title: r.title as string | null,
      notes: r.notes as string | null,
      date: r.activity_date as string | null,
      performed_at: r.performed_at as string | null,
      performed_by: r.performed_by_name as string | null,
      cost: r.total_cost == null ? null : Number(r.total_cost),
      horse_id: r.horse_id as string | null,
      horse_name: (r.horses?.name as string | null) ?? null,
      barn_id: r.barn_id as string | null,
      barn_name: (r.barns?.name as string | null) ?? null,
    }));

    // Post-filter horse name (cheap, small result set already capped by limit)
    if (args.horse_name) {
      const needle = args.horse_name.toLowerCase();
      rows = rows.filter((r) =>
        (r.horse_name ?? "").toLowerCase().includes(needle),
      );
    }

    return { entries: rows };
  },
};
