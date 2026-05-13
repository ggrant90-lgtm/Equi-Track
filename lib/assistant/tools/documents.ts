import type { AssistantTool } from "./types";
import { daysAgo } from "./helpers";

export const getDocumentStatus: AssistantTool = {
  definition: {
    name: "get_document_status",
    description:
      "Check horse document status — especially coggins tests and health certificates. Returns documents bucketed by expiration: expired, expiring_soon (within 30 days), or all current docs.",
    input_schema: {
      type: "object",
      properties: {
        status_filter: {
          type: "string",
          enum: ["expired", "expiring_soon", "all", "specific_horse"],
          description:
            "What to check. 'expiring_soon' means within 30 days. 'specific_horse' requires horse_id.",
        },
        horse_id: {
          type: "string",
          description: "Required if status_filter is 'specific_horse'.",
        },
        document_type: {
          type: "string",
          description:
            "Optional: coggins, registration, health_certificate, vet_record, other",
        },
      },
      required: ["status_filter"],
    },
  },
  handler: async (input, ctx) => {
    const args = (input ?? {}) as {
      status_filter?: string;
      horse_id?: string;
      document_type?: string;
    };

    let q = ctx.supabase
      .from("horse_documents")
      .select(
        "id, horse_id, document_type, title, document_date, expiration_date, horses(name)",
      )
      .order("expiration_date", { ascending: true })
      .limit(100);

    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const in30 = new Date(today);
    in30.setDate(in30.getDate() + 30);
    const in30Iso = in30.toISOString().slice(0, 10);

    switch (args.status_filter) {
      case "expired":
        q = q.lt("expiration_date", todayIso).not("expiration_date", "is", null);
        break;
      case "expiring_soon":
        q = q
          .gte("expiration_date", todayIso)
          .lte("expiration_date", in30Iso);
        break;
      case "specific_horse":
        if (!args.horse_id) return { error: "horse_id is required" };
        q = q.eq("horse_id", args.horse_id);
        break;
      case "all":
      default:
        break;
    }

    if (args.document_type) q = q.eq("document_type", args.document_type);

    const { data, error } = await q;
    if (error) return { documents: [], error: "Couldn't load documents." };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const documents = ((data ?? []) as any[]).map((d) => {
      const expIso = d.expiration_date as string | null;
      let status: "expired" | "expiring_soon" | "valid" | "no_expiration";
      if (!expIso) status = "no_expiration";
      else if (expIso < todayIso) status = "expired";
      else if (expIso <= in30Iso) status = "expiring_soon";
      else status = "valid";

      const expDays = expIso
        ? Math.ceil(
            (new Date(expIso).getTime() - today.getTime()) /
              (24 * 60 * 60 * 1000),
          )
        : null;

      return {
        id: d.id as string,
        horse_id: d.horse_id as string,
        horse_name: (d.horses?.name as string | null) ?? null,
        document_type: d.document_type as string | null,
        title: d.title as string | null,
        document_date: d.document_date as string | null,
        document_age_days: daysAgo(d.document_date as string | null),
        expiration_date: expIso,
        days_until_expiration: expDays,
        status,
      };
    });

    return { documents };
  },
};
