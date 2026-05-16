import { createAdminClient } from "@/lib/supabase-admin";

/**
 * Admin broadcast helpers.
 *
 * A broadcast is one announcement an admin authors, then fans out
 * into N per-user notification rows. The fan-out approach (vs a
 * shared broadcast surface joined on read) keeps the bell + feed
 * code unchanged: a broadcast notification looks like every other
 * notification at the read path, so the badge counter, mark-read,
 * panel rendering all work without modification.
 *
 * Scale note: this writes one row per recipient. At BarnBook's
 * current scale (low thousands) that's a single ~250 KB batch insert
 * per broadcast. If the user base grows to ~50k+, revisit by moving
 * to a join-on-read shape.
 */

export type BroadcastAudience =
  | { kind: "all" }
  | { kind: "feature"; feature: "business_pro" | "breeders_pro" | "no_barnpilot" }
  | { kind: "user"; user_id: string }
  | { kind: "user_by_email"; email: string };

export interface CreateBroadcastInput {
  /** Authoring admin's user_id — caller verifies admin role first. */
  sentBy: string;
  title: string;
  body: string;
  icon?: string;
  /** Optional in-app link, e.g. "/dashboard". External URLs allowed. */
  link?: string;
  /** Defaults to 'system'. Other types are technically allowed but
   *  intended for organic notifications, not broadcasts. */
  notificationType?:
    | "activity"
    | "milestone"
    | "reminder"
    | "financial"
    | "tip"
    | "system";
  audience: BroadcastAudience;
}

export interface BroadcastResult {
  ok: boolean;
  broadcastId?: string;
  recipientCount?: number;
  error?: string;
}

/**
 * Resolve an audience descriptor to a concrete list of recipient
 * user_ids. Uses the admin client so all profile / assistant-usage
 * queries bypass RLS.
 */
async function resolveAudience(
  audience: BroadcastAudience,
): Promise<{ userIds: string[]; error?: string }> {
  const admin = createAdminClient();
  switch (audience.kind) {
    case "all": {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (admin as any)
        .from("profiles")
        .select("id");
      const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
      return { userIds: ids };
    }
    case "feature": {
      if (audience.feature === "business_pro") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (admin as any)
          .from("profiles")
          .select("id")
          .eq("has_business_pro", true);
        const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
        return { userIds: ids };
      }
      if (audience.feature === "breeders_pro") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (admin as any)
          .from("profiles")
          .select("id")
          .eq("has_breeders_pro", true);
        const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
        return { userIds: ids };
      }
      // no_barnpilot — users who have never invoked the assistant.
      // Two-step: all profile ids minus the distinct user_ids in
      // assistant_usage. Cheap at current scale.
      const [{ data: allProfiles }, { data: usage }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (admin as any).from("profiles").select("id"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (admin as any).from("assistant_usage").select("user_id"),
      ]);
      const usedIds = new Set(
        ((usage ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
      );
      const ids = ((allProfiles ?? []) as Array<{ id: string }>)
        .map((r) => r.id)
        .filter((id) => !usedIds.has(id));
      return { userIds: ids };
    }
    case "user": {
      return { userIds: [audience.user_id] };
    }
    case "user_by_email": {
      // Try profiles.email first; fall back to auth.users via the
      // admin listUsers paginator.
      const email = audience.email.trim().toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: byProfile } = await (admin as any)
        .from("profiles")
        .select("id, email")
        .ilike("email", email)
        .maybeSingle();
      if (byProfile?.id) {
        return { userIds: [byProfile.id as string] };
      }
      // Auth fallback — paginate up to 5000 users; if the user base
      // is bigger than that, the admin can use a different audience.
      const perPage = 1000;
      for (let page = 1; page <= 5; page++) {
        const { data, error } = await admin.auth.admin.listUsers({
          page,
          perPage,
        });
        if (error) break;
        const match = data?.users?.find(
          (u) => u.email?.toLowerCase() === email,
        );
        if (match) return { userIds: [match.id] };
        if (!data?.users?.length || data.users.length < perPage) break;
      }
      return { userIds: [], error: `No user found with email ${email}` };
    }
  }
}

const FANOUT_BATCH_SIZE = 500;

export async function createBroadcast(
  input: CreateBroadcastInput,
): Promise<BroadcastResult> {
  try {
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title) return { ok: false, error: "Title is required." };
    if (!body) return { ok: false, error: "Body is required." };
    if (title.length > 120)
      return { ok: false, error: "Title is too long (max 120 chars)." };
    if (body.length > 500)
      return { ok: false, error: "Body is too long (max 500 chars)." };

    const { userIds, error } = await resolveAudience(input.audience);
    if (error) return { ok: false, error };
    if (userIds.length === 0) {
      return { ok: false, error: "Audience resolved to zero users." };
    }

    const admin = createAdminClient();

    // Insert the broadcast row first so we have its id for the fanout.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bcast, error: insertErr } = await (admin as any)
      .from("broadcasts")
      .insert({
        title,
        body,
        icon: input.icon ?? null,
        link: input.link ?? null,
        notification_type: input.notificationType ?? "system",
        audience: input.audience,
        sent_by: input.sentBy,
        recipient_count: 0,
      })
      .select("id")
      .maybeSingle();
    if (insertErr || !bcast) {
      return {
        ok: false,
        error: insertErr?.message ?? "Could not save the broadcast row.",
      };
    }
    const broadcastId = bcast.id as string;

    // Fan out in chunks. The UNIQUE (user_id, broadcast_id) partial
    // index protects against rare double-clicks; ignoreDuplicates
    // keeps the batch insert moving when a conflict surfaces.
    let inserted = 0;
    for (let i = 0; i < userIds.length; i += FANOUT_BATCH_SIZE) {
      const chunk = userIds.slice(i, i + FANOUT_BATCH_SIZE);
      const rows = chunk.map((userId) => ({
        user_id: userId,
        broadcast_id: broadcastId,
        type: input.notificationType ?? "system",
        title,
        body,
        icon: input.icon ?? null,
        link: input.link ?? null,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: fanErr } = await (admin as any)
        .from("notifications")
        .upsert(rows, {
          onConflict: "user_id,broadcast_id",
          ignoreDuplicates: true,
        })
        .select("id");
      if (fanErr) {
        console.warn(
          "[engagement.broadcasts] fanout chunk failed",
          fanErr.message,
        );
        continue;
      }
      inserted += ((data ?? []) as unknown[]).length;
    }

    // Stamp the final recipient count on the broadcast for the
    // admin history view.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from("broadcasts")
      .update({ recipient_count: inserted })
      .eq("id", broadcastId);

    return { ok: true, broadcastId, recipientCount: inserted };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message ?? "Unexpected error.",
    };
  }
}
