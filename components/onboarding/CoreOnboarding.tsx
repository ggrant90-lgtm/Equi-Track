"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { BreedSelect } from "@/components/horse/BreedSelect";
import {
  createHorseAction,
  updateHorsePhotoUrlAction,
} from "@/app/(protected)/actions/horse";
import { createLogAction } from "@/app/(protected)/actions/create-log";
import { renameBarnAction } from "@/lib/onboarding";
import { uploadHorseProfilePhoto } from "@/lib/horse-photo";
import { ErrorDetails } from "@/components/ui/ErrorDetails";
import { WizardShell } from "./WizardShell";
import { WizardHorsePreview } from "./WizardHorsePreview";

/**
 * BarnBook Core onboarding wizard — 5 steps from "I just signed up" to
 * "I have a named barn, a first horse, a first record, and I've seen
 * how to share access." Every step writes real data; every step after
 * step 1 can be skipped.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  /** May be async — the wizard awaits completion before closing so the
   *  DB write lands before the parent's onClose runs. */
  onComplete: () => void | Promise<void>;
  /** The user's existing barn (auto-created at signup) or null if none. */
  initialBarn: { id: string; name: string } | null;
  /** 1-indexed step to resume on (defaults to 1). */
  initialStep?: number;
  onStepChange?: (step: number) => void;
}

const STEP_COUNT = 5;

const RECORD_PRESETS = [
  { key: "vet_visit", label: "Last vet visit", logType: "vet_visit" as const },
  { key: "shoeing", label: "Last shoeing", logType: "shoeing" as const },
  { key: "worming", label: "Last worming", logType: "worming" as const },
  { key: "vaccination", label: "Vaccination", logType: "medication" as const },
  { key: "exercise", label: "Exercise / ride", logType: "exercise" as const },
  { key: "note", label: "Other note", logType: "note" as const },
];

type RecordPreset = (typeof RECORD_PRESETS)[number];

export function CoreOnboarding(props: Props) {
  if (!props.open) return null;
  return <CoreOnboardingInner {...props} />;
}

