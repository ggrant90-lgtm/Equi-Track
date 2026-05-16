"use server";

import { getActiveBarnContext } from "@/lib/barn-session";
import { canUserEditHorseProfile } from "@/lib/horse-access";
import { ensureClientForOwnerName } from "@/lib/clients-sync";
import { getBarnCapacitySnapshot } from "@/lib/plans.server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createServerComponentClient } from "@/lib/supabase-server";
import { runEngagementHooks } from "@/lib/engagement/dispatcher";
import { stashPendingCelebrations } from "@/lib/engagement/pending-celebrations";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function generateQrCode(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `BB-${ts}-${rand}`;
}

export async function createHorseAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string; horseId?: string } | null> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const ctx = await getActiveBarnContext(supabase, user.id);
  if (!ctx) return { error: "Join or create a barn first." };

  // Creating a horse = a horse-profile-level operation, which is owner-only
  // (same rule as editing the profile). Matches the RLS INSERT policy on
  // horses — keeps the app error friendlier than the raw DB rejection.
  const canCreate = await canUserEditHorseProfile(supabase, user.id, ctx.barn.id);
  if (!canCreate) {
    return {
      error: "Only the barn owner can add horses. Ask them to add this one.",
    };
  }

  // Capacity check
  const snapshot = await getBarnCapacitySnapshot(supabase, ctx.barn.id);
  if (snapshot && !snapshot.canAddHorse) {
    return { error: "BARN_FULL" };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  const barn_name = String(formData.get("barn_name") ?? "").trim() || null;
  const breed = String(formData.get("breed") ?? "").trim() || null;
  const sex = String(formData.get("sex") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;
  const foal_date = String(formData.get("foal_date") ?? "").trim() || null;
  const owner_name = String(formData.get("owner_name") ?? "").trim() || null;
  const sire = String(formData.get("sire") ?? "").trim() || null;
  const dam = String(formData.get("dam") ?? "").trim() || null;
  const registration_number = String(formData.get("registration_number") ?? "").trim() || null;
  const microchip_number = String(formData.get("microchip_number") ?? "").trim() || null;

  // Authorization was just enforced above via canUserEditHorseProfile —
  // which verifies ctx.barn.owner_id === user.id by SELECTing the barn.
  // Use the service-role client for the actual INSERT to avoid a known
  // issue where auth.uid() is unreliable inside RLS WITH CHECK in some
  // Next.js server-action contexts, causing "new row violates row-level
  // security policy" errors for legitimate barn owners. RLS is
  // intentionally bypassed here because the ownership gate above is the
  // authoritative check.
  const adminClient = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: horse, error } = await (adminClient as any)
    .from("horses")
    .insert({
      barn_id: ctx.barn.id,
      created_by: user.id,
      name,
      barn_name,
      breed,
      sex,
      color,
      foal_date,
      owner_name,
      sire,
      dam,
      registration_number,
      microchip_number,
      qr_code: generateQrCode(),
    })
    .select("id")
    .single();

  if (error || !horse) {
    return { error: error?.message ?? "Could not create horse." };
  }

  // Auto-sync owner_name → Business Pro Clients (no-op for non-BP barns).
  const sync = await ensureClientForOwnerName(adminClient, ctx.barn.id, owner_name);

  // Engagement: first_horse celebration + (future) barn-milestone
  // celebrations. Failures are swallowed inside the dispatcher.
  const eng = await runEngagementHooks(supabase, {
    userId: user.id,
    event: "horse_created",
    barnId: ctx.barn.id,
    horseId: horse.id,
    horseName: name,
    barnName: ctx.barn.name,
  });
  if (eng.celebrations.length > 0) {
    await stashPendingCelebrations(eng.celebrations);
  }

  revalidatePath("/horses");
  revalidatePath("/dashboard");
  if (sync.created) {
    revalidatePath("/business-pro/clients");
    revalidatePath("/business-pro/overview");
  }
  return { horseId: horse.id };
}

