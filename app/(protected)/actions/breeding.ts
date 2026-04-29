"use server";

import { canUserEditHorse } from "@/lib/horse-access";
import { createServerComponentClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

/**
 * Record a Traditional Carry breeding event (live cover or AI).
 *
 * Creates a single pregnancy row with the appropriate conception_method
 * ('live_cover', 'ai_fresh', 'ai_cooled', or 'ai_frozen') and
 * `embryo_id = NULL`. The mare carries her own foal, so
 * `surrogate_horse_id = donor_horse_id`.
 *
 * If the mare or sire doesn't exist yet, a new horse row is created
 * first (inline-create pattern).
 *
 * No embryo is created. No flush is created. The mare goes directly
 * into a pending-check pregnancy.
 */
export async function recordLiveCoverAction(formData: FormData) {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const formBarnId = formData.get("barn_id") as string;
  if (!formBarnId) return { error: "Missing barn_id" };

  // ---- Mare (donor / carrier): either existing id or inline-create ----
  // Resolve the mare first so we can use HER barn for the new live-cover
  // row when she's an existing horse. Breeders Pro is cross-barn now,
  // so a mare picked from Barn B shouldn't end up with a Barn A
  // pregnancy because the page anchored there.
  let mareId: string;
  let resolvedBarnId: string | null = null;
  const mareMode = formData.get("mare_mode") as string;

  if (mareMode === "new") {
    // New horse goes into the page's anchor barn.
    const canEdit = await canUserEditHorse(supabase, user.id, formBarnId);
    if (!canEdit) return { error: "No permission to edit this barn" };
    resolvedBarnId = formBarnId;

    const mareName = (formData.get("mare_name") as string)?.trim();
    if (!mareName) return { error: "Mare name is required" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newMare, error: mareErr } = await (supabase as any)
      .from("horses")
      .insert({
        barn_id: resolvedBarnId,
        name: mareName,
        sex: "mare",
        breeding_role: "donor",
        registration_number:
          (formData.get("mare_registration") as string)?.trim() || null,
        breed: (formData.get("mare_breed") as string)?.trim() || null,
        color: (formData.get("mare_color") as string)?.trim() || null,
        foal_date: (formData.get("mare_foal_date") as string) || null,
        breeding_only: formData.get("mare_add_to_barnbook") !== "true",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (mareErr || !newMare) {
      return { error: mareErr?.message ?? "Failed to create mare" };
    }
    mareId = (newMare as { id: string }).id;
  } else {
    mareId = formData.get("mare_id") as string;
    if (!mareId) return { error: "Mare is required" };
    const { data: mareRow } = await supabase
      .from("horses")
      .select("barn_id")
      .eq("id", mareId)
      .maybeSingle();
    if (!mareRow) return { error: "Mare not found" };
    resolvedBarnId = (mareRow as { barn_id: string }).barn_id;
    const canEdit = await canUserEditHorse(supabase, user.id, resolvedBarnId);
    if (!canEdit) {
      return { error: "No permission to record this for that barn" };
    }
  }
  const barnId = resolvedBarnId;

  // ---- Sire: either existing id or inline-create ----
  let stallionId: string;
  const sireMode = formData.get("sire_mode") as string;

  if (sireMode === "new") {
    const sireName = (formData.get("sire_name") as string)?.trim();
    if (!sireName) return { error: "Sire name is required" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newSire, error: sireErr } = await (supabase as any)
      .from("horses")
      .insert({
        barn_id: barnId,
        name: sireName,
        sex: "stallion",
        breeding_role: "stallion",
        registration_number:
          (formData.get("sire_registration") as string)?.trim() || null,
        breed: (formData.get("sire_breed") as string)?.trim() || null,
        color: (formData.get("sire_color") as string)?.trim() || null,
        foal_date: (formData.get("sire_foal_date") as string) || null,
        breeding_only: formData.get("sire_add_to_barnbook") !== "true",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (sireErr || !newSire) {
      return { error: sireErr?.message ?? "Failed to create sire" };
    }
    stallionId = (newSire as { id: string }).id;
  } else {
    stallionId = formData.get("stallion_id") as string;
    if (!stallionId) return { error: "Stallion is required" };
  }

  // ---- Breeding category & shared fields ----
  const breedingCategory = formData.get("breeding_category") as string || "live_cover";
  const isAI = breedingCategory === "ai";

  const coverDate =
    (formData.get("cover_date") as string) ||
    new Date().toISOString().slice(0, 10);
  const coverCostStr = formData.get("cover_cost") as string;
  const coverCost = coverCostStr ? parseFloat(coverCostStr) : null;
  const veterinarian =
    (formData.get("veterinarian") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;

  // ---- Live Cover specific fields ----
  const coverMethod = !isAI
    ? (formData.get("cover_method") as string)?.trim() || null
    : null;
  const coverCountStr = !isAI ? (formData.get("cover_count") as string) : null;
  const coverCount = coverCountStr ? parseInt(coverCountStr, 10) : null;

  // ---- AI specific fields ----
  const semenType = isAI
    ? (formData.get("semen_type") as string) || "ai_fresh"
    : null;
  const semenSource = isAI
    ? (formData.get("semen_source") as string)?.trim() || null
    : null;
  const collectionDate = isAI
    ? (formData.get("collection_date") as string) || null
    : null;
  const inseminationTechnique = isAI
    ? (formData.get("insemination_technique") as string)?.trim() || null
    : null;
  const semenVolumeStr = isAI ? (formData.get("semen_volume") as string) : null;
  const semenVolumeMl = semenVolumeStr ? parseFloat(semenVolumeStr) : null;
  const motilityStr = isAI ? (formData.get("motility_percent") as string) : null;
  const motilityPercent = motilityStr ? parseFloat(motilityStr) : null;
  const semenDose = isAI
    ? (formData.get("semen_dose") as string)?.trim() || null
    : null;

  // ---- Conception method ----
  const conceptionMethod = isAI ? semenType! : "live_cover";

  // ---- Expected foaling date: ~340 days from breeding date ----
  const coverDateObj = new Date(coverDate);
  const expectedFoaling = new Date(coverDateObj);
  expectedFoaling.setDate(expectedFoaling.getDate() + 340);
  const expectedFoalingStr = expectedFoaling.toISOString().slice(0, 10);

  // ---- Insert the pregnancy ----
  // Traditional carry: mare carries her own foal, so
  // surrogate_horse_id = donor_horse_id = the mare being bred.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pregnancy, error: pregErr } = await (supabase as any)
    .from("pregnancies")
    .insert({
      barn_id: barnId,
      embryo_id: null,
      donor_horse_id: mareId,
      surrogate_horse_id: mareId,
      stallion_horse_id: stallionId,
      conception_method: conceptionMethod,
      transfer_date: coverDate,
      expected_foaling_date: expectedFoalingStr,
      status: "pending_check",
      cover_method: coverMethod,
      cover_count: coverCount,
      cover_cost: coverCost,
      semen_source: semenSource,
      collection_date: collectionDate,
      insemination_technique: inseminationTechnique,
      semen_volume_ml: semenVolumeMl,
      motility_percent: motilityPercent,
      semen_dose: semenDose,
      notes: [
        veterinarian ? `Vet: ${veterinarian}` : null,
        notes,
      ]
        .filter(Boolean)
        .join("\n") || null,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (pregErr || !pregnancy) {
    return { error: pregErr?.message ?? "Failed to create pregnancy" };
  }

  const pregId = (pregnancy as { id: string }).id;

  // ---- Revalidate relevant paths ----
  revalidatePath("/breeders-pro/pregnancies");
  revalidatePath(`/breeders-pro/pregnancy/${pregId}`);
  revalidatePath(`/breeders-pro/donors/${mareId}`);
  revalidatePath(`/breeders-pro/stallions/${stallionId}`);
  revalidatePath("/breeders-pro");

  return { success: true, pregnancyId: pregId };
}
