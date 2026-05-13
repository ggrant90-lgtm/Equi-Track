import type { AssistantTool } from "./types";
import { businessProGate } from "./types";
import { getUserBarnIds, resolvePeriod, daysAgo } from "./helpers";

export const getFinancialSummary: AssistantTool = {
  definition: {
    name: "get_financial_summary",
    description:
      "Get a financial summary: revenue, expenses, net income, outstanding receivables. Business Pro only — returns a gated marker when the user lacks access.",
    input_schema: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: [
            "this_month",
            "last_month",
            "this_quarter",
            "this_year",
            "last_30_days",
            "last_90_days",
          ],
          description: "Time period. Default this_month.",
        },
        barn_id: {
          type: "string",
          description: "Optional: limit to a specific barn",
        },
      },
    },
  },
  handler: async (input, ctx) => {
    if (!ctx.hasBusinessPro) return businessProGate;

    const args = (input ?? {}) as { period?: string; barn_id?: string };
    const { start, end } = resolvePeriod(args.period ?? "this_month");

    const barnIds = args.barn_id
      ? [args.barn_id]
      : await getUserBarnIds(ctx.supabase, ctx.userId);
    if (barnIds.length === 0) {
      return { period: { start, end }, revenue: 0, expenses: 0, net: 0, outstanding: 0 };
    }

    // Pull the rows we need; aggregations done in JS for clarity and
    // because PostgREST aggregate functions add a per-call surface area
    // I'd rather not introduce in v1.
    const { data, error } = await ctx.supabase
      .from("activity_log")
      .select("total_cost, cost_type, payment_status, paid_amount, activity_date")
      .in("barn_id", barnIds)
      .gte("activity_date", start)
      .lte("activity_date", end)
      .not("cost_type", "is", null);

    if (error) return { error: "Couldn't load financial data." };

    let revenue = 0;
    let expenses = 0;
    let passThrough = 0;
    let outstanding = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (data ?? []) as any[]) {
      const amt = Number(r.total_cost ?? 0);
      const paid = Number(r.paid_amount ?? 0);
      if (r.cost_type === "revenue") revenue += amt;
      else if (r.cost_type === "expense") expenses += amt;
      else if (r.cost_type === "pass_through") passThrough += amt;

      if (
        (r.cost_type === "revenue" || r.cost_type === "pass_through") &&
        (r.payment_status === "unpaid" || r.payment_status === "partial")
      ) {
        outstanding += Math.max(0, amt - paid);
      }
    }

    return {
      period: { start, end },
      revenue: Math.round(revenue * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      net: Math.round((revenue - expenses) * 100) / 100,
      pass_through: Math.round(passThrough * 100) / 100,
      outstanding: Math.round(outstanding * 100) / 100,
    };
  },
};

interface ReceivableRow {
  total: number;
  oldest_date: string | null;
  entry_count: number;
}

export const getOutstandingReceivables: AssistantTool = {
  definition: {
    name: "get_outstanding_receivables",
    description:
      "Get a list of who owes the user money, grouped by person, with the total they owe and how long the oldest balance has been outstanding. Business Pro only.",
    input_schema: {
      type: "object",
      properties: {
        barn_id: {
          type: "string",
          description: "Optional: limit to a specific barn",
        },
      },
    },
  },
  handler: async (input, ctx) => {
    if (!ctx.hasBusinessPro) return businessProGate;

    const args = (input ?? {}) as { barn_id?: string };
    const barnIds = args.barn_id
      ? [args.barn_id]
      : await getUserBarnIds(ctx.supabase, ctx.userId);
    if (barnIds.length === 0) return { receivables: [], total: 0 };

    const { data, error } = await ctx.supabase
      .from("activity_log")
      .select(
        "total_cost, paid_amount, payment_status, cost_type, activity_date, billable_to_user_id, billable_to_name",
      )
      .in("barn_id", barnIds)
      .in("cost_type", ["revenue", "pass_through"])
      .in("payment_status", ["unpaid", "partial"]);

    if (error) return { error: "Couldn't load receivables." };

    const grouped = new Map<string, ReceivableRow & { name: string; user_id: string | null }>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (data ?? []) as any[]) {
      const amt = Number(r.total_cost ?? 0);
      const paid = Number(r.paid_amount ?? 0);
      const owed = Math.max(0, amt - paid);
      if (owed <= 0) continue;
      const userId = (r.billable_to_user_id as string | null) ?? null;
      const name = (r.billable_to_name as string | null) ?? "Unspecified";
      const key = userId ? `u:${userId}` : `n:${name}`;
      const existing = grouped.get(key);
      const date = r.activity_date as string | null;
      if (existing) {
        existing.total += owed;
        existing.entry_count += 1;
        if (
          date &&
          (!existing.oldest_date || date < existing.oldest_date)
        ) {
          existing.oldest_date = date;
        }
      } else {
        grouped.set(key, {
          name,
          user_id: userId,
          total: owed,
          oldest_date: date,
          entry_count: 1,
        });
      }
    }

    const receivables = Array.from(grouped.values())
      .map((r) => ({
        name: r.name,
        user_id: r.user_id,
        total: Math.round(r.total * 100) / 100,
        oldest_date: r.oldest_date,
        oldest_days: daysAgo(r.oldest_date),
        entry_count: r.entry_count,
      }))
      .sort((a, b) => b.total - a.total);

    const total = receivables.reduce((sum, r) => sum + r.total, 0);

    return {
      receivables,
      total: Math.round(total * 100) / 100,
    };
  },
};
