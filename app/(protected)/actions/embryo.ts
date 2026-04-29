"use server";

import { canUserEditHorse } from "@/lib/horse-access";
import { createServerComponentClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

/**
 * Creates a flush with N embryos in a single transaction via RPC.
 */
export async function createFlushAction(
  donorHorseId: string,
  formData: FormData,
): Promise<{ flushId?: string; embryoCount?: number; error?: string }> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Fetch horse to get barn_id
  const { data: horse } = await supabase
    .from("horses")
    .select("barn_id")
    .eq("id", donorHorseId)
    .single();
  if (!horse) return { error: "Horse not found" };

  const canEdit = await canUserEditHorse(supabase, user.id, horse.barn_id);
  if (!canEdit) return { error: "No permission" };

  // Extract form fields
  const stallionSource = String(formData.get("stallion_source") ?? "external");
  const stallionHorseId = stallionSource === "in_system"
    ? String(formData.get("stallion_horse_id") ?? "").trim() || null
    : null;
  const externalStallionName = stallionSource === "external"
    ? String(formData.get("external_stallion_name") ?? "").trim() || null
    : null;
  const externalStallionRegistration = stallionSource === "external"
    ? String(formData.get("external_stallion_registration") ?? "").trim() || null
    : null;

  const flushDate = String(formData.get("flush_date") ?? "").trim()
    || new Date().toISOString().slice(0, 10);
  const vetName = String(formData.get("veterinarian_name") ?? "").trim() || null;
  const breedingMethod = String(formData.get("breeding_method") ?? "ai_fresh");
  const embryoCountRaw = parseInt(String(formData.get("embryo_count") ?? "0"), 10);
  const embryoCount = Number.isNaN(embryoCountRaw) || embryoCountRaw < 0 ? 0 : embryoCountRaw;
  const flushCostRaw = String(formData.get("flush_cost") ?? "").trim();
  const flushCost = flushCostRaw ? parseFloat(flushCostRaw) : null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (embryoCount === 0) return { error: "Embryo count must be at least 1" };

  // Collect grades, stages, and labels for each embryo
  const grades: string[] = [];
  const stages: string[] = [];
  const labels: (string | null)[] = [];
  for (let i = 0; i < embryoCount; i++) {
    grades.push(String(formData.get(`grade_${i}`) ?? "grade_1"));
    stages.push(String(formData.get(`stage_${i}`) ?? "morula"));
    const lbl = String(formData.get(`label_${i}`) ?? "").trim();
    labels.push(lbl || null);
  }

  // Call the transactional RPC
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("create_flush_with_embryos", {
    p_barn_id: horse.barn_id,
    p_donor_horse_id: donorHorseId,
    p_stallion_horse_id: stallionHorseId,
    p_external_stallion_name: externalStallionName,
    p_external_stallion_registration: externalStallionRegistration,
    p_flush_date: flushDate,
    p_veterinarian_name: vetName,
    p_breeding_method: breedingMethod,
    p_embryo_count: embryoCount,
    p_flush_cost: flushCost,
    p_notes: notes,
    p_created_by: user.id,
    p_grades: grades,
    p_stages: stages,
    p_labels: labels,
  });

  if (error) return { error: error.message };
  if (!data?.ok) return { error: data?.error ?? "Unknown error" };

  // Auto-set stallion's breeding_role if it's an in-system stallion
  if (stallionHorseId) {
    const { data: stallionHorse } = await supabase
      .from("horses")
      .select("id, breeding_role")
      .eq("id", stallionHorseId)
      .single();
    if (stallionHorse && (!stallionHorse.breeding_role || stallionHorse.breeding_role === "none")) {
      await supabase
        .from("horses")
        .update({ breeding_role: "stallion" } as Record<string, unknown>)
        .eq("id", stallionHorseId);
    }
    revalidatePath(`/horses/${stallionHorseId}`);
  }

  revalidatePath(`/horses/${donorHorseId}`);
  revalidatePath("/embryo-bank");

  return { flushId: data.flush_id, embryoCount };
}

/**
 * Breeders Pro — Event-first flush creation.
 *
 * Accepts either existing horse ids OR inline horse details for the donor
 * mare and barn stallion, delegates everything to the new
 * `create_flush_with_horses_and_embryos` RPC (single transaction), and
 * returns the created flush/embryo/horse identifiers.
 *
 * Scope note: the RPC wraps the existing `create_flush_with_embryos` RPC
 * for all flush/embryo/financial/lifetime-count logic. This server action
 * only parses the form, resolves the active barn, checks permission, and
 * calls the RPC — it does not duplicate any business logic.
 */
