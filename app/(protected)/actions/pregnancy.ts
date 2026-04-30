"use server";

import { canUserEditHorse } from "@/lib/horse-access";
import { createAdminClient } from "@/lib/supabase-admin";
import { createServerComponentClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

/**
 * Log a pregnancy check (14d, 30d, 45d, 60d, 90d).
 * If result is "not_pregnant", cascades: pregnancy→lost, embryo→lost, surrogate→open.
 */
export async function logPregnancyCheckAction(
  pregnancyId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pregnancy } = await (supabase as any)
    .from("pregnancies")
    .select("*")
    .eq("id", pregnancyId)
    .single();

  if (!pregnancy) return { error: "Pregnancy not found" };

  const canEdit = await canUserEditHorse(supabase, user.id, pregnancy.barn_id);
  if (!canEdit) return { error: "No permission" };

  const checkField = String(formData.get("check_field") ?? "");
  const checkResult = String(formData.get("check_result") ?? "confirmed");
  const checkDate = String(formData.get("check_date") ?? "").trim()
    || new Date().toISOString().slice(0, 10);

  const validFields = ["check_14_day", "check_30_day", "check_45_day", "check_60_day", "check_90_day"];
  if (!validFields.includes(checkField)) return { error: "Invalid check field" };

  // Update the check field
  const update: Record<string, unknown> = {
    [checkField]: checkResult,
    [`${checkField}_date`]: checkDate,
    updated_at: new Date().toISOString(),
  };

  // If not pregnant, cascade status changes
  if (checkResult === "not_pregnant") {
    update.status = "lost_early";
    update.loss_date = checkDate;
    update.loss_reason = update.loss_reason ?? "early_pregnancy_loss";

    // Update embryo to lost
    if (pregnancy.embryo_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("embryos")
        .update({
          status: "lost",
          loss_reason: "early_pregnancy_loss",
          loss_date: checkDate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pregnancy.embryo_id);
    }

    // Update surrogate to open
    if (pregnancy.surrogate_horse_id) {
      await supabase
        .from("horses")
        .update({ reproductive_status: "open" } as Record<string, unknown>)
        .eq("id", pregnancy.surrogate_horse_id);
    }

    // Bump donor mare's lifetime loss count. This is the genetic
    // source of the pregnancy — the mare whose program ledger needs
    // the loss recorded. For ET pregnancies the surrogate is
    // logistically affected (status flips to open, above) but the
    // loss "belongs" to the donor's reproductive history.
    if (pregnancy.donor_horse_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).rpc("increment_horse_loss_count", {
        p_horse_id: pregnancy.donor_horse_id,
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("pregnancies")
    .update(update)
    .eq("id", pregnancyId);

  if (error) return { error: error.message };

  revalidatePath(`/embryo-bank/pregnancy/${pregnancyId}`);
  revalidatePath("/embryo-bank");
  return {};
}

/**
 * Record a foaling event.
 */
export async function recordFoalingAction(
  pregnancyId: string,
  formData: FormData,
): Promise<{ foalingId?: string; error?: string }> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pregnancy } = await (supabase as any)
    .from("pregnancies")
    .select("*")
    .eq("id", pregnancyId)
    .single();

  if (!pregnancy) return { error: "Pregnancy not found" };

  const canEdit = await canUserEditHorse(supabase, user.id, pregnancy.barn_id);
  if (!canEdit) return { error: "No permission" };

  const foalingDate = String(formData.get("foal_date") ?? "").trim()
    || new Date().toISOString().slice(0, 10);
  const foalSex = String(formData.get("foal_sex") ?? "").trim() || null;
  const foalColor = String(formData.get("foal_color") ?? "").trim() || null;
  const foalName = String(formData.get("foal_name") ?? "").trim() || null;
  const foalingType = String(formData.get("foaling_type") ?? "normal");
  const vetName = String(formData.get("veterinarian_name") ?? "").trim() || null;
  const complications = String(formData.get("complications") ?? "").trim() || null;
  const createHorseProfile = formData.get("create_horse_profile") === "true";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("record_foaling", {
    p_barn_id: pregnancy.barn_id,
    p_pregnancy_id: pregnancyId,
    p_foaling_date: foalingDate,
    p_foaling_time: null,
    p_foaling_type: foalingType,
    p_foal_sex: foalSex,
    p_foal_color: foalColor,
    p_foal_markings: null,
    p_birth_weight_lbs: null,
    p_placenta_passed: null,
    p_iga_result: null,
    p_foal_alive_24hr: true,
    p_complications: complications,
    p_attending_vet: vetName,
    p_notes: null,
    p_created_by: user.id,
    p_create_horse: createHorseProfile,
    p_foal_name: foalName,
  });

  if (error) return { error: error.message };
  if (!data?.ok) return { error: data?.error ?? "Unknown error" };

  revalidatePath(`/embryo-bank/pregnancy/${pregnancyId}`);
  revalidatePath("/embryo-bank");
  if (pregnancy.surrogate_horse_id) {
    revalidatePath(`/horses/${pregnancy.surrogate_horse_id}`);
  }

  // Also refresh Breeders Pro profile and list pages.
  revalidatePath(`/breeders-pro/pregnancy/${pregnancyId}`);
  revalidatePath("/breeders-pro/pregnancies");
  revalidatePath("/breeders-pro");
  if (pregnancy.surrogate_horse_id) {
    revalidatePath(`/breeders-pro/surrogates/${pregnancy.surrogate_horse_id}`);
    revalidatePath("/breeders-pro/surrogates");
  }
  if (pregnancy.donor_horse_id) {
    revalidatePath(`/breeders-pro/donors/${pregnancy.donor_horse_id}`);
  }

  return { foalingId: data.foaling_id };
}

/**
 * Confirm 30-day survival for a foaling.
 *
 * Only updates `foal_alive_at_30d` on the foaling row. It no longer
 * touches `lifetime_live_foal_count` on the donor — that rollup now
 * happens inside the `record_foaling` RPC at birth time (gated on
 * `p_foal_alive_24hr`). Incrementing here too would double-count.
 * See migration 20260411000001_fix_pregnancy_checks_and_foaling_rollups.sql.
 */
export async function confirmSurvivalAction(
  foalingId: string,
): Promise<{ error?: string }> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: foaling } = await (supabase as any)
    .from("foalings")
    .select("pregnancy_id, pregnancies!inner(barn_id)")
    .eq("id", foalingId)
    .single();

  if (!foaling) return { error: "Foaling not found" };

  const barnId = foaling.pregnancies?.barn_id;
  if (!barnId) return { error: "Barn not found" };

  const canEdit = await canUserEditHorse(supabase, user.id, barnId);
  if (!canEdit) return { error: "No permission" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("foalings")
    .update({
      foal_alive_at_30d: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", foalingId);

  if (error) return { error: error.message };

  revalidatePath(`/embryo-bank/pregnancy/${foaling.pregnancy_id}`);
  revalidatePath("/embryo-bank");
  revalidatePath(`/breeders-pro/pregnancy/${foaling.pregnancy_id}`);
  return {};
}

/**
 * Mark a confirmed (or pending) pregnancy as lost. Different from the
 * not_pregnant cascade in logPregnancyCheckAction in two ways:
 *
 *   1. Available regardless of which check window we're in — a
 *      confirmed-at-30d pregnancy lost at month 7 has no check
 *      window left to fail; it just needs to be marked lost.
 *   2. Lets the user supply the loss timing (early / late / aborted)
 *      and an explicit reason instead of inferring from the check.
 *
 * Cascade is the same shape as the not_pregnant path:
 *   - pregnancy.status        → lost_early | lost_late | aborted
 *   - pregnancy.loss_date     → user-supplied or today
 *   - pregnancy.loss_reason   → user-supplied freeform
 *   - embryo.status           → lost (when ET pregnancy)
 *   - surrogate horse status  → open
 *   - donor horse             → lifetime_loss_count + 1
 */
export async function markPregnancyLostAction(
  pregnancyId: string,
  formData: FormData,
): Promise<{ error?: string; ok?: true }> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pregnancy } = await (supabase as any)
    .from("pregnancies")
    .select("*")
    .eq("id", pregnancyId)
    .single();
  if (!pregnancy) return { error: "Pregnancy not found" };

  const canEdit = await canUserEditHorse(supabase, user.id, pregnancy.barn_id);
  if (!canEdit) return { error: "No permission" };

  // Block re-marking a row that's already a loss, foaled, etc. The
  // user wanted Delete for those cases.
  const alreadyTerminal =
    pregnancy.status === "lost_early" ||
    pregnancy.status === "lost_late" ||
    pregnancy.status === "aborted" ||
    pregnancy.status === "foaled";
  if (alreadyTerminal) {
    return {
      error:
        "This pregnancy is already closed. Delete the record if it was created in error.",
    };
  }

  const lossKindRaw = String(formData.get("loss_kind") ?? "lost_late");
  const lossKind: "lost_early" | "lost_late" | "aborted" =
    lossKindRaw === "lost_early" || lossKindRaw === "aborted"
      ? lossKindRaw
      : "lost_late";
  const lossDate =
    String(formData.get("loss_date") ?? "").trim() ||
    new Date().toISOString().slice(0, 10);
  const lossReason = String(formData.get("loss_reason") ?? "").trim() || null;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  const { error } = await db
    .from("pregnancies")
    .update({
      status: lossKind,
      loss_date: lossDate,
      loss_reason: lossReason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pregnancyId);
  if (error) return { error: error.message };

  // Embryo → lost (ET pregnancies only)
  if (pregnancy.embryo_id) {
    await db
      .from("embryos")
      .update({
        status: "lost",
        loss_reason:
          lossKind === "lost_early"
            ? "early_pregnancy_loss"
            : lossKind === "aborted"
              ? "other"
              : "late_pregnancy_loss",
        loss_date: lossDate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pregnancy.embryo_id);
  }

  // Surrogate → open
  if (pregnancy.surrogate_horse_id) {
    await db
      .from("horses")
      .update({ reproductive_status: "open" })
      .eq("id", pregnancy.surrogate_horse_id);
  }

  // Donor → lifetime_loss_count + 1
  if (pregnancy.donor_horse_id) {
    await db.rpc("increment_horse_loss_count", {
      p_horse_id: pregnancy.donor_horse_id,
    });
  }

  revalidatePath(`/breeders-pro/pregnancy/${pregnancyId}`);
  revalidatePath("/breeders-pro/pregnancies");
  revalidatePath("/breeders-pro");
  if (pregnancy.donor_horse_id) {
    revalidatePath(`/breeders-pro/donors/${pregnancy.donor_horse_id}`);
  }
  if (pregnancy.surrogate_horse_id) {
    revalidatePath(`/breeders-pro/surrogates/${pregnancy.surrogate_horse_id}`);
  }
  return { ok: true };
}

/**
 * Hard-delete a pregnancy row. Used for cleanup when a pregnancy was
 * created in error (wrong donor, wrong stallion, duplicated entry,
 * etc.) — NOT for normal end-of-life flows. A real pregnancy that
 * ended should be marked Lost or Foaled, not deleted.
 *
 * Restricted to barn owners (not editor members). The cascade
 * intentionally undoes the lifetime counters that may have been
 * incremented when the pregnancy was created or marked lost, so the
 * donor's profile reads correctly afterward.
 */
export async function deletePregnancyAction(
  pregnancyId: string,
): Promise<{ error?: string; ok?: true }> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pregnancy } = await (supabase as any)
    .from("pregnancies")
    .select("*")
    .eq("id", pregnancyId)
    .single();
  if (!pregnancy) return { error: "Pregnancy not found" };

  // Owner-only: deletes are destructive enough that editor members
  // shouldn't have it. Mirrors the deleteHorseAction policy.
  const { data: barn } = await supabase
    .from("barns")
    .select("owner_id")
    .eq("id", pregnancy.barn_id)
    .maybeSingle();
  if (!barn || barn.owner_id !== user.id) {
    return { error: "Only the barn owner can delete pregnancies." };
  }

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any;

  // Block delete when a foaling exists — losing the foaling row
  // through a cascade would erase live-foal history we don't want
  // to lose silently. Force the user to delete the foaling first.
  const { count: foalingCount } = await db
    .from("foalings")
    .select("id", { count: "exact", head: true })
    .eq("pregnancy_id", pregnancyId);
  if ((foalingCount ?? 0) > 0) {
    return {
      error:
        "This pregnancy has a foaling record. Delete the foaling first if you really want to remove the pregnancy.",
    };
  }

  // Roll back the loss counter if this row is currently in a loss
  // state — the user may have marked it lost before deciding to
  // delete. Also revert embryo + surrogate state so the program
  // ledger isn't stuck pointing at a deleted row.
  const wasLoss =
    pregnancy.status === "lost_early" ||
    pregnancy.status === "lost_late" ||
    pregnancy.status === "aborted";
  if (wasLoss && pregnancy.donor_horse_id) {
    await db.rpc("decrement_horse_loss_count", {
      p_horse_id: pregnancy.donor_horse_id,
    });
  }

  // Embryo: if it was flipped to lost via this pregnancy, revert to
  // in_bank_fresh so it's still usable. Skip if the embryo already
  // moved on (became_foal, transferred elsewhere, etc.).
  if (pregnancy.embryo_id) {
    const { data: embryo } = await db
      .from("embryos")
      .select("status")
      .eq("id", pregnancy.embryo_id)
      .maybeSingle();
    if (embryo?.status === "lost" || embryo?.status === "transferred") {
      await db
        .from("embryos")
        .update({
          status: "in_bank_fresh",
          loss_reason: null,
          loss_date: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pregnancy.embryo_id);
    }
  }

  // Surrogate: revert to open if she was bred for THIS pregnancy.
  // We can't tell perfectly without more state, but flipping to
  // open is the safe default — if she's actually pregnant on a
  // different cycle, the user can correct from her profile.
  if (pregnancy.surrogate_horse_id) {
    await db
      .from("horses")
      .update({ reproductive_status: "open" })
      .eq("id", pregnancy.surrogate_horse_id);
  }

  const { error } = await db.from("pregnancies").delete().eq("id", pregnancyId);
  if (error) return { error: error.message };

  revalidatePath("/breeders-pro/pregnancies");
  revalidatePath("/breeders-pro");
  if (pregnancy.donor_horse_id) {
    revalidatePath(`/breeders-pro/donors/${pregnancy.donor_horse_id}`);
  }
  if (pregnancy.surrogate_horse_id) {
    revalidatePath(`/breeders-pro/surrogates/${pregnancy.surrogate_horse_id}`);
  }
  return { ok: true };
}
