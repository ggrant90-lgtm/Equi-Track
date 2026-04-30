"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Embryo, Flush, Horse, Pregnancy } from "@/lib/types";
import type { EmbryoLocation } from "@/lib/embryo-location";
import { getHorseDisplayName, getHorseSecondaryName } from "@/lib/horse-name";
import { BreedersProChrome } from "@/components/breeders-pro/BreedersProChrome";

/* --------------------------------------------------------------------
 * Donor Mare Profile — presentation layer.
 *
 * No data fetching, no mutations. Receives everything via props from the
 * server page above. All derived values are computed client-side from
 * those props only.
 * ------------------------------------------------------------------ */

type EmbryoFilterKind =
  | "all"
  | "fresh"
  | "frozen"
  | "transferred"
  | "foaled"
  | "lost"
  | "shipped";

const STATUS_SHORT: Record<Embryo["status"], string> = {
  in_bank_fresh: "Fresh",
  in_bank_frozen: "Frozen",
  transferred: "Transferred",
  became_foal: "Foaled",
  shipped_out: "Shipped",
  lost: "Lost",
};

const STATUS_CLASS: Record<Embryo["status"], string> = {
  in_bank_fresh: "bp-status-fresh",
  in_bank_frozen: "bp-status-frozen",
  transferred: "bp-status-transferred",
  became_foal: "bp-status-foal",
  shipped_out: "bp-status-shipped",
  lost: "bp-status-lost",
};

const STAGE_SHORT: Record<Embryo["stage"], string> = {
  morula: "Morula",
  early_blastocyst: "Early Blast.",
  blastocyst: "Blastocyst",
  expanded_blastocyst: "Expanded Blast.",
  hatched_blastocyst: "Hatched Blast.",
};

const GRADE_NUM: Record<Embryo["grade"], number | null> = {
  grade_1: 1,
  grade_2: 2,
  grade_3: 3,
  grade_4: 4,
  degenerate: null,
};

const GRADE_CLASS: Record<Embryo["grade"], string> = {
  grade_1: "bp-grade-1",
  grade_2: "bp-grade-2",
  grade_3: "bp-grade-3",
  grade_4: "bp-grade-4",
  degenerate: "bp-grade-4",
};

const METHOD_SHORT: Record<Flush["breeding_method"], string> = {
  ai_fresh: "AI Fresh",
  ai_cooled: "AI Cooled",
  ai_frozen: "AI Frozen",
  live_cover: "Traditional Carry",
};

const REPRO_LABEL: Record<NonNullable<Horse["reproductive_status"]>, string> = {
  open: "Open",
  in_cycle: "In Cycle",
  bred: "Bred",
  confirmed_pregnant: "Confirmed Pregnant",
  foaling: "Foaling",
  post_foaling: "Post-Foaling",
  retired: "Retired",
};

function fmtMonthDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

