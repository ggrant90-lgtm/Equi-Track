import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase-server";
import { pickNudgeForUser } from "@/lib/engagement/nudges/check";

/**
 * GET /api/engagement/nudges?path=/horses
 *
 * Returns the highest-priority nudge that applies to the requesting
 * user on the given page, or { nudge: null } when nothing qualifies.
 * Honors profiles.nudges_disabled + profiles.seen_nudges so a
 * dismissed nudge never resurfaces.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ nudge: null }, { status: 401 });

  const url = new URL(request.url);
  const path = url.searchParams.get("path") ?? "/";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("has_business_pro, has_breeders_pro")
    .eq("id", user.id)
    .maybeSingle();

  const nudge = await pickNudgeForUser(supabase, {
    userId: user.id,
    path: path.toLowerCase(),
    hasBusinessPro: !!profile?.has_business_pro,
    hasBreedersPro: !!profile?.has_breeders_pro,
  });
  return NextResponse.json({ nudge });
}