export async function updateHorseAction(
  horseId: string,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: horse } = await supabase
    .from("horses")
    .select("barn_id")
    .eq("id", horseId)
    .single();

  if (!horse) return { error: "Horse not found." };

  const canEdit = await canUserEditHorseProfile(supabase, user.id, horse.barn_id);
  if (!canEdit) return { error: "Only the barn owner can edit horse profiles." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  const owner_name = String(formData.get("owner_name") ?? "").trim() || null;

  const rawNamePref = String(formData.get("primary_name_pref") ?? "").trim();
  const primary_name_pref: "papered" | "barn" =
    rawNamePref === "barn" ? "barn" : "papered";

  const { error } = await supabase
    .from("horses")
    .update({
      name,
      barn_name: String(formData.get("barn_name") ?? "").trim() || null,
      primary_name_pref,
      breed: String(formData.get("breed") ?? "").trim() || null,
      sex: String(formData.get("sex") ?? "").trim() || null,
      color: String(formData.get("color") ?? "").trim() || null,
      foal_date: String(formData.get("foal_date") ?? "").trim() || null,
      owner_name,
      sire: String(formData.get("sire") ?? "").trim() || null,
      dam: String(formData.get("dam") ?? "").trim() || null,
      registration_number: String(formData.get("registration_number") ?? "").trim() || null,
      microchip_number: String(formData.get("microchip_number") ?? "").trim() || null,
      feed_regimen: String(formData.get("feed_regimen") ?? "").trim() || null,
      supplements: String(formData.get("supplements") ?? "").trim() || null,
      special_care_notes: String(formData.get("special_care_notes") ?? "").trim() || null,
      turnout_schedule: String(formData.get("turnout_schedule") ?? "").trim() || null,
      breeding_role: (String(formData.get("breeding_role") ?? "none").trim() || "none") as "donor" | "recipient" | "stallion" | "multiple" | "none",
      updated_at: new Date().toISOString(),
    })
    .eq("id", horseId);

  if (error) return { error: error.message };

  // Auto-sync owner_name → Business Pro Clients (no-op for non-BP barns).
  const sync = await ensureClientForOwnerName(supabase, horse.barn_id, owner_name);

  revalidatePath(`/horses/${horseId}`);
  revalidatePath("/horses");
  if (sync.created) {
    revalidatePath("/business-pro/clients");
    revalidatePath("/business-pro/overview");
  }
  return { ok: true };
}

/** Form `action` — Next.js expects `Promise<void>`, not a return object. */
export async function updateHorseFormAction(
  horseId: string,
  formData: FormData,
): Promise<void> {
  const r = await updateHorseAction(horseId, formData);
  if (r?.error) {
    redirect(
      `/horses/${horseId}?tab=overview&error=${encodeURIComponent(r.error)}`,
    );
  }
}

