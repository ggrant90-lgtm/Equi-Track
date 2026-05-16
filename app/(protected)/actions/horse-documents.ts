"use server";

import { createServerComponentClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { revalidatePath } from "next/cache";
import { canUserEditHorse, canUserAccessHorse } from "@/lib/horse-access";
import { canUserUseDocumentScanner } from "@/lib/document-scanner/access";
import { ensureClientForOwnerName } from "@/lib/clients-sync";
import { HORSE_DOCUMENTS_BUCKET } from "@/lib/horse-documents";
import type { ExtractedHorseData } from "@/lib/document-extraction-prompt";
import { runEngagementHooks } from "@/lib/engagement/dispatcher";
import { stashPendingCelebrations } from "@/lib/engagement/pending-celebrations";

/** Guard: require the user has scanner access + edit rights on the horse. */
async function requireScannerEdit(horseId: string) {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: horse } = await (supabase as any)
    .from("horses")
    .select("barn_id")
    .eq("id", horseId)
    .maybeSingle();
  if (!horse) return { error: "Horse not found" as const };

  const scannerOk = await canUserUseDocumentScanner(
    supabase,
    user.id,
    horse.barn_id,
  );
  if (!scannerOk) return { error: "Document scanner access required" as const };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canEdit = await canUserEditHorse(supabase as any, user.id, horse.barn_id);
  if (!canEdit) return { error: "You can't edit this horse" as const };

  return { supabase, userId: user.id, barnId: horse.barn_id as string };
}

/** Guard for pre-horse pending uploads: user has scanner access for this barn
 *  and is a barn owner/member. No horseId yet. */
async function requireScannerBarnAccess(barnId: string) {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };

  const scannerOk = await canUserUseDocumentScanner(supabase, user.id, barnId);
  if (!scannerOk) return { error: "Document scanner access required" as const };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: barn } = await (supabase as any)
    .from("barns")
    .select("owner_id")
    .eq("id", barnId)
    .maybeSingle();
  if (!barn) return { error: "Barn not found" as const };

  if (barn.owner_id !== user.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: member } = await (supabase as any)
      .from("barn_members")
      .select("id")
      .eq("barn_id", barnId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) return { error: "You can't upload to this barn" as const };
  }

  return { supabase, userId: user.id };
}

// ──────────────────────────────────────────────────────────────
// Signed upload URLs — bypass Storage RLS by using the service-role
// client to mint a signed URL after the app-layer auth check passes.
// Mirrors the 4d18c68 pattern (admin-client write after app auth) so
// a flaky `is_barn_owner`/`is_barn_member` helper can't block legit
// scanner uploads.
// ──────────────────────────────────────────────────────────────

const SCAN_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "application/pdf",
]);
const SCAN_MAX_SIZE = 15 * 1024 * 1024;

function sanitizeFileName(name: string): string {
  const trimmed = name.trim().slice(0, 120);
  return trimmed
    .replace(/[\\/]/g, "-")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._\-]/g, "");
}

function newUniq(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface SignedUploadResult {
  signedUrl: string;
  token: string;
  file_path: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string;
}

/**
 * Existing-horse scan upload. Path: {barn_id}/{horse_id}/{uuid}-{name}.
 * The signed URL is minted with the service role so the upload itself
 * does not go through Storage RLS.
 */
export async function createHorseDocumentSignedUploadAction(input: {
  horseId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}): Promise<{ ok?: true; upload?: SignedUploadResult; error?: string }> {
  if (!SCAN_ALLOWED_MIME.has(input.mimeType)) {
    return { error: "Only JPEG, PNG, HEIC, or PDF files are accepted." };
  }
  if (input.fileSize > SCAN_MAX_SIZE) {
    return { error: "File is too large. Maximum size is 15 MB." };
  }

  const auth = await requireScannerEdit(input.horseId);
  if ("error" in auth) return { error: auth.error };

  const safe = sanitizeFileName(input.fileName) || "document";
  const path = `${auth.barnId}/${input.horseId}/${newUniq()}-${safe}`;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).storage
    .from(HORSE_DOCUMENTS_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data?.signedUrl || !data?.token) {
    return { error: error?.message ?? "Failed to get upload URL" };
  }

  return {
    ok: true,
    upload: {
      signedUrl: data.signedUrl as string,
      token: data.token as string,
      file_path: path,
      file_name: input.fileName,
      file_size_bytes: input.fileSize,
      mime_type: input.mimeType,
    },
  };
}

