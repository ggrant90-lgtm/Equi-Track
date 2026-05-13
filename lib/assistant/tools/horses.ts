import type { AssistantTool } from "./types";
import { daysAgo } from "./helpers";

/** Approximate age in years from a foal_date (date column). */
function ageFromFoalDate(foalDate: string | null | undefined): number | null {
  if (!foalDate) return null;
  const then = new Date(foalDate);
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - then.getFullYear();
  const m = now.getMonth() - then.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < then.getDate())) age--;
  return age;
}

export const searchHorses: AssistantTool = {
  definition: {
    name: "search_horses",
    description:
      "Search for horses by name across all barns the user owns or has access to. Returns matching horses with basic profile info. Use this when the user mentions a horse by name.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Horse name or partial name to search for",
        },
        barn_id: {
          type: "string",
          description: "Optional: limit search to a specific barn ID",
        },
        include_archived: {
          type: "boolean",
          description: "Optional: include archived horses. Default false.",
        },
      },
      required: ["query"],
    },
  },
  handler: async (input, ctx) => {
    const args = (input ?? {}) as {
      query?: string;
      barn_id?: string;
      include_archived?: boolean;
    };
    const q = (args.query ?? "").trim();
    if (!q) return { horses: [] };

    let query = ctx.supabase
      .from("horses")
      .select(
        "id, name, breed, color, sex, foal_date, barn_id, is_quick_record, owner_name, owner_contact_name, owner_contact_phone, location_name, archived, barns(name)",
      )
      .ilike("name", `%${q}%`)
      .order("name", { ascending: true })
      .limit(10);

    if (!args.include_archived) {
      query = query.eq("archived", false);
    }
    if (args.barn_id) {
      query = query.eq("barn_id", args.barn_id);
    }

    const { data, error } = await query;
    if (error) return { horses: [], error: "Couldn't search horses." };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((data ?? []) as any[]).map((h) => ({
      id: h.id as string,
      name: h.name as string,
      breed: h.breed as string | null,
      color: h.color as string | null,
      sex: h.sex as string | null,
      age: ageFromFoalDate(h.foal_date as string | null),
      barn_id: h.barn_id as string,
      barn_name: (h.barns?.name as string | null) ?? null,
      is_quick_record: !!h.is_quick_record,
      owner: h.is_quick_record
        ? (h.owner_contact_name as string | null) ??
          (h.owner_name as string | null)
        : (h.owner_name as string | null),
      location: h.location_name as string | null,
      archived: !!h.archived,
    }));

    return { horses: rows };
  },
};

export const getHorseDetails: AssistantTool = {
  definition: {
    name: "get_horse_details",
    description:
      "Get detailed profile information for a specific horse — breed, age, color, markings, registration, owner, and any care notes. Use this once you've identified a specific horse by ID.",
    input_schema: {
      type: "object",
      properties: {
        horse_id: { type: "string", description: "The horse's ID" },
      },
      required: ["horse_id"],
    },
  },
  handler: async (input, ctx) => {
    const args = (input ?? {}) as { horse_id?: string };
    if (!args.horse_id) return { error: "horse_id is required" };

    const { data, error } = await ctx.supabase
      .from("horses")
      .select(
        "id, name, breed, color, sex, foal_date, registration_number, microchip_number, sire, dam, owner_name, owner_contact_name, owner_contact_phone, owner_contact_email, location_name, is_quick_record, feed_regimen, supplements, special_care_notes, turnout_schedule, photo_url, archived, barn_id, barns(name, barn_type)",
      )
      .eq("id", args.horse_id)
      .maybeSingle();

    if (error || !data) {
      return { error: "Horse not found or you don't have access to it." };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const h = data as any;
    return {
      horse: {
        id: h.id as string,
        name: h.name as string,
        breed: h.breed as string | null,
        color: h.color as string | null,
        sex: h.sex as string | null,
        age: ageFromFoalDate(h.foal_date as string | null),
        foal_date: h.foal_date as string | null,
        registration_number: h.registration_number as string | null,
        microchip_number: h.microchip_number as string | null,
        sire: h.sire as string | null,
        dam: h.dam as string | null,
        is_quick_record: !!h.is_quick_record,
        owner: h.is_quick_record
          ? (h.owner_contact_name as string | null) ??
            (h.owner_name as string | null)
          : (h.owner_name as string | null),
        owner_phone: h.owner_contact_phone as string | null,
        owner_email: h.owner_contact_email as string | null,
        location: h.location_name as string | null,
        feed_regimen: h.feed_regimen as string | null,
        supplements: h.supplements as string | null,
        special_care_notes: h.special_care_notes as string | null,
        turnout_schedule: h.turnout_schedule as string | null,
        archived: !!h.archived,
        barn_id: h.barn_id as string,
        barn_name: (h.barns?.name as string | null) ?? null,
        barn_type: (h.barns?.barn_type as string | null) ?? null,
      },
    };
  },
};

export const getHorseActivity: AssistantTool = {
  definition: {
    name: "get_horse_activity",
    description:
      "Get recent log entries for a specific horse. Can filter by activity type and date range. Returns entries sorted newest first. Use this for 'when was X last...?' questions.",
    input_schema: {
      type: "object",
      properties: {
        horse_id: { type: "string", description: "The horse's ID" },
        entry_type: {
          type: "string",
          description:
            "Optional: filter by activity type (e.g. shoeing, vet, worming, exercise, feed, medication, note). Match the value in activity_type.",
        },
        days_back: {
          type: "number",
          description:
            "Optional: how many days of history to return. Default 90.",
        },
        limit: {
          type: "number",
          description: "Optional: max number of entries. Default 10, max 50.",
        },
        include_planned: {
          type: "boolean",
          description:
            "Optional: include planned (not-yet-completed) entries. Default false.",
        },
      },
      required: ["horse_id"],
    },
  },
  handler: async (input, ctx) => {
    const args = (input ?? {}) as {
      horse_id?: string;
      entry_type?: string;
      days_back?: number;
      limit?: number;
      include_planned?: boolean;
    };
    if (!args.horse_id) return { error: "horse_id is required" };

    const daysBack = Math.max(1, Math.min(args.days_back ?? 90, 3650));
    const limit = Math.max(1, Math.min(args.limit ?? 10, 50));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffIso = cutoff.toISOString().slice(0, 10);

    let q = ctx.supabase
      .from("activity_log")
      .select(
        "id, activity_type, title, notes, activity_date, performed_at, performed_by_name, total_cost, cost_type, payment_status, status",
      )
      .eq("horse_id", args.horse_id)
      .gte("activity_date", cutoffIso)
      .order("activity_date", { ascending: false })
      .limit(limit);

    if (args.entry_type) q = q.eq("activity_type", args.entry_type);
    if (!args.include_planned) q = q.eq("status", "completed");

    const { data, error } = await q;
    if (error) return { entries: [], error: "Couldn't load activity." };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((data ?? []) as any[]).map((r) => ({
      id: r.id as string,
      type: r.activity_type as string | null,
      title: r.title as string | null,
      notes: r.notes as string | null,
      date: r.activity_date as string | null,
      performed_at: r.performed_at as string | null,
      performed_by: r.performed_by_name as string | null,
      days_ago: daysAgo(r.activity_date as string | null),
      cost: r.total_cost == null ? null : Number(r.total_cost),
      cost_type: r.cost_type as string | null,
      payment_status: r.payment_status as string | null,
      status: r.status as string | null,
    }));

    return { entries: rows };
  },
};
