"use client";

import { AddLogModal, type AddLogHorse } from "@/components/AddLogModal";
import { HorseCard } from "@/components/HorseCard";
import { linkButtonClass } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { Horse } from "@/lib/types";
import Link from "next/link";
import { useMemo, useState } from "react";

export function HorsesGrid({
  horses,
  canAdd,
  visitingInfo,
  awayInfo,
}: {
  horses: Horse[];
  canAdd: boolean;
  visitingInfo?: Record<string, string>;
  awayInfo?: Record<string, string>;
}) {
  const [q, setQ] = useState("");
  const [breedFilter, setBreedFilter] = useState("");
  const [sexFilter, setSexFilter] = useState("");
  const [addLogOpen, setAddLogOpen] = useState(false);

  // The page-level query has already RLS-filtered to horses the user can
  // see. Permissions on log creation are re-checked server-side by
  // createLogAction, so this list is best-effort: a view_only stall-key
  // user might see a horse here and get rejected at submit.
  const loggableHorses: AddLogHorse[] = useMemo(
    () =>
      horses.map((h) => ({
        id: h.id,
        name: h.name,
        photo_url: h.photo_url ?? null,
        barn_name: h.barn_name ?? null,
        allowed_log_types: null,
      })),
    [horses],
  );

  const breeds = useMemo(() => {
    const s = new Set<string>();
    for (const h of horses) {
      if (h.breed?.trim()) s.add(h.breed.trim());
    }
    return [...s].sort();
  }, [horses]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return horses.filter((h) => {
      if (ql) {
        const hay = `${h.name} ${h.barn_name ?? ""}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      if (breedFilter && (h.breed ?? "") !== breedFilter) return false;
      if (sexFilter && (h.sex ?? "") !== sexFilter) return false;
      return true;
    });
  }, [horses, q, breedFilter, sexFilter]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <AddLogModal
        open={addLogOpen}
        onClose={() => setAddLogOpen(false)}
        horses={loggableHorses}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-semibold text-barn-dark">Horses</h1>
          <p className="mt-1 text-barn-dark/65">All horses in your current barn.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {horses.length > 0 ? (
            <button
              type="button"
              onClick={() => setAddLogOpen(true)}
              className={linkButtonClass("secondary")}
            >
              Add Log
            </button>
          ) : null}
          {canAdd ? (
            <Link href="/horses/new" className={linkButtonClass("primary")}>
              Add Horse
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-barn-dark/10 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
        <Input
          type="search"
          placeholder="Search by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="sm:max-w-xs"
          aria-label="Search horses"
        />
        <Select
          value={breedFilter}
          onChange={(e) => setBreedFilter(e.target.value)}
          className="sm:max-w-[12rem]"
          aria-label="Filter by breed"
        >
          <option value="">All breeds</option>
          {breeds.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </Select>
        <Select
          value={sexFilter}
          onChange={(e) => setSexFilter(e.target.value)}
          className="sm:max-w-[12rem]"
          aria-label="Filter by sex"
        >
          <option value="">All sexes</option>
          <option value="Mare">Mare</option>
          <option value="Stallion">Stallion</option>
          <option value="Gelding">Gelding</option>
          <option value="Unknown">Unknown</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-10 text-center text-barn-dark/65">
          {horses.length === 0 ? "No horses yet." : "No horses match your filters."}
        </p>
      ) : (
        <ul className="mt-8 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((h) => (
            <li key={h.id}>
              <HorseCard
                horse={h}
                href={`/horses/${h.id}`}
                badge={
                  visitingInfo?.[h.id]
                    ? `Visiting from ${visitingInfo[h.id]}`
                    : awayInfo?.[h.id]
                      ? `At ${awayInfo[h.id]}`
                      : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
