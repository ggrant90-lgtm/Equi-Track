import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase-server";

/**
 * GET /api/engagement/notifications?limit=20&offset=0
 *
 * Returns the requesting user's notification feed (newest first) plus
 * the unread count. RLS scopes by user_id; no cross-user reads possible.
 *
 * The unread count drives the badge on the bell — it's queried with
 * a HEAD-only count so it doesn't matter how big the inbox gets.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(
    50,
    Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)),
  );
  const offset = Math.max(
    0,
    parseInt(url.searchParams.get("offset") || "0", 10),
  );

  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { notifications: [], unread: 0 },
      { status: 401 },
    );
  }

  const [{ data: rows }, { count: unread }] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("notifications")
      .select(
        "id, type, title, body, icon, link, related_barn_id, related_horse_id, group_count, is_read, created_at, updated_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false),
  ]);

  return NextResponse.json({
    notifications: rows ?? [],
    unread: unread ?? 0,
  });
}
