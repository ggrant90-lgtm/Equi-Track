import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase-server";

/**
 * POST /api/engagement/celebrations/mark-shared
 * Body: { key: string }
 *
 * Flips user_celebrations.shared = true for the requesting user's
 * matching row. RLS scopes the UPDATE to the user's own rows, so a
 * caller can only mutate their own celebration history.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { key?: string } = {};
  try {
    body = (await request.json()) as { key?: string };
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!body.key) return NextResponse.json({ ok: false }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("user_celebrations")
    .update({ shared: true })
    .eq("user_id", user.id)
    .eq("celebration_key", body.key);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