function fmtIso(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

type OPUSession = {
  id: string;
  opu_date: string;
  veterinarian: string | null;
  facility: string | null;
  oocytes_recovered: number;
  oocytes_mature: number | null;
  oocytes_immature: number | null;
  cost: number | null;
  notes: string | null;
  created_at: string;
};

type OPUSummary = {
  totalOocytes: number;
  developed: number;
  failed: number;
  pending: number;
  batches: number;
  embryosCreated: number;
  stallionNames: string[];
};

export function DonorProfileClient({
  horse,
  flushes,
  pregnancies,
  embryos,
  embryoLocations,
  opuSessions = [],
  opuSummaries = {},
  horseNames,
  canEdit,
}: {
  horse: Horse;
  flushes: Flush[];
  pregnancies: Pregnancy[];
  embryos: Embryo[];
  embryoLocations: Record<string, EmbryoLocation>;
  opuSessions?: OPUSession[];
  opuSummaries?: Record<string, OPUSummary>;
  horseNames: Record<string, string>;
  canEdit: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Embryos section: which location-kind chip is currently selected
  const [embryoFilter, setEmbryoFilter] = useState<EmbryoFilterKind>("all");

  // ----- Derived metrics (memo'd so the page renders crisp) -----
  const metrics = useMemo(() => {
    const lifetimeEmbryos = embryos.length;
    const currentYear = new Date().getFullYear();
    const seasonEmbryos = embryos.filter((e) => {
      const y = new Date(e.created_at).getFullYear();
      return y === currentYear;
    }).length;
    const prevSeasonEmbryos = embryos.filter((e) => {
      const y = new Date(e.created_at).getFullYear();
      return y === currentYear - 1;
    }).length;
    const seasonDelta = seasonEmbryos - prevSeasonEmbryos;

    const avgPerFlush = flushes.length
      ? lifetimeEmbryos / flushes.length
      : null;

    const liveFoals = pregnancies.filter((p) => p.status === "foaled").length;
    const transferredCount = pregnancies.length;
    const conversionPct = transferredCount
      ? Math.round((liveFoals / transferredCount) * 100)
      : null;

    const grades = embryos
      .map((e) => GRADE_NUM[e.grade])
      .filter((n): n is number => n != null);
    const avgGrade = avg(grades);

    const totalFlushCost = flushes.reduce(
      (s, f) => s + (f.flush_cost ?? 0),
      0,
    );
    const costPerEmbryo =
      lifetimeEmbryos > 0 && totalFlushCost > 0
        ? totalFlushCost / lifetimeEmbryos
        : null;

    return {
      lifetimeEmbryos,
      seasonEmbryos,
      seasonDelta,
      avgPerFlush,
      liveFoals,
      conversionPct,
      avgGrade,
      costPerEmbryo,
    };
  }, [embryos, flushes, pregnancies]);

  // ----- Group embryos by flush_id -----
  const embryosByFlush = useMemo(() => {
    const m: Record<string, Embryo[]> = {};
    for (const e of embryos) {
      if (!m[e.flush_id]) m[e.flush_id] = [];
      m[e.flush_id].push(e);
    }
    return m;
  }, [embryos]);

  // ----- Group flushes by season (year) -----
  const seasons = useMemo(() => {
    const byYear = new Map<number, Flush[]>();
    for (const f of flushes) {
      const y = new Date(f.flush_date).getFullYear();
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y)!.push(f);
    }
    const years = [...byYear.keys()].sort((a, b) => b - a);
    return years.map((year) => {
      const ys = byYear.get(year)!;
      const yearEmbryos = ys.flatMap((f) => embryosByFlush[f.id] ?? []);
      const yearTransferred = yearEmbryos.filter(
        (e) => e.status === "transferred" || e.status === "became_foal",
      ).length;
      const yearFoaled = yearEmbryos.filter(
        (e) => e.status === "became_foal",
      ).length;
      return {
        year,
        flushes: ys,
        embryoCount: yearEmbryos.length,
        transferred: yearTransferred,
        foaled: yearFoaled,
      };
    });
  }, [flushes, embryosByFlush]);

  // ----- Embryos-per-season for mini chart (last 4 years) -----
  const chart = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const years = [thisYear - 3, thisYear - 2, thisYear - 1, thisYear];
    const counts = years.map(
      (y) =>
        embryos.filter((e) => new Date(e.created_at).getFullYear() === y).length,
    );
    const max = Math.max(1, ...counts);
    return { years, counts, max };
  }, [embryos]);

  // ----- Top crosses: group embryos by stallion, count foals via pregnancies -----
  const topCrosses = useMemo(() => {
    const byStallion: Record<
      string,
      { name: string; embryos: number; foals: number }
    > = {};
    for (const e of embryos) {
      const key =
        e.stallion_horse_id ??
        e.external_stallion_name ??
        "unknown";
      const name = e.stallion_horse_id
        ? horseNames[e.stallion_horse_id] ?? "Unknown"
        : e.external_stallion_name ?? "External";
      if (!byStallion[key]) {
        byStallion[key] = { name, embryos: 0, foals: 0 };
      }
      byStallion[key].embryos += 1;
    }
    for (const p of pregnancies) {
      if (p.status !== "foaled") continue;
      const key = p.stallion_horse_id ?? "unknown";
      if (!byStallion[key]) {
        byStallion[key] = {
          name: p.stallion_horse_id
            ? horseNames[p.stallion_horse_id] ?? "Unknown"
            : "External",
          embryos: 0,
          foals: 0,
        };
      }
      byStallion[key].foals += 1;
    }
    return Object.values(byStallion)
      .sort((a, b) => b.embryos - a.embryos)
      .slice(0, 4);
  }, [embryos, pregnancies, horseNames]);

  // ----- Header formatted bits -----
  const roleTag = useMemo(() => {
    const parts = ["Donor Mare"];
    if (horse.reproductive_status) {
      parts.push(REPRO_LABEL[horse.reproductive_status]);
    }
    return parts.join(" · ");
  }, [horse.reproductive_status]);

  const sireName =
    horse.sire_horse_id && horseNames[horse.sire_horse_id]
      ? horseNames[horse.sire_horse_id]
      : horse.sire;
  const damName =
    horse.dam_horse_id && horseNames[horse.dam_horse_id]
      ? horseNames[horse.dam_horse_id]
      : horse.dam;
  const hasParentage = !!(sireName || damName);

  const displayName = getHorseDisplayName(horse);
  const secondaryName = getHorseSecondaryName(horse);
  const breadcrumb = [
    { label: "Breeders Pro", href: "/breeders-pro" },
    { label: "Donor Mare" },
    { label: displayName },
  ];


  return (
    <BreedersProChrome breadcrumb={breadcrumb}>
      {/* ============== HEADER ============== */}
      <div className="bp-profile-header">
        <div className="bp-profile-top">
          <div className="bp-profile-identity">
            <div className="bp-profile-meta">
              <div className="bp-role-tag">{roleTag}</div>
              <h1 className="bp-profile-name">{displayName}</h1>
              {secondaryName && (
                <div className="bp-profile-alias text-sm italic text-barn-dark/60">
                  {secondaryName}
                </div>
              )}
              <div className="bp-profile-attributes">
                {horse.registration_number && (
                  <div className="bp-attr">
                    <span className="bp-attr-label">Reg</span>
                    <span>{horse.registration_number}</span>
                  </div>
                )}
                {horse.foal_date && (
                  <div className="bp-attr">
                    <span className="bp-attr-label">Foaled</span>
                    <span>{fmtIso(horse.foal_date)}</span>
                  </div>
                )}
                {horse.breed && (
                  <div className="bp-attr">
                    <span className="bp-attr-label">Breed</span>
                    <span>{horse.breed}</span>
                  </div>
                )}
                {horse.color && (
                  <div className="bp-attr">
                    <span className="bp-attr-label">Color</span>
                    <span>{horse.color}</span>
                  </div>
                )}
                {horse.sex && (
                  <div className="bp-attr">
                    <span className="bp-attr-label">Sex</span>
                    <span>{horse.sex}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Breeding method action bar — mare perspective. */}
          <div className="bp-profile-actions">
            {canEdit && (
              <div className="bp-method-group" role="group" aria-label="Breeding method">
                <Link
                  href="/breeders-pro/flush/new"
                  className="bp-btn bp-primary"
                >
                  + Flush
                </Link>
                <Link
                  href="/breeders-pro/live-cover/new"
                  className="bp-btn bp-primary"
                >
                  + Traditional Carry
                </Link>
              </div>
            )}
          </div>
        </div>

        {hasParentage && (
          <div
            style={{
              marginTop: 24,
              padding: "14px 16px",
              background: "var(--bp-bg-sunken)",
              border: "1px solid var(--bp-border)",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                fontFamily: "var(--bp-font-mono)",
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--bp-ink-tertiary)",
                flexShrink: 0,
              }}
            >
              Lineage
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 12,
                flex: 1,
                flexWrap: "wrap",
              }}
            >
              {sireName && (
                <span style={{ color: "var(--bp-ink)" }}>
                  <span
                    style={{
                      fontFamily: "var(--bp-font-mono)",
                      fontSize: 9,
                      color: "var(--bp-ink-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginRight: 6,
                    }}
                  >
                    Sire
                  </span>
                  <span style={{ fontWeight: 500 }}>{sireName}</span>
                </span>
              )}
              {sireName && damName && (
                <span style={{ color: "var(--bp-ink-quaternary)" }}>×</span>
              )}
              {damName && (
                <span style={{ color: "var(--bp-ink)" }}>
                  <span
                    style={{
                      fontFamily: "var(--bp-font-mono)",
                      fontSize: 9,
                      color: "var(--bp-ink-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginRight: 6,
                    }}
                  >
                    Dam
                  </span>
                  <span style={{ fontWeight: 500 }}>{damName}</span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ============== METRICS ============== */}
      <div
        className="bp-metrics"
        style={{ gridTemplateColumns: "repeat(6, 1fr)" }}
      >
        <div className="bp-metric">
          <div className="bp-metric-label">Lifetime Embryos</div>
          <div className="bp-metric-value">{metrics.lifetimeEmbryos}</div>
          <div className="bp-metric-delta">
            across {flushes.length} flush{flushes.length === 1 ? "" : "es"}
          </div>
        </div>
        <div className="bp-metric">
          <div className="bp-metric-label">{new Date().getFullYear()} Season</div>
          <div className="bp-metric-value">{metrics.seasonEmbryos}</div>
          <div
            className={`bp-metric-delta ${metrics.seasonDelta > 0 ? "bp-positive" : ""}`}
          >
            {metrics.seasonDelta === 0
              ? "same as last year"
              : `${metrics.seasonDelta > 0 ? "+" : ""}${metrics.seasonDelta} vs ${new Date().getFullYear() - 1}`}
          </div>
        </div>
        <div className="bp-metric">
          <div className="bp-metric-label">Avg per Flush</div>
          <div className="bp-metric-value">
            {metrics.avgPerFlush != null ? metrics.avgPerFlush.toFixed(1) : "—"}
          </div>
          <div className="bp-metric-delta">lifetime</div>
        </div>
        <div className="bp-metric">
          <div className="bp-metric-label">Live Foals</div>
          <div className="bp-metric-value">{metrics.liveFoals}</div>
          <div className="bp-metric-delta">
            {metrics.conversionPct != null
              ? `${metrics.conversionPct}% conversion`
              : "—"}
          </div>
        </div>
        <div className="bp-metric">
          <div className="bp-metric-label">Avg Grade</div>
          <div className="bp-metric-value">
            {metrics.avgGrade != null ? metrics.avgGrade.toFixed(1) : "—"}
          </div>
          <div className="bp-metric-delta">
            {metrics.lifetimeEmbryos} graded
          </div>
        </div>
        <div className="bp-metric">
          <div className="bp-metric-label">Cost / Embryo</div>
          <div className="bp-metric-value">
            {metrics.costPerEmbryo != null
              ? `$${Math.round(metrics.costPerEmbryo).toLocaleString()}`
              : "—"}
          </div>
          <div className="bp-metric-delta">flush cost basis</div>
        </div>
      </div>

      {/* ============== CONTENT GRID ============== */}
      <div className="bp-content">
        <div className="bp-content-main">
          {/* ===== EMBRYOS — first-class section, top of column ===== */}
          {/* Lifted out of the old tabs structure per user feedback —
              this is the highest-importance content on a donor profile,
              so it leads the column. Same shape as Stallion profile's
              Sired Embryos: section header, filter chips, full table. */}
          <DonorEmbryosSection
            embryos={embryos}
            embryoLocations={embryoLocations}
            horseNames={horseNames}
            filter={embryoFilter}
            onFilter={setEmbryoFilter}
          />

          {/* ===== BREEDING TIMELINE ===== */}
          <>
              <div className="bp-section-header">
                <div className="bp-section-title">Breeding Timeline</div>
                <div className="bp-section-meta">
                  {flushes.length} cycle{flushes.length === 1 ? "" : "s"}
                  {" · "}
                  {seasons.length} season{seasons.length === 1 ? "" : "s"}
                </div>
              </div>

              {seasons.length === 0 ? (
                <div className="bp-empty">
                  No flush history recorded for this donor yet.
                </div>
              ) : (
                seasons.map((s) => (
                  <div key={s.year} className="bp-season-group">
                    <div className="bp-season-header">
                      <div className="bp-season-year">{s.year}</div>
                      <div className="bp-season-summary">
                        {s.flushes.length} cycle
                        {s.flushes.length === 1 ? "" : "s"}
                        <span className="bp-sep">·</span>
                        {s.embryoCount} embryo{s.embryoCount === 1 ? "" : "s"}
                        <span className="bp-sep">·</span>
                        {s.transferred} transferred
                        <span className="bp-sep">·</span>
                        {s.foaled} foal{s.foaled === 1 ? "" : "s"}
                      </div>
                    </div>

                    {s.flushes.map((f) => {
                      const flushEmbryos = embryosByFlush[f.id] ?? [];
                      const stallionName = f.stallion_horse_id
                        ? horseNames[f.stallion_horse_id] ?? "Unknown"
                        : f.external_stallion_name ?? "External";
                      const flushGrades = flushEmbryos
                        .map((e) => GRADE_NUM[e.grade])
                        .filter((n): n is number => n != null);
                      const flushAvgGrade = avg(flushGrades);
                      const isExpanded = expanded[f.id] ?? false;

                      return (
                        <div
                          key={f.id}
                          className={`bp-cycle ${isExpanded ? "bp-expanded" : ""}`}
                        >
                          <button
                            type="button"
                            className="bp-cycle-header"
                            onClick={() =>
                              setExpanded((prev) => ({
                                ...prev,
                                [f.id]: !prev[f.id],
                              }))
                            }
                            aria-expanded={isExpanded}
                          >
                            <div className="bp-cycle-date">
                              {fmtMonthDay(f.flush_date)}
                            </div>
                            <div className="bp-cycle-cross">
                              × <span className="bp-stallion">{stallionName}</span>
                              <span className="bp-method">
                                {METHOD_SHORT[f.breeding_method]}
                              </span>
                            </div>
                            <div className="bp-cycle-result">
                              <div className="bp-result-stat">
                                <div className="bp-result-value">
                                  {flushEmbryos.length || f.embryo_count}
                                </div>
                                <div className="bp-result-label">Embryos</div>
                              </div>
                              <div className="bp-result-stat">
                                <div className="bp-result-value">
                                  {flushAvgGrade != null
                                    ? flushAvgGrade.toFixed(1)
                                    : "—"}
                                </div>
                                <div className="bp-result-label">Avg Grade</div>
                              </div>
                            </div>
                            <div className="bp-cycle-expand">
                              {isExpanded ? "−" : "+"}
                            </div>
                          </button>

                          {isExpanded && flushEmbryos.length > 0 && (
                            <div className="bp-cycle-detail">
                              {flushEmbryos.map((e) => (
                                <Link
                                  key={e.id}
                                  href={`/breeders-pro/${e.id}`}
                                  className="bp-embryo-row"
                                >
                                  <span className="bp-code">
                                    {e.embryo_code}
                                  </span>
                                  <span className="bp-stage">
                                    {STAGE_SHORT[e.stage]}
                                  </span>
                                  <span
                                    className={`bp-grade ${GRADE_CLASS[e.grade]}`}
                                  >
                                    {GRADE_NUM[e.grade] != null
                                      ? `G${GRADE_NUM[e.grade]}`
                                      : "—"}
                                  </span>
                                  <span
                                    className={`bp-status ${STATUS_CLASS[e.status]}`}
                                  >
                                    <span className="bp-status-dot" />
                                    {STATUS_SHORT[e.status]}
                                  </span>
                                  <span className="bp-arrow">→</span>
                                </Link>
                              ))}
                            </div>
                          )}

                          {isExpanded && flushEmbryos.length === 0 && (
                            <div className="bp-cycle-detail">
                              <div
                                style={{
                                  padding: "8px 0",
                                  color: "var(--bp-ink-quaternary)",
                                  fontSize: 11,
                                  fontFamily: "var(--bp-font-mono)",
                                }}
                              >
                                No embryos linked to this flush record.
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </>
        </div>

        {/* ============== OPU SESSIONS ============== */}
        {opuSessions.length > 0 && (
          <div className="bp-side-section" style={{ marginTop: 24 }}>
            <div className="bp-section-header">
              <div className="bp-section-title">OPU Sessions</div>
              <div className="bp-section-meta">
                {opuSessions.length} session{opuSessions.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="bp-table-wrap" style={{ marginTop: 12 }}>
              <table className="bp-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Oocytes</th>
                    <th>Batches</th>
                    <th>Embryos</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {opuSessions.map((s) => {
                    const summary = opuSummaries[s.id];
                    const stallionLabels = summary
                      ? summary.stallionNames
                          .map((id) => horseNames[id] ?? "Unknown")
                          .filter((v, i, a) => a.indexOf(v) === i)
                      : [];

                    return (
                      <tr
                        key={s.id}
                        className="bp-row-link"
                        onClick={() => {
                          window.location.href = `/breeders-pro/opu/${s.id}`;
                        }}
                      >
                        <td className="bp-mono">{fmtIso(s.opu_date)}</td>
                        <td className="bp-mono">{s.oocytes_recovered}</td>
                        <td className="bp-mono">{summary?.batches ?? 0}</td>
                        <td className="bp-mono">
                          {summary?.embryosCreated ?? 0}
                        </td>
                        <td>
                          {summary && summary.pending > 0 ? (
                            <span className="bp-status bp-status-transferred">
                              <span className="bp-status-dot" />
                              In progress
                            </span>
                          ) : summary && summary.developed > 0 ? (
                            <span className="bp-status bp-status-foal">
                              <span className="bp-status-dot" />
                              Complete
                            </span>
                          ) : (
                            <span className="bp-status bp-status-fresh">
                              <span className="bp-status-dot" />
                              New
                            </span>
                          )}
                        </td>
                        <td>
                          {stallionLabels.length > 0 && (
                            <span
                              style={{
                                fontSize: 11,
                                color: "var(--bp-ink-secondary)",
                              }}
                            >
                              {stallionLabels.join(", ")}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============== SIDE PANEL ============== */}
        <aside className="bp-content-side">
          <div className="bp-side-section">
            <div className="bp-side-label">Reproductive Status</div>
            <div className="bp-info-list">
              <div className="bp-info-row">
                <span className="bp-info-key">Status</span>
                <span className="bp-info-value">
                  {horse.reproductive_status
                    ? REPRO_LABEL[horse.reproductive_status]
                    : "—"}
                </span>
              </div>
              <div className="bp-info-row">
                <span className="bp-info-key">Last Flush</span>
                <span className="bp-info-value bp-mono">
                  {flushes[0]?.flush_date
                    ? fmtIso(flushes[0].flush_date)
                    : "—"}
                </span>
              </div>
              <div className="bp-info-row">
                <span className="bp-info-key">Breeding Role</span>
                <span className="bp-info-value">
                  {horse.breeding_role === "multiple"
                    ? "Donor · Multi"
                    : "Donor"}
                </span>
              </div>
              <div className="bp-info-row">
                <span className="bp-info-key">Archived</span>
                <span className="bp-info-value">
                  {horse.archived ? "Yes" : "No"}
                </span>
              </div>
            </div>
          </div>

          <div className="bp-side-section">
            <div className="bp-side-label">Embryos by Season</div>
            <div className="bp-chart-card">
              <div className="bp-chart-title">Last 4 seasons</div>
              <div className="bp-chart-bars">
                {chart.counts.map((count, i) => {
                  const pct = Math.round((count / chart.max) * 100);
                  const isCurrent = i === chart.counts.length - 1;
                  return (
                    <div
                      key={chart.years[i]}
                      className={`bp-bar ${isCurrent ? "" : "bp-muted"}`}
                      style={{ height: `${Math.max(pct, 6)}%` }}
                      title={`${chart.years[i]}: ${count} embryos`}
                    />
                  );
                })}
              </div>
              <div className="bp-chart-labels">
                {chart.years.map((y) => (
                  <span key={y}>{`'${String(y).slice(-2)}`}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="bp-side-section">
            <div className="bp-side-label">Top Crosses</div>
            {topCrosses.length === 0 ? (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--bp-ink-quaternary)",
                  fontFamily: "var(--bp-font-mono)",
                }}
              >
                No crosses recorded
              </div>
            ) : (
              <div className="bp-info-list">
                {topCrosses.map((c) => (
                  <div key={c.name} className="bp-info-row">
                    <span className="bp-info-key" style={{ textTransform: "none", fontSize: 11, color: "var(--bp-ink)", fontWeight: 500 }}>
                      {c.name}
                    </span>
                    <span className="bp-info-value bp-mono">
                      {c.embryos} emb · {c.foals} foal
                      {c.foals === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bp-side-section">
            <div className="bp-side-label">Lifetime</div>
            <div className="bp-info-list">
              <div className="bp-info-row">
                <span className="bp-info-key">Tracked Embryos</span>
                <span className="bp-info-value bp-mono">
                  {horse.lifetime_embryo_count}
                </span>
              </div>
              <div className="bp-info-row">
                <span className="bp-info-key">Live Foals</span>
                <span className="bp-info-value bp-mono">
                  {horse.lifetime_live_foal_count}
                </span>
              </div>
              <div className="bp-info-row">
                <span className="bp-info-key">Losses</span>
                <span
                  className="bp-info-value bp-mono"
                  style={{
                    color:
                      (horse.lifetime_loss_count ?? 0) > 0
                        ? "#b8421f"
                        : undefined,
                  }}
                >
                  {horse.lifetime_loss_count ?? 0}
                </span>
              </div>
              <div className="bp-info-row">
                <span className="bp-info-key">Flushes</span>
                <span className="bp-info-value bp-mono">
                  {flushes.length}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </BreedersProChrome>
  );
}

/* ============================================================
 * DonorEmbryosSection — first-class "All Embryos" block on the
 * donor mare profile, mirrors the Stallion profile's
 * StallionSiredEmbryos in shape and styling.
 *
 * Layout:
 *   bp-side-section
 *     bp-section-header   (title + N total)
 *     bp-filters          (chips with count pills)
 *     bp-table-wrap       (Code · Sire · Created · Status · Location)
 *
 * The donor profile shows ALL the donor mare's embryos in one flat
 * list — no per-flush grouping (that lives in the Breeding Timeline
 * section below). On a donor profile, every row is from this same
 * donor, so the variable per row is the SIRE — that's the second
 * column. External sires (no horse row) just render as plain text.
 *
 * Row click → Embryo Detail. Sire and location links use
 * stopPropagation so they navigate to their own targets without
 * also firing the row click.
 *
 * Mobile: bp-filters wraps; bp-table scrolls horizontally via the
 * mobile rule in globals.css; bp-location-cell shrinks via the
 * @media block already in place.
 * ============================================================ */
function DonorEmbryosSection({
  embryos,
  embryoLocations,
  horseNames,
  filter,
  onFilter,
}: {
  embryos: Embryo[];
  embryoLocations: Record<string, EmbryoLocation>;
  horseNames: Record<string, string>;
  filter: EmbryoFilterKind;
  onFilter: (k: EmbryoFilterKind) => void;
}) {
  const counts = useMemo(() => {
    const c: Record<EmbryoFilterKind, number> = {
      all: embryos.length,
      fresh: 0,
      frozen: 0,
      transferred: 0,
      foaled: 0,
      lost: 0,
      shipped: 0,
    };
    for (const e of embryos) {
      const loc = embryoLocations[e.id];
      if (!loc) continue;
      if (loc.kind === "fresh") c.fresh++;
      else if (loc.kind === "frozen") c.frozen++;
      else if (loc.kind === "transferred") c.transferred++;
      else if (loc.kind === "foaled") c.foaled++;
      else if (loc.kind === "lost_pre" || loc.kind === "lost_post") c.lost++;
      else if (loc.kind === "shipped") c.shipped++;
    }
    return c;
  }, [embryos, embryoLocations]);

  const filtered = useMemo(() => {
    if (filter === "all") return embryos;
    return embryos.filter((e) => {
      const loc = embryoLocations[e.id];
      if (!loc) return false;
      if (filter === "lost")
        return loc.kind === "lost_pre" || loc.kind === "lost_post";
      return loc.kind === filter;
    });
  }, [embryos, embryoLocations, filter]);

  if (embryos.length === 0) {
    return (
      <div className="bp-side-section">
        <div className="bp-section-header">
          <div className="bp-section-title">Embryos</div>
        </div>
        <div className="bp-empty">No embryos recorded for this donor.</div>
      </div>
    );
  }

  const chips: { key: EmbryoFilterKind; label: string }[] = [
    { key: "all", label: "All" },
    { key: "fresh", label: "Fresh" },
    { key: "frozen", label: "Frozen" },
    { key: "transferred", label: "Transferred" },
    { key: "foaled", label: "Foaled" },
    { key: "lost", label: "Lost" },
    { key: "shipped", label: "Shipped" },
  ];

  return (
    <div className="bp-side-section">
      <div className="bp-section-header">
        <div className="bp-section-title">Embryos</div>
        <div className="bp-section-meta">{embryos.length} total</div>
      </div>

      <div className="bp-filters" style={{ marginTop: 12, marginBottom: 12 }}>
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`bp-chip ${filter === c.key ? "bp-active" : ""}`}
            onClick={() => onFilter(c.key)}
            disabled={counts[c.key] === 0 && c.key !== "all"}
          >
            {c.label}
            <span className="bp-chip-count">{counts[c.key]}</span>
          </button>
        ))}
      </div>

      <div className="bp-table-wrap">
        <table className="bp-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Sire</th>
              <th>Created</th>
              <th>Status</th>
              <th>Current Location</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const loc = embryoLocations[e.id];
              // Sire cell: barn stallion → linked horse profile;
              // external sire (text only) → plain text;
              // missing → em dash.
              const sireName = e.stallion_horse_id
                ? (horseNames[e.stallion_horse_id] ?? "Unknown")
                : (e.external_stallion_name ?? null);
              return (
                <tr
                  key={e.id}
                  className="bp-row-link"
                  onClick={() => {
                    window.location.href = `/breeders-pro/${e.id}`;
                  }}
                >
                  <td className="bp-mono">{e.embryo_code}</td>
                  <td>
                    {e.stallion_horse_id ? (
                      <Link
                        href={`/breeders-pro/stallions/${e.stallion_horse_id}`}
                        style={{
                          color: "var(--bp-ink)",
                          textDecoration: "none",
                        }}
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        {sireName}
                      </Link>
                    ) : sireName ? (
                      <span>{sireName}</span>
                    ) : (
                      <span style={{ color: "var(--bp-ink-quaternary)" }}>
                        —
                      </span>
                    )}
                  </td>
                  <td className="bp-mono">
                    {e.created_at
                      ? new Date(e.created_at).toISOString().slice(0, 10)
                      : "—"}
                  </td>
                  <td>
                    <span className={`bp-status ${STATUS_CLASS[e.status]}`}>
                      <span className="bp-status-dot" />
                      {STATUS_SHORT[e.status]}
                    </span>
                  </td>
                  <td>
                    {loc ? (
                      loc.href ? (
                        <Link
                          href={loc.href}
                          className={`bp-location-cell${
                            loc.muted ? " bp-location-muted" : ""
                          }`}
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          {loc.short}
                        </Link>
                      ) : (
                        <span
                          className={`bp-location-cell${
                            loc.muted ? " bp-location-muted" : ""
                          }`}
                        >
                          {loc.short}
                        </span>
                      )
                    ) : (
                      <span className="bp-location-cell bp-location-muted">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