export async function createFlushEventFirstAction(
  formData: FormData,
): Promise<{
  flushId?: string;
  embryoCount?: number;
  donorHorseId?: string;
  stallionHorseId?: string | null;
  createdDonor?: boolean;
  createdStallion?: boolean;
  error?: string;
}> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // ---------- Donor mare input (existing OR new) ----------
  // The donor's barn anchors the new flush row — Breeders Pro now
  // shows donors across every operational barn, so we can't assume
  // the active-barn cookie matches the picked donor. For existing
  // donors we resolve the barn from the horse row; for new donors
  // we fall back to the active barn (the new horse will be created
  // there).
  const donorMode = String(formData.get("donor_mode") ?? "new");
  let donorInput: Record<string, unknown> | null = null;
  let resolvedDonorBarnId: string | null = null;
  if (donorMode === "existing") {
    const id = String(formData.get("donor_horse_id") ?? "").trim();
    if (!id) return { error: "Select a donor mare or add a new one" };
    donorInput = { id };
    const { data: donorRow } = await supabase
      .from("horses")
      .select("barn_id")
      .eq("id", id)
      .maybeSingle();
    if (!donorRow) return { error: "Donor mare not found" };
    resolvedDonorBarnId = (donorRow as { barn_id: string }).barn_id;
  } else {
    const name = String(formData.get("donor_name") ?? "").trim();
    if (!name) return { error: "Donor mare name is required" };
    donorInput = {
      name,
      breed: String(formData.get("donor_breed") ?? "").trim() || null,
      color: String(formData.get("donor_color") ?? "").trim() || null,
      foal_date:
        String(formData.get("donor_foal_date") ?? "").trim() || null,
      registration_number:
        String(formData.get("donor_registration_number") ?? "").trim() ||
        null,
    };
  }

  // Resolve the flush's anchor barn:
  //   - existing donor → use the donor's barn
  //   - new donor → fall back to the active barn cookie so the new
  //                 horse is created in the right place
  let barnId: string | null = resolvedDonorBarnId;
  if (!barnId) {
    const { getActiveBarnContext } = await import("@/lib/barn-session");
    const ctx = await getActiveBarnContext(supabase, user.id);
    barnId = ctx?.barn?.id ?? null;
  }
  if (!barnId) return { error: "No active barn" };

  const canEdit = await canUserEditHorse(supabase, user.id, barnId);
  if (!canEdit) {
    return { error: "No permission to record a flush in that barn" };
  }

  // ---------- Sire input (existing OR new barn stallion) ----------
  // Breeders Pro does not support "external sire" creation — every sire is
  // either an existing horse row or becomes one. The RPC's external fields
  // are always passed as NULL from this flow.
  const sireMode = String(formData.get("sire_mode") ?? "new");
  let stallionInput: Record<string, unknown> | null = null;

  if (sireMode === "existing") {
    const id = String(formData.get("sire_horse_id") ?? "").trim();
    if (!id) return { error: "Select a stallion or add a new one" };
    stallionInput = { id };
  } else {
    const name = String(formData.get("sire_name") ?? "").trim();
    if (!name) return { error: "Stallion name is required" };
    stallionInput = {
      name,
      breed: String(formData.get("sire_breed") ?? "").trim() || null,
      color: String(formData.get("sire_color") ?? "").trim() || null,
      foal_date:
        String(formData.get("sire_foal_date") ?? "").trim() || null,
      registration_number:
        String(formData.get("sire_registration_number") ?? "").trim() ||
        null,
    };
  }

  // ---------- Flush fields ----------
  const flushDate =
    String(formData.get("flush_date") ?? "").trim() ||
    new Date().toISOString().slice(0, 10);
  const vetName =
    String(formData.get("veterinarian_name") ?? "").trim() || null;
  const breedingMethod = String(formData.get("breeding_method") ?? "ai_fresh");

  const embryoCountRaw = parseInt(
    String(formData.get("embryo_count") ?? "0"),
    10,
  );
  const embryoCount =
    Number.isNaN(embryoCountRaw) || embryoCountRaw < 0 ? 0 : embryoCountRaw;
  if (embryoCount === 0) return { error: "Embryo count must be at least 1" };

  const flushCostRaw = String(formData.get("flush_cost") ?? "").trim();
  const flushCost = flushCostRaw ? parseFloat(flushCostRaw) : null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  // Per-embryo grade, stage, label
  const grades: string[] = [];
  const stages: string[] = [];
  const labels: (string | null)[] = [];
  for (let i = 0; i < embryoCount; i++) {
    grades.push(String(formData.get(`grade_${i}`) ?? "grade_1"));
    stages.push(String(formData.get(`stage_${i}`) ?? "morula"));
    const lbl = String(formData.get(`label_${i}`) ?? "").trim();
    labels.push(lbl || null);
  }

  // ---------- Call the new transactional RPC ----------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "create_flush_with_horses_and_embryos",
    {
      p_barn_id: barnId,
      p_donor_input: donorInput,
      p_stallion_input: stallionInput,
      p_external_stallion_name: null,
      p_external_stallion_registration: null,
      p_flush_date: flushDate,
      p_veterinarian_name: vetName,
      p_breeding_method: breedingMethod,
      p_embryo_count: embryoCount,
      p_flush_cost: flushCost,
      p_notes: notes,
      p_created_by: user.id,
      p_grades: grades,
      p_stages: stages,
      p_labels: labels,
    },
  );

  if (error) return { error: error.message };
  if (!data?.ok) return { error: data?.error ?? "Unknown error" };

  // Set breeding_only on newly created horses (unless user opted in to BarnBook)
  if (data.created_donor && data.donor_horse_id) {
    const addToBB = formData.get("donor_add_to_barnbook") === "true";
    if (!addToBB) {
      await supabase
        .from("horses")
        .update({ breeding_only: true } as Record<string, unknown>)
        .eq("id", data.donor_horse_id);
    }
  }
  if (data.created_stallion && data.stallion_horse_id) {
    const addToBB = formData.get("sire_add_to_barnbook") === "true";
    if (!addToBB) {
      await supabase
        .from("horses")
        .update({ breeding_only: true } as Record<string, unknown>)
        .eq("id", data.stallion_horse_id);
    }
  }

  revalidatePath("/breeders-pro");
  revalidatePath("/breeders-pro/pregnancies");
  if (data.donor_horse_id) {
    revalidatePath(`/breeders-pro/donors/${data.donor_horse_id}`);
  }

  return {
    flushId: data.flush_id,
    embryoCount,
    donorHorseId: data.donor_horse_id,
    stallionHorseId: data.stallion_horse_id ?? null,
    createdDonor: !!data.created_donor,
    createdStallion: !!data.created_stallion,
  };
}

