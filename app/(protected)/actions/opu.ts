"use server";

import { canUserEditHorse } from "@/lib/horse-access";
import { createServerComponentClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

/**
 * Breeders Pro — Record OPU Session with individual oocyte creation.
 *
 * Calls the `create_opu_with_oocytes` RPC which atomically creates:
 *   1. An opu_sessions row
 *   2. N individual oocyte rows with auto-generated codes (OC-YYYY-NNNN)
 *
 * Supports inline donor mare creation (same pattern as flush + live cover).
 */
export async function recordOPUAction(
  formData: FormData,
): Promise<{
  opuSessionId?: string;
  oocyteCount?: number;
  error?: string;
}> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const formBarnId = formData.get("barn_id") as string;
  if (!formBarnId) return { error: "No barn context" };

  // --- Resolve or create donor mare ---
  // For an existing donor we anchor the OPU session to HER barn so
  // cross-barn picks (Breeders Pro now spans every operational barn)
  // don't fail validation against the page's anchor.
  let donorHorseId = formData.get("donor_horse_id") as string | null;
  let resolvedBarnId: string | null = null;
  const donorMode = formData.get("donor_mode") as string;

  if (donorMode === "new") {
    const canEdit = await canUserEditHorse(supabase, user.id, formBarnId);
    if (!canEdit) return { error: "No permission" };
    resolvedBarnId = formBarnId;

    const donorName = (formData.get("donor_name") as string)?.trim();
    if (!donorName) return { error: "Donor mare name is required" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newHorse, error: horseErr } = await (supabase as any)
      .from("horses")
      .insert({
        barn_id: resolvedBarnId,
        name: donorName,
        sex: "mare",
        breeding_role: "donor",
        registration_number:
          (formData.get("donor_registration") as string)?.trim() || null,
        breed: (formData.get("donor_breed") as string)?.trim() || null,
        color: (formData.get("donor_color") as string)?.trim() || null,
        foal_date:
          (formData.get("donor_foal_date") as string)?.trim() || null,
        breeding_only: formData.get("donor_add_to_barnbook") !== "true",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (horseErr || !newHorse)
      return { error: horseErr?.message ?? "Failed to create donor mare" };
    donorHorseId = newHorse.id;
  } else {
    if (!donorHorseId) return { error: "Donor mare is required" };
    const { data: donorRow } = await supabase
      .from("horses")
      .select("barn_id")
      .eq("id", donorHorseId)
      .maybeSingle();
    if (!donorRow) return { error: "Donor mare not found" };
    resolvedBarnId = (donorRow as { barn_id: string }).barn_id;
    const canEdit = await canUserEditHorse(supabase, user.id, resolvedBarnId);
    if (!canEdit) {
      return { error: "No permission to record this for that barn" };
    }
  }

  if (!donorHorseId) return { error: "Donor mare is required" };
  const barnId = resolvedBarnId;

  // --- Parse form fields ---
  const opuDate =
    (formData.get("opu_date") as string) ||
    new Date().toISOString().slice(0, 10);
  const veterinarian =
    (formData.get("veterinarian") as string)?.trim() || null;
  const facility = (formData.get("facility") as string)?.trim() || null;
  const oocytesRecovered = parseInt(
    formData.get("oocytes_recovered") as string,
    10,
  );
  if (!oocytesRecovered || oocytesRecovered < 1)
    return { error: "At least 1 oocyte must be recovered" };

  const oocytesMature = formData.get("oocytes_mature")
    ? parseInt(formData.get("oocytes_mature") as string, 10)
    : null;
  const oocytesImmature = formData.get("oocytes_immature")
    ? parseInt(formData.get("oocytes_immature") as string, 10)
    : null;
  const cost = formData.get("cost")
    ? parseFloat(formData.get("cost") as string)
    : null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  // --- Call the atomic RPC ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "create_opu_with_oocytes",
    {
      p_barn_id: barnId,
      p_donor_horse_id: donorHorseId,
      p_opu_date: opuDate,
      p_veterinarian: veterinarian,
      p_facility: facility,
      p_oocytes_recovered: oocytesRecovered,
      p_oocytes_mature: oocytesMature,
      p_oocytes_immature: oocytesImmature,
      p_cost: cost,
      p_notes: notes,
      p_created_by: user.id,
    },
  );

  if (error) return { error: error.message };

  const result = data as {
    opu_session_id: string;
    oocyte_codes: string[];
    oocytes_created: number;
  };

  // Revalidate relevant pages
  revalidatePath("/breeders-pro");
  revalidatePath(`/breeders-pro/donors/${donorHorseId}`);

  return {
    opuSessionId: result.opu_session_id,
    oocyteCount: result.oocytes_created,
  };
}

/**
 * Assign oocytes to an ICSI batch.
 *
 * Creates an icsi_batches row and updates the selected oocytes'
 * icsi_batch_id and status to 'shipped'.
 *
 * Supports inline stallion and lab creation.
 */
export async function createICSIBatchAction(
  formData: FormData,
): Promise<{
  batchId?: string;
  error?: string;
}> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const barnId = formData.get("barn_id") as string;
  if (!barnId) return { error: "No barn context" };

  const canEdit = await canUserEditHorse(supabase, user.id, barnId);
  if (!canEdit) return { error: "No permission" };

  const opuSessionId = formData.get("opu_session_id") as string;
  if (!opuSessionId) return { error: "OPU session is required" };

  // Parse selected oocyte IDs (comma-separated)
  const oocyteIdsRaw = formData.get("oocyte_ids") as string;
  const oocyteIds = oocyteIdsRaw
    ? oocyteIdsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  if (oocyteIds.length === 0)
    return { error: "At least one oocyte must be selected" };

  // --- Resolve or create stallion ---
  let stallionHorseId = formData.get("stallion_horse_id") as string | null;
  const stallionMode = formData.get("stallion_mode") as string;

  if (stallionMode === "new") {
    const stallionName = (formData.get("stallion_name") as string)?.trim();
    if (!stallionName) return { error: "Stallion name is required" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newHorse, error: horseErr } = await (supabase as any)
      .from("horses")
      .insert({
        barn_id: barnId,
        name: stallionName,
        sex: "stallion",
        breeding_role: "stallion",
        registration_number:
          (formData.get("stallion_registration") as string)?.trim() || null,
        breed: (formData.get("stallion_breed") as string)?.trim() || null,
        color: (formData.get("stallion_color") as string)?.trim() || null,
        foal_date:
          (formData.get("stallion_foal_date") as string)?.trim() || null,
        breeding_only: formData.get("stallion_add_to_barnbook") !== "true",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (horseErr || !newHorse)
      return { error: horseErr?.message ?? "Failed to create stallion" };
    stallionHorseId = newHorse.id;
  }

  if (!stallionHorseId) return { error: "Stallion is required" };

  // --- Resolve or create lab ---
  let labId = formData.get("lab_id") as string | null;
  const labMode = formData.get("lab_mode") as string;

  if (labMode === "new") {
    const labName = (formData.get("lab_name") as string)?.trim();
    if (!labName) return { error: "Lab name is required" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newLab, error: labErr } = await (supabase as any)
      .from("icsi_labs")
      .insert({
        barn_id: barnId,
        name: labName,
        city: (formData.get("lab_city") as string)?.trim() || null,
        state_province:
          (formData.get("lab_state") as string)?.trim() || null,
        contact_name:
          (formData.get("lab_contact_name") as string)?.trim() || null,
        contact_phone:
          (formData.get("lab_contact_phone") as string)?.trim() || null,
        contact_email:
          (formData.get("lab_contact_email") as string)?.trim() || null,
        created_by_user_id: user.id,
      })
      .select("id")
      .single();

    if (labErr || !newLab)
      return { error: labErr?.message ?? "Failed to create lab" };
    labId = newLab.id;
  }

  // --- Parse batch fields ---
  const semenType =
    (formData.get("semen_type") as string)?.trim() || null;
  const shippedDate =
    (formData.get("shipped_date") as string)?.trim() || null;
  const shipTrackingToLab =
    (formData.get("ship_tracking_to_lab") as string)?.trim() || null;
  const cost = formData.get("cost")
    ? parseFloat(formData.get("cost") as string)
    : null;
  const shippingCost = formData.get("shipping_cost")
    ? parseFloat(formData.get("shipping_cost") as string)
    : null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  // --- Create the batch ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: batch, error: batchErr } = await (supabase as any)
    .from("icsi_batches")
    .insert({
      barn_id: barnId,
      opu_session_id: opuSessionId,
      stallion_horse_id: stallionHorseId,
      lab_id: labId || null,
      semen_type: semenType,
      shipped_date: shippedDate,
      ship_tracking_to_lab: shipTrackingToLab,
      cost,
      shipping_cost: shippingCost,
      notes,
      status: shippedDate ? "shipped" : "pending",
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (batchErr || !batch)
    return { error: batchErr?.message ?? "Failed to create ICSI batch" };

  // --- Update oocytes: assign to batch and set status ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateErr } = await (supabase as any)
    .from("oocytes")
    .update({
      icsi_batch_id: batch.id,
      status: shippedDate ? "shipped" : "recovered",
      updated_at: new Date().toISOString(),
    })
    .in("id", oocyteIds);

  if (updateErr)
    return { error: `Batch created but oocyte update failed: ${updateErr.message}` };

  // Revalidate
  revalidatePath("/breeders-pro");
  revalidatePath(`/breeders-pro/opu/${opuSessionId}`);

  return { batchId: batch.id };
}

/**
 * Record ICSI results — per-oocyte outcomes.
 *
 * Calls the `record_icsi_results` RPC which atomically:
 *   - Creates embryo rows for 'developed' oocytes (source_type='icsi')
 *   - Marks 'failed' oocytes with their failure reason
 *   - Completes the batch
 */
export async function recordICSIResultsAction(
  batchId: string,
  results: Array<{
    oocyte_id: string;
    outcome: "developed" | "failed";
    failure_reason?: string;
    grade?: string;
    stage?: string;
  }>,
): Promise<{
  embryosCreated?: number;
  error?: string;
}> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Verify permission via the batch's barn
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: batch } = await (supabase as any)
    .from("icsi_batches")
    .select("barn_id")
    .eq("id", batchId)
    .single();
  if (!batch) return { error: "Batch not found" };

  const canEdit = await canUserEditHorse(supabase, user.id, batch.barn_id);
  if (!canEdit) return { error: "No permission" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "record_icsi_results",
    {
      p_batch_id: batchId,
      p_results: results,
    },
  );

  if (error) return { error: error.message };

  const result = data as {
    embryos_created: number;
    embryo_codes: string[];
  };

  revalidatePath("/breeders-pro");

  return { embryosCreated: result.embryos_created };
}

/**
 * Update an individual oocyte's label, maturity, or notes.
 * Used for the "relabel anytime" feature.
 */
export async function updateOocyteAction(
  oocyteId: string,
  updates: {
    label?: string | null;
    maturity?: string;
    notes?: string | null;
  },
): Promise<{ error?: string }> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: oocyte } = await (supabase as any)
    .from("oocytes")
    .select("barn_id, opu_session_id")
    .eq("id", oocyteId)
    .single();
  if (!oocyte) return { error: "Oocyte not found" };

  const canEdit = await canUserEditHorse(supabase, user.id, oocyte.barn_id);
  if (!canEdit) return { error: "No permission" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("oocytes")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", oocyteId);

  if (error) return { error: error.message };

  revalidatePath(`/breeders-pro/opu/${oocyte.opu_session_id}`);
  return {};
}