/**
 * Pre-horse pending upload (for the new-horse-from-scan flow).
 * Path: {barn_id}/_pending/{uuid}-{name}.
 */
export async function createPendingHorseDocumentSignedUploadAction(input: {
  barnId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}): Promise<{ ok?: true; upload?: SignedUploadResult; error?: string }> {
  if (!SCAN_ALLOWED_MIME.has(input.mimeType)) {
    return { error: "Only JPEG, PNG, HEIC, or PDF files are accepted." };
  }
  if (input.fileSize > SCAN_MAX_SIZE) {
    return { error: "File is too large. Maximum size is 15 MB." };
  }

  const auth = await requireScannerBarnAccess(input.barnId);
  if ("error" in auth) return { error: auth.error };

  const safe = sanitizeFileName(input.fileName) || "document";
  const path = `${input.barnId}/_pending/${newUniq()}-${safe}`;

  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).storage
    .from(HORSE_DOCUMENTS_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data?.signedUrl || !data?.token) {
    return { error: error?.message ?? "Failed to get upload URL" };
  }

  return {
    ok: true,
    upload: {
      signedUrl: data.signedUrl as string,
      token: data.token as string,
      file_path: path,
      file_name: input.fileName,
      file_size_bytes: input.fileSize,
      mime_type: input.mimeType,
    },
  };
}

export interface NewHorseDocumentInput {
  horseId: string;
  document_type:
    | "coggins"
    | "registration"
    | "health_certificate"
    | "vet_record"
    | "other";
  title?: string | null;
  file_path: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string;
  extracted_data?: ExtractedHorseData | null;
  scan_confidence?: "high" | "medium" | "low" | null;
  document_date?: string | null;
  expiration_date?: string | null;
  notes?: string | null;
}

/**
 * Write a horse_documents row. The file must already be in the
 * `horse-documents` bucket at `input.file_path`.
 */
export async function createHorseDocumentAction(
  input: NewHorseDocumentInput,
): Promise<{ ok?: true; docId?: string; error?: string }> {
  const auth = await requireScannerEdit(input.horseId);
  if ("error" in auth) return { error: auth.error };

  const payload = {
    horse_id: input.horseId,
    barn_id: auth.barnId,
    document_type: input.document_type,
    title: input.title?.trim() || null,
    file_path: input.file_path,
    file_name: input.file_name,
    file_size_bytes: input.file_size_bytes,
    mime_type: input.mime_type,
    extracted_data: input.extracted_data ?? null,
    scan_confidence: input.scan_confidence ?? null,
    document_date: input.document_date ?? null,
    expiration_date: input.expiration_date ?? null,
    notes: input.notes?.trim() || null,
    uploaded_by_user_id: auth.userId,
  };

  // App-layer auth already verified this user can edit this horse. Use the
  // service-role client for the INSERT to dodge the flaky SECURITY DEFINER
  // helper path that 4d18c68 worked around for horses_insert.
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("horse_documents")
    .insert(payload)
    .select("id")
    .single();
  if (error || !data) {
    return { error: error?.message ?? "Failed to save document" };
  }

  // Engagement: first_document_scan + all_coggins_current. Fire and
  // forget — failures inside the dispatcher are swallowed.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: horseRow } = await (admin as any)
      .from("horses")
      .select("name, barn_id")
      .eq("id", input.horseId)
      .maybeSingle();
    const { data: barnRow } = horseRow?.barn_id
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any)
          .from("barns")
          .select("name")
          .eq("id", horseRow.barn_id)
          .maybeSingle()
      : { data: null };
    const supabase = await createServerComponentClient();
    const eng = await runEngagementHooks(supabase, {
      userId: auth.userId,
      event: "document_scanned",
      barnId: auth.barnId,
      horseId: input.horseId,
      horseName: horseRow?.name ?? undefined,
      barnName: barnRow?.name ?? undefined,
    });
    if (eng.celebrations.length > 0) {
      await stashPendingCelebrations(eng.celebrations);
    }
  } catch {
    /* engagement is best-effort */
  }

  revalidatePath(`/horses/${input.horseId}`);
  revalidatePath("/dashboard");
  return { ok: true, docId: data.id as string };
}