/**
 * Breeders Pro — Transfer embryo with inline surrogate creation.
 *
 * Resolves or creates the surrogate mare, inserts the pregnancy, flips the
 * embryo status, and marks the surrogate as bred — all in one transaction
 * via the `transfer_embryo_with_surrogate` RPC.
 *
 * Scope note: this is a new action. The legacy `transferEmbryoAction` below
 * is untouched so the BarnBook `/embryo-bank/[id]` route keeps working.
 */
export async function transferEmbryoWithSurrogateAction(
  embryoId: string,
  formData: FormData,
): Promise<{
  pregnancyId?: string;
  surrogateHorseId?: string;
  createdSurrogate?: boolean;
  error?: string;
}> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: embryo } = await (supabase as any)
    .from("embryos")
    .select("id, barn_id, status")
    .eq("id", embryoId)
    .single();
  if (!embryo) return { error: "Embryo not found" };
  if (
    embryo.status !== "in_bank_fresh" &&
    embryo.status !== "in_bank_frozen"
  ) {
    return { error: "Embryo is not available for transfer" };
  }

  const canEdit = await canUserEditHorse(supabase, user.id, embryo.barn_id);
  if (!canEdit) return { error: "No permission" };

  // ---------- Surrogate input (existing OR new) ----------
  const surrogateMode = String(formData.get("surrogate_mode") ?? "existing");
  let surrogateInput: Record<string, unknown> | null = null;

  if (surrogateMode === "existing") {
    const id = String(formData.get("surrogate_horse_id") ?? "").trim();
    if (!id) return { error: "Select a surrogate mare or add a new one" };
    surrogateInput = { id };
  } else {
    const name = String(formData.get("surrogate_name") ?? "").trim();
    if (!name) return { error: "Surrogate mare name is required" };
    surrogateInput = {
      name,
      breed: String(formData.get("surrogate_breed") ?? "").trim() || null,
      color: String(formData.get("surrogate_color") ?? "").trim() || null,
      foal_date:
        String(formData.get("surrogate_foal_date") ?? "").trim() || null,
      registration_number:
        String(formData.get("surrogate_registration_number") ?? "").trim() ||
        null,
    };
  }

  // ---------- Transfer fields ----------
  const transferDate =
    String(formData.get("transfer_date") ?? "").trim() ||
    new Date().toISOString().slice(0, 10);
  const vetName =
    String(formData.get("transfer_veterinarian_name") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  // ---------- Call the transactional RPC ----------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "transfer_embryo_with_surrogate",
    {
      p_embryo_id: embryoId,
      p_surrogate_input: surrogateInput,
      p_transfer_date: transferDate,
      p_transfer_vet_name: vetName,
      p_notes: notes,
      p_created_by: user.id,
    },
  );

  if (error) return { error: error.message };
  if (!data?.ok) return { error: data?.error ?? "Unknown error" };

  revalidatePath(`/breeders-pro/${embryoId}`);
  revalidatePath("/breeders-pro");
  revalidatePath("/breeders-pro/pregnancies");
  if (data.surrogate_horse_id) {
    revalidatePath(`/breeders-pro/surrogates/${data.surrogate_horse_id}`);
  }

  return {
    pregnancyId: data.pregnancy_id,
    surrogateHorseId: data.surrogate_horse_id,
    createdSurrogate: !!data.created_surrogate,
  };
}

