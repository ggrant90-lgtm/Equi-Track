"use client";

import { createHorseAction } from "@/app/(protected)/actions/horse";
import { updateHorsePhotoUrlAction } from "@/app/(protected)/actions/horse";
import { StallPurchaseFlow, type StallFlowBarnOption } from "@/components/stalls/StallPurchaseFlow";
import { HORSE_BREEDS, HORSE_SEX_OPTIONS } from "@/lib/horse-form-constants";
import { BreedSelect } from "@/components/horse/BreedSelect";
import { uploadHorseProfilePhoto } from "@/lib/horse-photo";
import { createHorseDocumentAction } from "@/app/(protected)/actions/horse-documents";
import { ScanEntryButton } from "@/components/document-scanner/ScanEntryButton";
import { ErrorDetails } from "@/components/ui/ErrorDetails";
import type { ExtractedHorseData } from "@/lib/document-extraction-prompt";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const inputClass =
  "w-full rounded-xl border border-barn-dark/15 bg-white px-4 py-3 text-barn-dark outline-none focus:border-brass-gold focus:ring-2 focus:ring-brass-gold/25";

interface PrefillData {
  extraction: ExtractedHorseData;
  /** Pre-uploaded storage file (path points into the `horse-documents`
   *  bucket under `{barn_id}/_pending/...`). After the new horse is
   *  created, we write a horse_documents row pointing at this path —
   *  no Storage move needed. */
  uploadedDoc?: {
    file_path: string;
    file_name: string;
    file_size_bytes: number;
    mime_type: string;
  };
}

