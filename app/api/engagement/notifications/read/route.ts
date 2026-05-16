import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase-server";

/**
 * POST /api/engagement/notifications/read
 *
 * Body: { id?: string; all?: true }
 *
 * Marks a single notification or every unread one for the requesting
 * user as read. RLS scopes to user_id so a user can only flip their
 * own rows. The update policy in the migration enforces this at the
 * DB level too.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: { id?: string; all?: boolean } = {};
  try {
    body = (await request.json()) as { id?: string; all?: boolean };
  } catch {
    /* allow empty body */
  }

  if (body.all) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("notifications")
      .update({ is_read: true })
      .eq("id", body.id)
      .eq("user_id", user.id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Missing id or all" }, { status: 400 });
}