/**
 * Transfer an embryo to a surrogate mare, creating a pregnancy.
 */
export async function transferEmbryoAction(
  embryoId: string,
  formData: FormData,
): Promise<{ pregnancyId?: string; error?: string }> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: embryo } = await (supabase as any)
    .from("embryos")
    .select("id, barn_id, flush_id, donor_horse_id, stallion_horse_id, status")
    .eq("id", embryoId)
    .single();

  if (!embryo) return { error: "Embryo not found" };
  if (embryo.status !== "in_bank_fresh" && embryo.status !== "in_bank_frozen") {
    return { error: "Embryo is not available for transfer" };
  }

  const canEdit = await canUserEditHorse(supabase, user.id, embryo.barn_id);
  if (!canEdit) return { error: "No permission" };

  const surrogateHorseId = String(formData.get("surrogate_horse_id") ?? "").trim();
  if (!surrogateHorseId) return { error: "Surrogate mare is required" };

  const transferDate = String(formData.get("transfer_date") ?? "").trim()
    || new Date().toISOString().slice(0, 10);
  const vetName = String(formData.get("transfer_veterinarian_name") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  // Calculate expected foaling date: transfer_date + 340 days
  const transferDateObj = new Date(transferDate);
  const expectedFoalDate = new Date(transferDateObj);
  expectedFoalDate.setDate(expectedFoalDate.getDate() + 340);
  const expectedFoalDateStr = expectedFoalDate.toISOString().slice(0, 10);

  // Create pregnancy
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pregnancy, error: pErr } = await (supabase as any)
    .from("pregnancies")
    .insert({
      barn_id: embryo.barn_id,
      embryo_id: embryoId,
      surrogate_horse_id: surrogateHorseId,
      donor_horse_id: embryo.donor_horse_id,
      stallion_horse_id: embryo.stallion_horse_id,
      transfer_date: transferDate,
      transfer_veterinarian_name: vetName,
      expected_foaling_date: expectedFoalDateStr,
      notes,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (pErr) return { error: pErr.message };

  // Update embryo status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("embryos")
    .update({ status: "transferred", updated_at: new Date().toISOString() })
    .eq("id", embryoId);

  // Update surrogate reproductive status
  await supabase
    .from("horses")
    .update({ reproductive_status: "bred" } as Record<string, unknown>)
    .eq("id", surrogateHorseId);

  revalidatePath(`/embryo-bank/${embryoId}`);
  revalidatePath("/embryo-bank");
  revalidatePath(`/horses/${surrogateHorseId}`);

  return { pregnancyId: pregnancy.id };
}

/**
 * Freeze an embryo (send to storage).
 */
export async function freezeEmbryoAction(
  embryoId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: embryo } = await (supabase as any)
    .from("embryos")
    .select("id, barn_id, status")
    .eq("id", embryoId)
    .single();

  if (!embryo) return { error: "Embryo not found" };
  if (embryo.status !== "in_bank_fresh") return { error: "Only fresh embryos can be frozen" };

  const canEdit = await canUserEditHorse(supabase, user.id, embryo.barn_id);
  if (!canEdit) return { error: "No permission" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("embryos")
    .update({
      status: "in_bank_frozen",
      storage_facility: String(formData.get("storage_facility") ?? "").trim() || null,
      storage_tank: String(formData.get("storage_tank") ?? "").trim() || null,
      storage_cane: String(formData.get("storage_cane") ?? "").trim() || null,
      storage_position: String(formData.get("storage_position") ?? "").trim() || null,
      freeze_date: String(formData.get("freeze_date") ?? "").trim() || new Date().toISOString().slice(0, 10),
      freeze_method: String(formData.get("freeze_method") ?? "vitrification"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", embryoId);

  if (error) return { error: error.message };

  revalidatePath(`/embryo-bank/${embryoId}`);
  revalidatePath("/embryo-bank");
  return {};
}

/**
 * Ship out an embryo.
 */
export async function shipEmbryoAction(
  embryoId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: embryo } = await (supabase as any)
    .from("embryos")
    .select("id, barn_id, status")
    .eq("id", embryoId)
    .single();

  if (!embryo) return { error: "Embryo not found" };
  const canEdit = await canUserEditHorse(supabase, user.id, embryo.barn_id);
  if (!canEdit) return { error: "No permission" };

  const salePriceRaw = String(formData.get("sale_price") ?? "").trim();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("embryos")
    .update({
      status: "shipped_out",
      shipped_to: String(formData.get("shipped_to") ?? "").trim() || null,
      ship_date: String(formData.get("ship_date") ?? "").trim() || new Date().toISOString().slice(0, 10),
      sale_price: salePriceRaw ? parseFloat(salePriceRaw) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", embryoId);

  if (error) return { error: error.message };

  revalidatePath(`/embryo-bank/${embryoId}`);
  revalidatePath("/embryo-bank");
  return {};
}

/**
 * Permanently delete an embryo.
 */
export async function deleteEmbryoAction(
  embryoId: string,
): Promise<{ error?: string }> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: embryo } = await (supabase as any)
    .from("embryos")
    .select("id, barn_id, flush_id, donor_horse_id, status")
    .eq("id", embryoId)
    .single();

  if (!embryo) return { error: "Embryo not found" };

  // Only allow deleting embryos that haven't been transferred/became a foal
  if (embryo.status === "transferred" || embryo.status === "became_foal") {
    return { error: "Cannot delete an embryo that has been transferred or became a foal" };
  }

  const canEdit = await canUserEditHorse(supabase, user.id, embryo.barn_id);
  if (!canEdit) return { error: "No permission" };

  // Delete embryo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("embryos")
    .delete()
    .eq("id", embryoId);

  if (error) return { error: error.message };

  // Update flush embryo count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (supabase as any)
    .from("embryos")
    .select("id", { count: "exact", head: true })
    .eq("flush_id", embryo.flush_id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("flushes")
    .update({ embryo_count: count ?? 0, updated_at: new Date().toISOString() })
    .eq("id", embryo.flush_id);

  // Note: lifetime_embryo_count on donor not decremented to preserve historical accuracy

  revalidatePath("/embryo-bank");
  return {};
}

/**
 * Mark an embryo as lost.
 */
export async function markEmbryoLostAction(
  embryoId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: embryo } = await (supabase as any)
    .from("embryos")
    .select("id, barn_id, status")
    .eq("id", embryoId)
    .single();

  if (!embryo) return { error: "Embryo not found" };
  const canEdit = await canUserEditHorse(supabase, user.id, embryo.barn_id);
  if (!canEdit) return { error: "No permission" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("embryos")
    .update({
      status: "lost",
      loss_reason: String(formData.get("loss_reason") ?? "other"),
      loss_date: String(formData.get("loss_date") ?? "").trim() || new Date().toISOString().slice(0, 10),
      loss_notes: String(formData.get("loss_notes") ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", embryoId);

  if (error) return { error: error.message };

  revalidatePath(`/embryo-bank/${embryoId}`);
  revalidatePath("/embryo-bank");
  return {};
}