function CoreOnboardingInner({
  onClose,
  onComplete,
  initialBarn,
  initialStep = 1,
  onStepChange,
}: Props) {
  const [step, setStep] = useState<number>(
    Math.max(1, Math.min(STEP_COUNT, initialStep)),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Accumulated wizard state — persists across step changes.
  const [barnId, setBarnId] = useState<string | null>(initialBarn?.id ?? null);
  const [barnName, setBarnName] = useState<string>(
    initialBarn?.name?.trim() || "My barn",
  );

  const [horseId, setHorseId] = useState<string | null>(null);
  const [horseName, setHorseName] = useState("");
  const [horseBreed, setHorseBreed] = useState("");
  const [horseFoalDate, setHorseFoalDate] = useState("");
  const [horsePhotoFile, setHorsePhotoFile] = useState<File | null>(null);
  const [horsePhotoPreview, setHorsePhotoPreview] = useState<string | null>(null);

  const [selectedPreset, setSelectedPreset] = useState<RecordPreset | null>(
    null,
  );
  const [recordDate, setRecordDate] = useState<string>(todayIso());
  const [recordNote, setRecordNote] = useState("");
  const [recordLabel, setRecordLabel] = useState<string | null>(null);

  // Notify parent of step changes so it can persist resumption state.
  // It's fine if the callback identity changes between renders — we
  // only call it after a step transition, not on every render.
  useEffect(() => {
    onStepChange?.(step);
    // We intentionally exclude `onStepChange` from deps so a parent
    // re-render with a new callback doesn't re-fire on the same step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Clean up object URLs when photo changes / component unmounts.
  useEffect(() => {
    if (!horsePhotoFile) return;
    const url = URL.createObjectURL(horsePhotoFile);
    setHorsePhotoPreview(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [horsePhotoFile]);

  function advance() {
    setError(null);
    setStep((s) => Math.min(STEP_COUNT, s + 1));
  }
  function goBack() {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  }

  // ── Step handlers ─────────────────────────────────────────────────

  function handleStep1() {
    const name = barnName.trim() || "My barn";
    setError(null);
    startTransition(async () => {
      if (barnId) {
        const res = await renameBarnAction(barnId, name);
        if (res.error) {
          setError(res.error);
          return;
        }
      } else {
        const fd = new FormData();
        fd.set("name", name);
        fd.set("barn_type", "standard");
        fd.set("plan_tier_selected", "free");
        // createBarnAction redirects on success; we need the new ID,
        // which it doesn't expose. Fall back: call it, then look up
        // the newly created barn. Simpler: we skip this whole
        // branch for now — signup auto-creates a barn, so initialBarn
        // is basically always present. If it ever isn't, we just
        // close the wizard and let the user run /barn/new.
        setError(
          "No barn found. Please create one from the dashboard first.",
        );
        return;
      }
      setBarnName(name);
      advance();
    });
  }

  function handleStep2() {
    const name = horseName.trim();
    if (!name) {
      setError("Give your horse a name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("name", name);
      if (horseBreed) fd.set("breed", horseBreed);
      if (horseFoalDate) fd.set("foal_date", horseFoalDate);

      const res = await createHorseAction(null, fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      const newHorseId = res?.horseId;
      if (!newHorseId) {
        setError("Could not create horse.");
        return;
      }
      setHorseId(newHorseId);

      // Photo upload (client-side), then persist URL.
      if (horsePhotoFile) {
        const up = await uploadHorseProfilePhoto(newHorseId, horsePhotoFile);
        if (!("error" in up)) {
          await updateHorsePhotoUrlAction(newHorseId, up.publicUrl);
        }
      }

      advance();
    });
  }

  function handleStep3() {
    if (!selectedPreset) {
      setError("Pick a record type, or tap Skip.");
      return;
    }
    if (!horseId) {
      setError("No horse to attach this record to — skip ahead.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      // Health types use record_date; activity types use logged_at.
      const isHealth =
        selectedPreset.logType === "vet_visit" ||
        selectedPreset.logType === "shoeing" ||
        selectedPreset.logType === "worming";
      if (isHealth) fd.set("record_date", recordDate);
      else fd.set("logged_at", recordDate);

      if (recordNote.trim()) fd.set("notes", recordNote.trim());

      if (selectedPreset.logType === "exercise") {
        fd.set("subtype", "walk");
      } else if (selectedPreset.key === "vaccination") {
        // We stuff vaccination through medication; label it so history reads cleanly.
        fd.set("medication_name", "Vaccination");
      }

      const res = await createLogAction(
        horseId,
        selectedPreset.logType,
        fd,
      );
      if (res.error) {
        setError(res.error);
        return;
      }
      setRecordLabel(selectedPreset.label);
      advance();
    });
  }

  function handleStep5Done() {
    // Await completion so the DB write lands before the modal closes.
    // The parent's onComplete handler is expected to close the modal
    // itself (setCoreOpen(false)); we don't call onClose here because
    // onClose is reserved for the "closed WITHOUT completing" path
    // (X button, skip from an earlier step) and writes dismissed_at.
    setError(null);
    startTransition(async () => {
      await onComplete();
    });
  }

  // ── Render ─────────────────────────────────────────────────────────

  let title = "Welcome to BarnBook";
  let onPrimary: (() => void) | undefined;
  let primaryLabel = "Continue";
  let onSkip: (() => void) | undefined;
  let onBack: (() => void) | undefined;
  let primaryDisabled = false;

  if (step === 1) {
    title = "Welcome to BarnBook";
    onPrimary = handleStep1;
    primaryLabel = "Let's go";
    primaryDisabled = !barnName.trim();
  } else if (step === 2) {
    title = "Add your first horse";
    onPrimary = handleStep2;
    primaryLabel = horseName.trim() ? `Add ${horseName.trim()}` : "Add this horse";
    // Skipping at step 2 means "I'm not going to add a horse right now."
    // Route through onClose (dismiss) rather than onComplete; it's
    // closer to giving up than finishing.
    onSkip = onClose;
    onBack = goBack;
    primaryDisabled = !horseName.trim();
  } else if (step === 3) {
    title = `Log something for ${horseName.trim() || "your horse"}`;
    onPrimary = handleStep3;
    primaryLabel = "Save record";
    onSkip = advance;
    onBack = goBack;
    primaryDisabled = !selectedPreset;
  } else if (step === 4) {
    title = "Share access (optional)";
    // Step 4 CTAs live inline, no primary in the footer.
    onPrimary = undefined;
    onSkip = advance;
    onBack = goBack;
  } else {
    title = "Your barn is ready";
    onPrimary = handleStep5Done;
    primaryLabel = "Go to my dashboard";
    onBack = undefined;
  }

  return (
    <WizardShell
      open={true}
      onClose={onClose}
      title={title}
      stepCount={STEP_COUNT}
      currentStep={step}
      onBack={onBack}
      onSkip={onSkip}
      onPrimary={onPrimary}
      primaryLabel={primaryLabel}
      primaryDisabled={primaryDisabled}
      primaryPending={pending}
    >
      {step === 1 && (
        <Step1
          name={barnName}
          onChange={setBarnName}
          alreadyHasBarn={!!barnId}
        />
      )}
      {step === 2 && (
        <Step2
          horseName={horseName}
          setHorseName={setHorseName}
          horseBreed={horseBreed}
          setHorseBreed={setHorseBreed}
          horseFoalDate={horseFoalDate}
          setHorseFoalDate={setHorseFoalDate}
          horsePhotoPreview={horsePhotoPreview}
          setHorsePhotoFile={setHorsePhotoFile}
          recordLabel={recordLabel}
        />
      )}
      {step === 3 && (
        <Step3
          horseName={horseName}
          horseBreed={horseBreed}
          horseFoalDate={horseFoalDate}
          horsePhotoPreview={horsePhotoPreview}
          selectedPreset={selectedPreset}
          setSelectedPreset={setSelectedPreset}
          recordDate={recordDate}
          setRecordDate={setRecordDate}
          recordNote={recordNote}
          setRecordNote={setRecordNote}
          recordLabel={recordLabel}
        />
      )}
      {step === 4 && (
        <Step4
          horseName={horseName}
          horseId={horseId}
          onContinue={advance}
        />
      )}
      {step === 5 && (
        <Step5
          horseName={horseName}
          horseBreed={horseBreed}
          horseFoalDate={horseFoalDate}
          horsePhotoPreview={horsePhotoPreview}
          recordLabel={recordLabel}
          onAddAnother={() => {
            // User finished the wizard and wants to go add another horse.
            // Completion path — onComplete closes the modal itself; no
            // onClose needed (calling it here would also set dismissed_at,
            // which is redundant alongside completed=true).
            onComplete();
          }}
        />
      )}

      {error && (
        <div className="mt-4">
          <ErrorDetails
            title="Something went wrong"
            message={error}
            extra={{ Step: String(step) }}
          />
        </div>
      )}
    </WizardShell>
  );
}

// ──────────────────────────────────────────────────────────────
// Step components
// ──────────────────────────────────────────────────────────────

function Step1({
  name,
  onChange,
  alreadyHasBarn,
}: {
  name: string;
  onChange: (v: string) => void;
  alreadyHasBarn: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "rgba(42,64,49,0.8)", lineHeight: 1.6 }}>
        {alreadyHasBarn
          ? "Let's name your barn. You can change this later."
          : "Let's set up your barn and add your first horse. Takes about two minutes."}
      </p>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium" style={{ color: "rgba(42,64,49,0.8)" }}>
          Barn name
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => onChange(e.target.value)}
          maxLength={80}
          autoFocus
          className="w-full rounded-xl border px-4 py-3 outline-none focus:ring-2"
          style={{
            borderColor: "rgba(42,64,49,0.15)",
            color: "#2a4031",
            background: "white",
          }}
          placeholder="My barn"
        />
      </label>
    </div>
  );
}

function Step2({
  horseName,
  setHorseName,
  horseBreed,
  setHorseBreed,
  horseFoalDate,
  setHorseFoalDate,
  horsePhotoPreview,
  setHorsePhotoFile,
  recordLabel,
}: {
  horseName: string;
  setHorseName: (v: string) => void;
  horseBreed: string;
  setHorseBreed: (v: string) => void;
  horseFoalDate: string;
  setHorseFoalDate: (v: string) => void;
  horsePhotoPreview: string | null;
  setHorsePhotoFile: (f: File | null) => void;
  recordLabel: string | null;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium" style={{ color: "rgba(42,64,49,0.8)" }}>
            Name
          </span>
          <input
            type="text"
            value={horseName}
            onChange={(e) => setHorseName(e.target.value)}
            maxLength={80}
            autoFocus
            placeholder="e.g. Shadow"
            className="w-full rounded-xl border px-4 py-3 outline-none"
            style={{
              borderColor: "rgba(42,64,49,0.15)",
              color: "#2a4031",
              background: "white",
            }}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium" style={{ color: "rgba(42,64,49,0.8)" }}>
            Photo (optional)
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setHorsePhotoFile(e.target.files?.[0] ?? null)}
            className="text-sm"
            style={{ color: "rgba(42,64,49,0.8)" }}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium" style={{ color: "rgba(42,64,49,0.8)" }}>
              Breed (optional)
            </span>
            <BreedSelect
              value={horseBreed}
              onChange={setHorseBreed}
              className="w-full rounded-xl border px-3 py-3 outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium" style={{ color: "rgba(42,64,49,0.8)" }}>
              Foal date (optional)
            </span>
            <input
              type="date"
              value={horseFoalDate}
              onChange={(e) => setHorseFoalDate(e.target.value)}
              className="w-full rounded-xl border px-3 py-3 outline-none"
              style={{
                borderColor: "rgba(42,64,49,0.15)",
                color: "#2a4031",
                background: "white",
              }}
            />
          </label>
        </div>
      </div>
      <div>
        <div className="text-xs mb-1.5" style={{ color: "rgba(42,64,49,0.6)" }}>
          Preview
        </div>
        <WizardHorsePreview
          name={horseName}
          breed={horseBreed || null}
          foalDate={horseFoalDate || null}
          photoUrl={horsePhotoPreview}
          recordLabel={recordLabel}
        />
      </div>
    </div>
  );
}

function Step3({
  horseName,
  horseBreed,
  horseFoalDate,
  horsePhotoPreview,
  selectedPreset,
  setSelectedPreset,
  recordDate,
  setRecordDate,
  recordNote,
  setRecordNote,
  recordLabel,
}: {
  horseName: string;
  horseBreed: string;
  horseFoalDate: string;
  horsePhotoPreview: string | null;
  selectedPreset: RecordPreset | null;
  setSelectedPreset: (p: RecordPreset | null) => void;
  recordDate: string;
  setRecordDate: (v: string) => void;
  recordNote: string;
  setRecordNote: (v: string) => void;
  recordLabel: string | null;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
      <div className="space-y-3">
        <p className="text-sm" style={{ color: "rgba(42,64,49,0.8)", lineHeight: 1.6 }}>
          What&apos;s one thing you&apos;d like to log for {horseName.trim() || "your horse"}?
        </p>
        <div className="grid grid-cols-2 gap-2">
          {RECORD_PRESETS.map((p) => {
            const active = selectedPreset?.key === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setSelectedPreset(p)}
                aria-pressed={active}
                className="rounded-xl border px-3 py-2 text-left text-sm font-medium transition"
                style={{
                  borderColor: active ? "#c9a84c" : "rgba(42,64,49,0.12)",
                  background: active ? "rgba(201,168,76,0.08)" : "white",
                  color: "#2a4031",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {selectedPreset && (
          <div
            className="rounded-xl border p-3 space-y-2"
            style={{
              borderColor: "rgba(42,64,49,0.1)",
              background: "rgba(245,239,228,0.5)",
            }}
          >
            <label className="block">
              <span className="mb-1 block text-xs font-medium" style={{ color: "rgba(42,64,49,0.7)" }}>
                When
              </span>
              <input
                type="date"
                value={recordDate}
                onChange={(e) => setRecordDate(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{
                  borderColor: "rgba(42,64,49,0.15)",
                  color: "#2a4031",
                  background: "white",
                }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium" style={{ color: "rgba(42,64,49,0.7)" }}>
                Notes (optional)
              </span>
              <textarea
                value={recordNote}
                onChange={(e) => setRecordNote(e.target.value)}
                rows={2}
                placeholder="Anything worth remembering later?"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{
                  borderColor: "rgba(42,64,49,0.15)",
                  color: "#2a4031",
                  background: "white",
                }}
              />
            </label>
          </div>
        )}
      </div>
      <div>
        <div className="text-xs mb-1.5" style={{ color: "rgba(42,64,49,0.6)" }}>
          Preview
        </div>
        <WizardHorsePreview
          name={horseName}
          breed={horseBreed || null}
          foalDate={horseFoalDate || null}
          photoUrl={horsePhotoPreview}
          recordLabel={recordLabel ?? selectedPreset?.label ?? null}
        />
      </div>
    </div>
  );
}

function Step4({
  horseName,
  horseId,
  onContinue,
}: {
  horseName: string;
  horseId: string | null;
  onContinue: () => void;
}) {
  const href = horseId
    ? `/keys/generate?horse=${encodeURIComponent(horseId)}&mode=stall`
    : "/keys/generate";
  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "rgba(42,64,49,0.8)", lineHeight: 1.6 }}>
        Want to share access to {horseName.trim() || "this horse"}? Stall
        Keys let your vet, farrier, or barn manager see just this horse&apos;s
        records — nothing else.
      </p>
      <div className="flex flex-col gap-2">
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onContinue}
          className="min-h-[44px] inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium shadow"
          style={{ background: "#c9a84c", color: "#2a4031" }}
        >
          Generate a Stall Key link
        </Link>
        <button
          type="button"
          onClick={onContinue}
          className="min-h-[44px] rounded-xl border px-4 py-2 text-sm font-medium"
          style={{
            borderColor: "rgba(42,64,49,0.15)",
            color: "#2a4031",
            background: "white",
          }}
        >
          Not right now
        </button>
      </div>
    </div>
  );
}

function Step5({
  horseName,
  horseBreed,
  horseFoalDate,
  horsePhotoPreview,
  recordLabel,
  onAddAnother,
}: {
  horseName: string;
  horseBreed: string;
  horseFoalDate: string;
  horsePhotoPreview: string | null;
  recordLabel: string | null;
  onAddAnother: () => void;
}) {
  const router = useRouter();
  return (
    <div className="space-y-4 text-center">
      <div
        className="mx-auto inline-flex items-center justify-center rounded-full"
        style={{
          width: 64,
          height: 64,
          background: "rgba(163,184,143,0.3)",
          animation: "corepop 300ms cubic-bezier(.34,1.56,.64,1)",
        }}
      >
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2a4031" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h3 className="font-serif text-xl font-semibold" style={{ color: "#2a4031" }}>
        Your barn is ready!
      </h3>
      <div className="mx-auto max-w-[260px]">
        <WizardHorsePreview
          name={horseName}
          breed={horseBreed || null}
          foalDate={horseFoalDate || null}
          photoUrl={horsePhotoPreview}
          recordLabel={recordLabel}
        />
      </div>
      <p className="text-sm" style={{ color: "rgba(42,64,49,0.7)" }}>
        1 horse · {recordLabel ? "1 record" : "0 records"} — off to a great
        start.
      </p>
      <button
        type="button"
        onClick={() => {
          onAddAnother();
          router.push("/horses/new");
        }}
        className="text-sm underline"
        style={{ color: "rgba(42,64,49,0.6)" }}
      >
        Or add another horse
      </button>
      <style jsx>{`
        @keyframes corepop {
          0%   { transform: scale(0.6); opacity: 0; }
          100% { transform: scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
