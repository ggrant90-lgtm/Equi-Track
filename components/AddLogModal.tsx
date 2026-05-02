"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { HorsePhoto } from "@/components/HorsePhoto";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const ALL_LOG_TYPES = [
  { value: "exercise", label: "Exercise" },
  { value: "pony", label: "Pony" },
  { value: "feed", label: "Feed" },
  { value: "medication", label: "Medication" },
  { value: "note", label: "Note" },
  { value: "shoeing", label: "Shoeing" },
  { value: "worming", label: "Worming" },
  { value: "vet_visit", label: "Vet Visit" },
  { value: "dentistry", label: "Dentistry" },
  { value: "breed_data", label: "Breed Data" },
] as const;

export type AddLogHorse = {
  id: string;
  name: string;
  photo_url: string | null;
  barn_name: string | null;
  /** null → all log types allowed; array → restricted to these (stall-key custom permission). */
  allowed_log_types: string[] | null;
};

export function AddLogModal({
  open,
  onClose,
  horses,
}: {
  open: boolean;
  onClose: () => void;
  horses: AddLogHorse[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<AddLogHorse | null>(null);
  const [search, setSearch] = useState("");

  const filteredHorses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return horses;
    return horses.filter((h) => {
      if (h.name.toLowerCase().includes(q)) return true;
      if (h.barn_name && h.barn_name.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [horses, search]);

  const availableTypes = useMemo(() => {
    if (!selected) return [];
    if (!selected.allowed_log_types) return [...ALL_LOG_TYPES];
    const allowed = new Set(selected.allowed_log_types);
    return ALL_LOG_TYPES.filter((t) => allowed.has(t.value));
  }, [selected]);

  // All close paths (X, backdrop, Escape, Cancel button, after navigate)
  // funnel through here so internal state resets and the next open
  // starts fresh on step 1.
  function handleClose() {
    setSelected(null);
    setSearch("");
    onClose();
  }

  function pickType(type: string) {
    if (!selected) return;
    const horseId = selected.id;
    handleClose();
    router.push(`/horses/${horseId}/log/${type}`);
  }

  if (!selected) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title="Add log entry"
        description={
          horses.length === 0
            ? "You don't have any horses you can log on yet."
            : "Pick a horse to log for."
        }
        className="max-w-lg"
        footer={
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
        }
      >
        {horses.length === 0 ? (
          <p className="text-sm text-barn-dark/65">
            Add a horse first, or ask a barn owner for a key.
          </p>
        ) : (
          <>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search horses…"
              className="w-full rounded-xl border border-barn-dark/15 bg-white px-3 py-2 text-sm text-barn-dark placeholder:text-barn-dark/40 focus:border-brass-gold focus:outline-none focus:ring-2 focus:ring-brass-gold/30"
              autoFocus
            />
            <ul className="mt-3 max-h-80 overflow-y-auto divide-y divide-barn-dark/10 rounded-xl border border-barn-dark/10">
              {filteredHorses.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-barn-dark/55">
                  No horses match &ldquo;{search}&rdquo;.
                </li>
              ) : (
                filteredHorses.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(h)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-parchment/60"
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                        <HorsePhoto
                          name={h.name}
                          photoUrl={h.photo_url}
                          aspectClassName="aspect-square w-full"
                          className="rounded-lg"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-barn-dark">
                          {h.name}
                        </div>
                        {h.barn_name ? (
                          <div className="truncate text-xs text-barn-dark/55">
                            {h.barn_name}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add log entry"
      description={`Pick a log type for ${selected.name}.`}
      className="max-w-lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => setSelected(null)}>
            Back
          </Button>
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
        </>
      }
    >
      {availableTypes.length === 0 ? (
        <p className="text-sm text-barn-dark/65">
          Your access on {selected.name} doesn&apos;t allow creating log
          entries. Ask the barn owner to update your key permissions.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {availableTypes.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => pickType(t.value)}
              className="rounded-xl border border-barn-dark/10 bg-white px-3 py-3 text-sm font-medium text-barn-dark transition hover:border-brass-gold hover:bg-parchment/40"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