export async function deleteHorseAction(
  horseId: string,
  permanent: boolean = false,
): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: horse } = await supabase
    .from("horses")
    .select("barn_id")
    .eq("id", horseId)
    .single();

  if (!horse) return { error: "Horse not found." };

  const canEdit = await canUserEditHorseProfile(supabase, user.id, horse.barn_id);
  if (!canEdit) return { error: "Only the barn owner can delete horses." };

  if (!permanent) {
    // Soft delete — archive the horse.
    const { error } = await supabase
      .from("horses")
      .update({ archived: true })
      .eq("id", horseId);

    if (error) return { error: error.message };
  } else {
    // Hard delete — remove horse and ALL associated data.
    // Each table is cleaned with separate .eq() calls per column
    // (avoids .or() issues with nullable UUID columns in PostgREST).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;

    // 1. Foalings — find all pregnancy IDs for this horse, then delete foalings
    const [{ data: p1 }, { data: p2 }, { data: p3 }] = await Promise.all([
      db.from("pregnancies").select("id").eq("donor_horse_id", horseId),
      db.from("pregnancies").select("id").eq("surrogate_horse_id", horseId),
      db.from("pregnancies").select("id").eq("stallion_horse_id", horseId),
    ]);
    const pIds = [...new Set([
      ...(p1 ?? []).map((p: { id: string }) => p.id),
      ...(p2 ?? []).map((p: { id: string }) => p.id),
      ...(p3 ?? []).map((p: { id: string }) => p.id),
    ])];
    if (pIds.length > 0) {
      await db.from("foalings").delete().in("pregnancy_id", pIds);
    }
    await db.from("foalings").delete().eq("surrogate_horse_id", horseId);
    await db.from("foalings").delete().eq("foal_horse_id", horseId);

    // 2. Pregnancies
    await db.from("pregnancies").delete().eq("donor_horse_id", horseId);
    await db.from("pregnancies").delete().eq("surrogate_horse_id", horseId);
    await db.from("pregnancies").delete().eq("stallion_horse_id", horseId);

    // 3. ICSI batches + oocytes via OPU sessions
    const { data: opuRows } = await db.from("opu_sessions").select("id").eq("donor_horse_id", horseId);
    const oIds = (opuRows ?? []).map((o: { id: string }) => o.id);
    if (oIds.length > 0) {
      await db.from("icsi_batches").delete().in("opu_session_id", oIds);
      await db.from("oocytes").delete().in("opu_session_id", oIds);
    }

    // 4. OPU sessions
    await db.from("opu_sessions").delete().eq("donor_horse_id", horseId);

    // 5. Embryos
    await db.from("embryos").delete().eq("donor_horse_id", horseId);
    await db.from("embryos").delete().eq("stallion_horse_id", horseId);

    // 6. Flushes
    await db.from("flushes").delete().eq("donor_horse_id", horseId);
    await db.from("flushes").delete().eq("stallion_horse_id", horseId);

    // 7. Log entries + media + line items
    const { data: logEntries } = await supabase.from("log_entries").select("id").eq("horse_id", horseId);
    const logIds = (logEntries ?? []).map((e: { id: string }) => e.id);
    if (logIds.length > 0) {
      await supabase.from("log_entry_media").delete().in("log_entry_id", logIds);
      await supabase.from("log_entry_line_items").delete().in("log_entry_id", logIds);
    }
    await supabase.from("log_entries").delete().eq("horse_id", horseId);

    // 8. Health records, horse stays, location assignments
    await supabase.from("health_records").delete().eq("horse_id", horseId);
    await supabase.from("horse_stays").delete().eq("horse_id", horseId);
    await db.from("horse_location_assignments").delete().eq("horse_id", horseId);

    // 9. Financial records
    await db.from("financial_records").delete().eq("horse_id", horseId);

    // 10. Access keys — null out horse reference
    await db.from("access_keys").update({ horse_id: null }).eq("horse_id", horseId);

    // 11. Clear sire/dam references from other horses
    await supabase.from("horses").update({ sire_horse_id: null } as Record<string, unknown>).eq("sire_horse_id", horseId);
    await supabase.from("horses").update({ dam_horse_id: null } as Record<string, unknown>).eq("dam_horse_id", horseId);

    // 12. Finally delete the horse
    const { error } = await supabase.from("horses").delete().eq("id", horseId);
    if (error) return { error: error.message };
  }

  revalidatePath("/horses");
  revalidatePath("/dashboard");
  revalidatePath("/breeders-pro");
  revalidatePath("/breeders-pro/donors");
  revalidatePath("/breeders-pro/stallions");
  revalidatePath("/breeders-pro/surrogates");
  revalidatePath("/breeders-pro/pregnancies");
  return { ok: true };
}

export async function updateHorsePhotoUrlAction(
  horseId: string,
  photoUrl: string,
): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { data: horse } = await supabase
    .from("horses")
    .select("barn_id")
    .eq("id", horseId)
    .single();

  if (!horse) return { error: "Horse not found." };

  const canEdit = await canUserEditHorseProfile(supabase, user.id, horse.barn_id);
  if (!canEdit) return { error: "Only the barn owner can update the horse photo." };

  const { error } = await supabase
    .from("horses")
    .update({ photo_url: photoUrl, updated_at: new Date().toISOString() })
    .eq("id", horseId);

  if (error) return { error: error.message };

  revalidatePath(`/horses/${horseId}`);
  return { ok: true };
}
