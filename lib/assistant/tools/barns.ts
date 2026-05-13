import type { AssistantTool } from "./types";
import { getUserBarnIds } from "./helpers";

export const getUserBarns: AssistantTool = {
  definition: {
    name: "get_user_barns",
    description:
      "List all barns the user owns and barns they have key access to, with summary info: type, plan, horse count, role.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  handler: async (_input, ctx) => {
    const [ownedRes, memRes] = await Promise.all([
      ctx.supabase
        .from("barns")
        .select(
          "id, name, barn_type, plan_tier, base_stalls, grace_period_ends_at, created_at",
        )
        .eq("owner_id", ctx.userId)
        .order("created_at", { ascending: true }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx.supabase as any)
        .from("barn_members")
        .select(
          "role, status, barns(id, name, barn_type, plan_tier, base_stalls)",
        )
        .eq("user_id", ctx.userId)
        .or("status.eq.active,status.is.null"),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const owned = ((ownedRes.data ?? []) as any[]).map((b) => ({
      id: b.id as string,
      name: b.name as string,
      barn_type: b.barn_type as string,
      plan_tier: b.plan_tier as string,
      base_stalls: b.base_stalls as number | null,
      grace_period_ends_at: b.grace_period_ends_at as string | null,
      access: "owner" as const,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const access = ((memRes.data ?? []) as any[])
      .filter((m) => m.barns)
      .map((m) => ({
        id: m.barns.id as string,
        name: m.barns.name as string,
        barn_type: m.barns.barn_type as string,
        plan_tier: m.barns.plan_tier as string,
        base_stalls: m.barns.base_stalls as number | null,
        grace_period_ends_at: null,
        access: (m.role as string) ?? "viewer",
      }));

    // Horse counts for everything in one query.
    const allIds = [...owned.map((b) => b.id), ...access.map((b) => b.id)];
    const horseCounts: Record<string, number> = {};
    if (allIds.length) {
      const { data: counts } = await ctx.supabase
        .from("horses")
        .select("barn_id")
        .in("barn_id", allIds)
        .eq("archived", false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const h of (counts ?? []) as any[]) {
        horseCounts[h.barn_id] = (horseCounts[h.barn_id] ?? 0) + 1;
      }
    }

    return {
      owned: owned.map((b) => ({
        ...b,
        horse_count: horseCounts[b.id] ?? 0,
      })),
      access: access.map((b) => ({
        ...b,
        horse_count: horseCounts[b.id] ?? 0,
      })),
    };
  },
};

export const getBarnSummary: AssistantTool = {
  definition: {
    name: "get_barn_summary",
    description:
      "Get a summary overview of a specific barn: horse count, member count, recent activity, and capacity (horses vs base stalls).",
    input_schema: {
      type: "object",
      properties: {
        barn_id: { type: "string", description: "The barn's ID" },
      },
      required: ["barn_id"],
    },
  },
  handler: async (input, ctx) => {
    const args = (input ?? {}) as { barn_id?: string };
    if (!args.barn_id) return { error: "barn_id is required" };

    // Confirm access first (RLS would also block, but a friendly error is
    // better than an empty result).
    const userBarnIds = await getUserBarnIds(ctx.supabase, ctx.userId);
    if (!userBarnIds.includes(args.barn_id)) {
      return { error: "You don't have access to that barn." };
    }

    const [barnRes, horsesRes, membersRes, recentRes] = await Promise.all([
      ctx.supabase
        .from("barns")
        .select(
          "id, name, barn_type, plan_tier, base_stalls, grace_period_ends_at",
        )
        .eq("id", args.barn_id)
        .maybeSingle(),
      ctx.supabase
        .from("horses")
        .select("id, is_quick_record", { count: "exact" })
        .eq("barn_id", args.barn_id)
        .eq("archived", false),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx.supabase as any)
        .from("barn_members")
        .select("id", { count: "exact", head: true })
        .eq("barn_id", args.barn_id)
        .or("status.eq.active,status.is.null"),
      ctx.supabase
        .from("activity_log")
        .select(
          "id, activity_type, title, activity_date, performed_by_name, horses(name)",
        )
        .eq("barn_id", args.barn_id)
        .eq("status", "completed")
        .order("activity_date", { ascending: false })
        .limit(5),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const barn = barnRes.data as any;
    if (!barn) return { error: "Barn not found." };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const horseRows = (horsesRes.data ?? []) as any[];
    const horseCount = horsesRes.count ?? horseRows.length;
    const quickCount = horseRows.filter((h) => h.is_quick_record).length;

    const baseStalls = (barn.base_stalls as number) ?? 0;
    const overCapacity = horseCount > baseStalls;
    const gracePeriodEndsAt = barn.grace_period_ends_at as string | null;
    const inGrace =
      !!gracePeriodEndsAt && new Date(gracePeriodEndsAt) > new Date();

    return {
      barn: {
        id: barn.id as string,
        name: barn.name as string,
        barn_type: barn.barn_type as string,
        plan_tier: barn.plan_tier as string,
        base_stalls: baseStalls,
      },
      horse_count: horseCount,
      quick_record_count: quickCount,
      full_profile_count: horseCount - quickCount,
      member_count: membersRes.count ?? 0,
      capacity: {
        horses: horseCount,
        base_stalls: baseStalls,
        over_capacity: overCapacity,
        in_grace_period: inGrace,
        grace_period_ends_at: gracePeriodEndsAt,
      },
      recent_activity:
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((recentRes.data ?? []) as any[]).map((r) => ({
          id: r.id as string,
          type: r.activity_type as string | null,
          title: r.title as string | null,
          date: r.activity_date as string | null,
          performed_by: r.performed_by_name as string | null,
          horse_name: (r.horses?.name as string | null) ?? null,
        })),
    };
  },
};