/**
 * After user confirms the extraction: update approved horse fields,
 * write the horse_documents row, and create a health_records row for
 * coggins/health-certificate docs with test date + expiration.
 */
export async function applyExtractionToHorseAction(input: {
  horseId: string;
  doc: NewHorseDocumentInput;
  /**
   * Only the fields the user explicitly approved. Keys must exist on the
   * horses table — we filter server-side as a belt-and-suspenders check.
   */
  horsePatch?: Partial<{
    breed: string;
    sex: string;
    color: string;
    foal_date: string;
    sire: string;
    dam: string;
    registration_number: string;
    microchip_number: string;
    owner_name: string;
  }>;
}): Promise<{
  ok?: true;
  docId?: string;
  healthRecordId?: string | null;
  error?: string;
}> {
  const auth = await requireScannerEdit(input.horseId);
  if ("error" in auth) return { error: auth.error };
  // App-layer auth is done above — use the admin client for the subsequent
  // writes so the SECURITY DEFINER helper path can't block them (same
  // defense as 4d18c68 for horses_insert).
  const db = createAdminClient();

  // 1. Apply horse patch (only approved keys).
  if (input.horsePatch && Object.keys(input.horsePatch).length > 0) {
    const allowed = new Set([
      "breed",
      "sex",
      "color",
      "foal_date",
      "sire",
      "dam",
      "registration_number",
      "microchip_number",
      "owner_name",
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clean: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(input.horsePatch)) {
      if (allowed.has(k) && v !== undefined && v !== null && v !== "") {
        clean[k] = v;
      }
    }
    if (Object.keys(clean).length > 1) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: uErr } = await (db as any)
        .from("horses")
        .update(clean)
        .eq("id", input.horseId);
      if (uErr) return { error: uErr.message };

      // If the approved patch set an owner_name, mirror it into Business
      // Pro Clients (no-op for non-BP barns).
      if (typeof clean.owner_name === "string") {
        const sync = await ensureClientForOwnerName(
          db,
          auth.barnId,
          clean.owner_name,
        );
        if (sync.created) {
          revalidatePath("/business-pro/clients");
          revalidatePath("/business-pro/overview");
        }
      }
    }
  }

  // 2. Insert the horse_documents row.
  const docPayload = {
    horse_id: input.horseId,
    barn_id: auth.barnId,
    document_type: input.doc.document_type,
    title: input.doc.title?.trim() || null,
    file_path: input.doc.file_path,
    file_name: input.doc.file_name,
    file_size_bytes: input.doc.file_size_bytes,
    mime_type: input.doc.mime_type,
    extracted_data: input.doc.extracted_data ?? null,
    scan_confidence: input.doc.scan_confidence ?? null,
    document_date: input.doc.document_date ?? null,
    expiration_date: input.doc.expiration_date ?? null,
    notes: input.doc.notes?.trim() || null,
    uploaded_by_user_id: auth.userId,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: docRow, error: docErr } = await (db as any)
    .from("horse_documents")
    .insert(docPayload)
    .select("id")
    .single();
  if (docErr || !docRow) {
    return { error: docErr?.message ?? "Failed to save document" };
  }
  const docId = docRow.id as string;

  // 3. For coggins: create a linked health_records row.
  let healthRecordId: string | null = null;
  if (
    input.doc.document_type === "coggins" ||
    input.doc.document_type === "health_certificate"
  ) {
    const ex = input.doc.extracted_data;
    const recordDate =
      input.doc.document_date ?? ex?.test_date ?? ex?.document_date ?? null;
    const nextDue = input.doc.expiration_date ?? ex?.expiration_date ?? null;

    // Build a best-effort public URL for document_url back-compat. Note: the
    // bucket is private, so this URL won't be directly downloadable — callers
    // should use the signed-URL action. Stored here as a path reference.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: publicData } = (db as any).storage
      .from(HORSE_DOCUMENTS_BUCKET)
      .getPublicUrl(input.doc.file_path);
    const documentUrl =
      (publicData?.publicUrl as string | undefined) ?? input.doc.file_path;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: hr, error: hrErr } = await (db as any)
      .from("health_records")
      .insert({
        horse_id: input.horseId,
        barn_id: auth.barnId,
        record_type:
          input.doc.document_type === "coggins"
            ? "coggins"
            : "health_certificate",
        provider_name: ex?.vet_name ?? null,
        description:
          input.doc.document_type === "coggins"
            ? `Coggins test${ex?.test_result ? ` — ${ex.test_result}` : ""}`
            : "Health Certificate",
        notes: ex?.extraction_notes ?? null,
        record_date: recordDate ?? new Date().toISOString().slice(0, 10),
        next_due_date: nextDue,
        document_url: documentUrl,
        details: ex ?? null,
        logged_by: auth.userId,
        logged_at_barn_id: auth.barnId,
        performed_by_name: ex?.vet_name ?? null,
        performed_at: recordDate ?? null,
      })
      .select("id")
      .single();
    if (hrErr) {
      // Non-fatal — the document itself saved.
      console.warn("[applyExtraction] health_records insert failed:", hrErr);
    } else if (hr) {
      healthRecordId = hr.id as string;
      // Backlink the document to the health record.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any)
        .from("horse_documents")
        .update({ linked_health_record_id: healthRecordId })
        .eq("id", docId);
    }
  }

  revalidatePath(`/horses/${input.horseId}`);
  revalidatePath("/dashboard");
  return { ok: true, docId, healthRecordId };
}