export function NewHorseShell({
  hasDocumentScanner,
  activeBarnId,
  userBarns,
}: {
  hasDocumentScanner: boolean;
  activeBarnId: string | null;
  userBarns: StallFlowBarnOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [prefill, setPrefill] = useState<PrefillData | null>(null);

  // Controlled field values — either empty or populated from extraction.
  const [name, setName] = useState("");
  const [barnName, setBarnName] = useState("");
  const [breed, setBreed] = useState("");
  const [sex, setSex] = useState("");
  const [color, setColor] = useState("");
  const [foalDate, setFoalDate] = useState("");
  const [sire, setSire] = useState("");
  const [dam, setDam] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [microchip, setMicrochip] = useState("");

  // Pick up a sessionStorage handoff from /identify → /horses/new when the
  // user scanned a document from the Scan page and there was no match.
  // The handoff carries both the extraction AND the pre-uploaded file
  // metadata (from the pending Storage path).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("barnbook:scan-prefill");
      if (raw) {
        const data = JSON.parse(raw) as {
          extraction: ExtractedHorseData;
          uploadedDoc?: PrefillData["uploadedDoc"];
        };
        applyExtraction(data.extraction);
        setPrefill({
          extraction: data.extraction,
          uploadedDoc: data.uploadedDoc,
        });
        sessionStorage.removeItem("barnbook:scan-prefill");
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyExtraction = (e: ExtractedHorseData) => {
    if (e.horse_name && !name) setName(e.horse_name);
    if (e.breed && !breed) setBreed(matchBreed(e.breed));
    if (e.sex && !sex) setSex(matchSex(e.sex));
    if (e.color && !color) setColor(e.color);
    if (e.foal_date && !foalDate) setFoalDate(e.foal_date);
    if (e.sire && !sire) setSire(e.sire);
    if (e.dam && !dam) setDam(e.dam);
    if (e.registration_number && !regNumber)
      setRegNumber(e.registration_number);
    if (e.microchip_number && !microchip) setMicrochip(e.microchip_number);
  };

  const prefillBanner = useMemo(() => {
    if (!prefill) return null;
    const e = prefill.extraction;
    const kind =
      e.document_type === "registration"
        ? "registration papers"
        : e.document_type === "coggins"
          ? "coggins test"
          : e.document_type === "health_certificate"
            ? "health certificate"
            : "document";
    return `Pre-filled from ${kind}${e.overall_confidence === "low" ? " — verify the highlighted fields" : ""}.`;
  }, [prefill]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const fd = new FormData(e.currentTarget);
    const res = await createHorseAction(null, fd);
    if (res?.error) {
      if (res.error === "BARN_FULL") {
        setShowUpgrade(true);
        setPending(false);
        return;
      }
      setError(res.error);
      setPending(false);
      return;
    }
    const horseId = res?.horseId;
    if (!horseId) {
      setError("Could not create horse.");
      setPending(false);
      return;
    }

    // Photo upload (unchanged).
    if (file) {
      const up = await uploadHorseProfilePhoto(horseId, file);
      if ("error" in up) {
        setError(`Horse created; photo upload failed: ${up.error}`);
        setPending(false);
        router.push(`/horses/${horseId}`);
        return;
      }
      const photoRes = await updateHorsePhotoUrlAction(horseId, up.publicUrl);
      if (photoRes.error) {
        setError(
          `Horse created; could not save photo URL: ${photoRes.error}`,
        );
      }
    }

    // If the form was pre-filled from a scanned document, attach that
    // document to the new horse's profile. The file was already uploaded
    // to a pending Storage path by the ScanModal — here we just write
    // the horse_documents row pointing at it. Non-fatal: the horse is
    // already created, but we surface the raw error so we can tell
    // *why* the attach failed (used to be swallowed silently).
    if (prefill?.uploadedDoc) {
      try {
        const ex = prefill.extraction;
        const docRes = await createHorseDocumentAction({
          horseId,
          document_type:
            ex.document_type === "unknown" ? "other" : ex.document_type,
          title:
            ex.document_type === "coggins"
              ? `Coggins — ${ex.test_date ?? "no date"}`
              : ex.document_type === "registration"
                ? `Registration — ${ex.registry ?? "papers"}`
                : ex.document_type === "health_certificate"
                  ? "Health Certificate"
                  : ex.horse_name ?? null,
          file_path: prefill.uploadedDoc.file_path,
          file_name: prefill.uploadedDoc.file_name,
          file_size_bytes: prefill.uploadedDoc.file_size_bytes,
          mime_type: prefill.uploadedDoc.mime_type,
          extracted_data: ex,
          scan_confidence: ex.overall_confidence,
          document_date: ex.document_date ?? ex.test_date,
          expiration_date: ex.expiration_date,
        });
        if (docRes?.error) {
          setError(
            `Horse created; could not attach scanned document: ${docRes.error}`,
          );
        }
      } catch (e) {
        setError(
          `Horse created; could not attach scanned document: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }

    setPending(false);
    router.push(`/horses/${horseId}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <StallPurchaseFlow
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        userBarns={userBarns}
        defaultBarnId={activeBarnId ?? undefined}
        defaultMode="expand"
        launchedFromCapacity
        onSuccess={() => {
          // Barn capacity increased — refresh so another submit will
          // succeed. User still needs to click "Create horse" again.
          router.refresh();
        }}
      />

      <Link
        href="/horses"
        className="text-sm text-barn-dark/70 hover:text-brass-gold"
      >
        ← Horses
      </Link>
      <div className="mt-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-barn-dark">
            Add horse
          </h1>
          <p className="mt-2 text-barn-dark/65">
            Creates a profile in your current barn.
          </p>
        </div>
        {hasDocumentScanner && activeBarnId && (
          <ScanEntryButton
            barnId={activeBarnId}
            mode="new_horse"
            label="Import from papers"
            variant="secondary"
            onComplete={(r) => {
              if (r.kind === "prefill" && r.prefill) {
                applyExtraction(r.prefill);
                setPrefill({
                  extraction: r.prefill,
                  uploadedDoc: r.uploadedDoc,
                });
              }
            }}
          />
        )}
      </div>

      {prefillBanner && (
        <div
          className="mt-4 rounded-lg px-3 py-2 text-sm"
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            color: "#166534",
          }}
        >
          ✨ {prefillBanner}
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-10 space-y-4">
        <div>
          <label
            htmlFor="name"
            className="mb-1.5 block text-sm font-medium text-barn-dark/80"
          >
            Name <span className="text-barn-red">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="barn_name"
            className="mb-1.5 block text-sm font-medium text-barn-dark/80"
          >
            Barn name (nickname)
          </label>
          <input
            id="barn_name"
            name="barn_name"
            value={barnName}
            onChange={(e) => setBarnName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="breed"
            className="mb-1.5 block text-sm font-medium text-barn-dark/80"
          >
            Breed
          </label>
          <BreedSelect
            id="breed"
            value={breed}
            onChange={setBreed}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="sex"
            className="mb-1.5 block text-sm font-medium text-barn-dark/80"
          >
            Sex
          </label>
          <select
            id="sex"
            name="sex"
            className={inputClass}
            value={sex}
            onChange={(e) => setSex(e.target.value)}
          >
            <option value="">Select…</option>
            {HORSE_SEX_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="color"
            className="mb-1.5 block text-sm font-medium text-barn-dark/80"
          >
            Color
          </label>
          <input
            id="color"
            name="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="foal_date"
            className="mb-1.5 block text-sm font-medium text-barn-dark/80"
          >
            Foal date
          </label>
          <input
            id="foal_date"
            name="foal_date"
            type="date"
            value={foalDate}
            onChange={(e) => setFoalDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="sire"
            className="mb-1.5 block text-sm font-medium text-barn-dark/80"
          >
            Sire
          </label>
          <input
            id="sire"
            name="sire"
            value={sire}
            onChange={(e) => setSire(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="dam"
            className="mb-1.5 block text-sm font-medium text-barn-dark/80"
          >
            Dam
          </label>
          <input
            id="dam"
            name="dam"
            value={dam}
            onChange={(e) => setDam(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="registration_number"
            className="mb-1.5 block text-sm font-medium text-barn-dark/80"
          >
            Registration number
          </label>
          <input
            id="registration_number"
            name="registration_number"
            value={regNumber}
            onChange={(e) => setRegNumber(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="microchip_number"
            className="mb-1.5 block text-sm font-medium text-barn-dark/80"
          >
            Microchip number
          </label>
          <input
            id="microchip_number"
            name="microchip_number"
            value={microchip}
            onChange={(e) => setMicrochip(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-barn-dark/80">
            Photo
          </label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="text-sm text-barn-dark"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="mt-1 text-xs text-barn-dark/50">
            Stored at horse-photos/{`{horse_id}`}/profile.jpg after save.
          </p>
        </div>

        {error ? (
          <ErrorDetails
            title="Couldn't save"
            message={error}
            extra={{ Form: "new-horse", "Barn ID": activeBarnId ?? undefined }}
          />
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-brass-gold px-4 py-3 font-medium text-barn-dark shadow hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Create horse"}
        </button>
      </form>
    </div>
  );
}

// Try to map arbitrary breed strings to the allowed preset values
// (case-insensitive). Anything that doesn't match a preset is passed
// through as-is — BreedSelect will detect it and pivot to custom mode.
function matchBreed(value: string): string {
  const v = value.trim().toLowerCase();
  const match = HORSE_BREEDS.find((b) => b.toLowerCase() === v);
  return match ?? value.trim();
}

function matchSex(value: string): string {
  const v = value.trim().toLowerCase();
  const match = HORSE_SEX_OPTIONS.find((s) => s.toLowerCase() === v);
  return match ?? value.trim();
}
