import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Barn, BarnMember, Database } from "./types";

export type PrimaryBarnContext = {
  barn: Barn;
  membership: BarnMember | null;
};

/**
 * Get barn context, preferring activeBarnId if provided (from cookie).
 * Falls back to first owned barn, then first membership.
 */
export async function getPrimaryBarnContext(
  supabase: SupabaseClient<Database>,
  userId: string,
  activeBarnId?: string | null,
): Promise<PrimaryBarnContext | null> {
  // If an active barn is specified, try to use it
  if (activeBarnId) {
    const { data: activeBarn } = await supabase
      .from("barns")
      .select("*")
      .eq("id", activeBarnId)
      .maybeSingle();

    if (activeBarn) {
      // Verify user has access
      const isOwner = activeBarn.owner_id === userId;
      const { data: mem } = await supabase
        .from("barn_members")
        .select("*")
        .eq("barn_id", activeBarnId)
        .eq("user_id", userId)
        .maybeSingle();

      if (isOwner || mem) {
        return { barn: activeBarn, membership: mem };
      }
    }
  }

  const { data: owned } = await supabase
    .from("barns")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (owned) {
    const { data: mem } = await supabase
      .from("barn_members")
      .select("*")
      .eq("barn_id", owned.id)
      .eq("user_id", userId)
      .maybeSingle();
    return { barn: owned, membership: mem };
  }

  const { data: memRow } = await supabase
    .from("barn_members")
    .select("*")
    .eq("user_id", userId)
    .or("status.eq.active,status.is.null")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!memRow) return null;

  const { data: barn } = await supabase
    .from("barns")
    .select("*")
    .eq("id", memRow.barn_id)
    .single();

  if (!barn) return null;
  return { barn, membership: memRow };
}

/**
 * Every barn id the user can read + write Breeders Pro / Business Pro
 * data for. Includes barns they own AND barns where they're an
 * editor-or-higher member. View-only members and stall-key holders
 * are excluded — those access paths grant horse-level views, not
 * barn-level operational surfaces.
 *
 * Used by BP pages to scope queries across the user's whole
 * operation rather than just whichever barn they last switched to in
 * the sidebar.
 */
export async function getUserOperationalBarnIds(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string[]> {
  const [ownedRes, memberRes] = await Promise.all([
    supabase.from("barns").select("id").eq("owner_id", userId),
    supabase
      .from("barn_members")
      .select("barn_id, role")
      .eq("user_id", userId)
      .or("status.eq.active,status.is.null"),
  ]);

  const ownedIds = ((ownedRes.data ?? []) as Array<{ id: string }>).map(
    (b) => b.id,
  );
  const memberIds = ((memberRes.data ?? []) as Array<{
    barn_id: string;
    role: string | null;
  }>)
    .filter((m) => m.role === "owner" || m.role === "admin" || m.role === "editor")
    .map((m) => m.barn_id);

  return [...new Set([...ownedIds, ...memberIds])];
}

export async function userHasAnyBarn(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<boolean> {
  const ctx = await getPrimaryBarnContext(supabase, userId);
  return ctx !== null;
}

/**
 * Read the active_barn_id cookie. Call from server components only.
 */
export async function getActiveBarnId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get("active_barn_id")?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Convenience: get barn context respecting the active barn cookie.
 */
export async function getActiveBarnContext(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<PrimaryBarnContext | null> {
  const activeBarnId = await getActiveBarnId();
  return getPrimaryBarnContext(supabase, userId, activeBarnId);
}