export async function deleteHorseDocumentAction(
  docId: string,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: doc } = await (supabase as any)
    .from("horse_documents")
    .select("barn_id, horse_id, file_path")
    .eq("id", docId)
    .maybeSingle();
  if (!doc) return { error: "Document not found" };

  const auth = await requireScannerEdit(doc.horse_id);
  if ("error" in auth) return { error: auth.error };

  // App-layer auth is done — use the admin client for the storage + DB
  // delete so a flaky helper can't block cleanup (matches 4d18c68).
  const admin = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any).storage
    .from(HORSE_DOCUMENTS_BUCKET)
    .remove([doc.file_path]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any)
    .from("horse_documents")
    .delete()
    .eq("id", docId);
  if (error) return { error: error.message };

  revalidatePath(`/horses/${doc.horse_id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function getHorseDocumentSignedUrlAction(
  docId: string,
): Promise<{ url?: string; file_name?: string; error?: string }> {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: doc } = await (supabase as any)
    .from("horse_documents")
    .select("horse_id, file_path, file_name")
    .eq("id", docId)
    .maybeSingle();
  if (!doc) return { error: "Document not found" };

  const canAccess = await canUserAccessHorse(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase as any,
    user.id,
    doc.horse_id as string,
  );
  if (!canAccess) return { error: "No access to this horse" };

  // Mint the signed URL with the service-role client so the download
  // bypasses storage.objects RLS — mirrors the upload path above. The
  // app-layer `canUserAccessHorse` check is the real authorization gate;
  // the Storage policies depend on SECURITY DEFINER helpers that can
  // fail for legitimate users in Next.js server-action contexts (see
  // migration 20260419000003_horse_documents_rls_fix.sql).
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).storage
    .from(HORSE_DOCUMENTS_BUCKET)
    .createSignedUrl(doc.file_path, 900);
  if (error || !data?.signedUrl) {
    return { error: error?.message ?? "Failed to generate download link" };
  }
  return { url: data.signedUrl as string, file_name: doc.file_name as string };
}
