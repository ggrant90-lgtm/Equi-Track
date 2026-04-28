"use client";

import Link from "next/link";
import type { Flush, Pregnancy } from "@/lib/types";
import { PREGNANCY_STATUS_LABELS } from "@/lib/horse-form-constants";

export function DonorBreedingSection({
  horse,
  flushes,
  pregnancies,
  horseNames,
}: {
  horse: { id: string; lifetime_embryo_count?: number; lifetime_live_foal_count?: number };
  flushes: Flush[];
  pregnancies: Pregnancy[];
  horseNames: Record<string, string>;
}) {
  const totalEmbryos = flushes.reduce((sum, f) => sum + (f.embryo_count ?? 0), 0);
  const foaledCount = pregnancies.filter((p) => p.status === "foaled").length;

  const activePregnancies = pregnancies.filter(
    (p) => p.status === "pending_check" || p.status === "confirmed"
  );

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold text-barn-dark/60 uppercase tracking-wide">Donor Record</h3>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl border border-barn-dark/10 bg-parchment/30 p-3 text-center">
          <p className="text-2xl font-semibold text-barn-dark">{flushes.length}</p>
          <p className="text-xs text-barn-dark/50">Flushes</p>
        </div>
        <div className="rounded-xl border border-barn-dark/10 bg-parchment/30 p-3 text-center">
          <p className="text-2xl font-semibold text-barn-dark">{totalEmbryos}</p>
          <p className="text-xs text-barn-dark/50">Embryos</p>
        </div>
        <div className="rounded-xl border border-barn-dark/10 bg-parchment/30 p-3 text-center">
          <p className="text-2xl font-semibold text-barn-dark">{activePregnancies.length}</p>
          <p className="text-xs text-barn-dark/50">Active</p>
        </div>
        <div className="rounded-xl border border-barn-dark/10 bg-parchment/30 p-3 text-center">
          <p className="text-2xl font-semibold text-barn-dark">{foaledCount}</p>
          <p className="text-xs text-barn-dark/50">Foals</p>
        </div>
      </div>

      {/* Active pregnancies */}
      {activePregnancies.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-barn-dark/60 uppercase tracking-wide">Active Pregnancies</h3>
          <div className="mt-2 space-y-2">
            {activePregnancies.map((p) => {
              const surrogateName = p.surrogate_horse_id ? (horseNames[p.surrogate_horse_id] ?? "Unknown") : "Unknown";
              const stallionName = p.stallion_horse_id ? (horseNames[p.stallion_horse_id] ?? "Unknown") : "Unknown";
              const daysToFoal = p.expected_foaling_date
                ? Math.floor((new Date(p.expected_foaling_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : null;

              return (
                <Link
                  key={p.id}
                  href={`/breeders-pro/pregnancy/${p.id}`}
                  className="block rounded-xl border border-brass-gold/30 bg-brass-gold/5 p-3 transition hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-barn-dark">Surrogate: {surrogateName}</p>
                      <p className="text-xs text-barn-dark/50">Sire: {stallionName}</p>
                    </div>
                    {daysToFoal != null && (
                      <div className="text-right">
                        <p className="text-lg font-semibold text-barn-dark">{daysToFoal > 0 ? daysToFoal : 0}</p>
                        <p className="text-xs text-barn-dark/50">days to foal</p>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Flush history */}
      {flushes.length > 0 ? (
        <div>
          <h3 className="text-xs font-semibold text-barn-dark/60 uppercase tracking-wide">Flush History</h3>
          <div className="mt-2 space-y-2">
            {flushes.slice(0, 5).map((flush) => (
              <div
                key={flush.id}
                className="flex items-center justify-between rounded-lg border border-barn-dark/5 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm text-barn-dark">
                    {new Date(flush.flush_date).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-barn-dark/50">
                    {flush.embryo_count} embryo{flush.embryo_count !== 1 ? "s" : ""}
                    {flush.breeding_method && ` \u00B7 ${flush.breeding_method.replace(/_/g, " ").toUpperCase()}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-barn-dark/50">No flushes recorded yet.</p>
      )}

      {/* Pregnancy history (foaled + lost) */}
      {pregnancies.filter((p) => p.status !== "pending_check" && p.status !== "confirmed").length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-barn-dark/60 uppercase tracking-wide">Pregnancy History</h3>
          <div className="mt-2 space-y-2">
            {pregnancies
              .filter((p) => p.status !== "pending_check" && p.status !== "confirmed")
              .map((p) => {
                const surrogateName = p.surrogate_horse_id ? (horseNames[p.surrogate_horse_id] ?? "Unknown") : "Unknown";
                return (
                  <Link
                    key={p.id}
                    href={`/breeders-pro/pregnancy/${p.id}`}
                    className="flex items-center justify-between rounded-lg border border-barn-dark/5 px-3 py-2.5 hover:border-brass-gold/30 transition"
                  >
                    <div>
                      <p className="text-sm text-barn-dark">
                        {new Date(p.transfer_date).toLocaleDateString()} — Surrogate: {surrogateName}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.status === "foaled" ? "bg-brass-gold/20 text-barn-dark" : "bg-red-100 text-red-800"
                    }`}>
                      {PREGNANCY_STATUS_LABELS[p.status]}
                    </span>
                  </Link>
                );
              })}
          </div>
        </div>
      )}

      <Link
        href="/breeders-pro/embryos"
        className="inline-flex items-center gap-1 text-sm text-brass-gold hover:underline"
      >
        View Embryo Bank
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
        </svg>
      </Link>
    </div>
  );
}
