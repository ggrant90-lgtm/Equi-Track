import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase-server";

/**
 * POST /api/engagement/nudges/dismiss
 * Body: { key?: string; all?: true }
 *
 * Single-key dismiss: appends the key to profiles.seen_nudges so the
 * nudge engine never resurfaces it.
 * All-off (`all: true`): flips profiles.nudges_disabled = true,
 * killing every future nudge for this user.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { key?: string; all?: boolean } = {};
  try {
    body = (await request.json()) as { key?: string; all?: boolean };
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (body.all) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ nudges_disabled: true })
      .eq("id", user.id);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (!body.key) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Append the dismissed key. Read-modify-write because Supabase
  // PostgREST doesn't support `array_append` directly via the
  // builder — and the array stays tiny so the round-trip is fine.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("seen_nudges")
    .eq("id", user.id)
    .maybeSingle();
  const seen: string[] = ((profile?.seen_nudges ?? []) as string[]) || [];
  if (!seen.includes(body.key)) seen.push(body.key);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("profiles")
    .update({ seen_nudges: seen })
    .eq("id", user.id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
