"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Embryo } from "@/lib/types";
import type { EmbryoLocation } from "@/lib/embryo-location";
import {
  EMBRYO_STATUS_LABELS,
  type EmbryoStatus,
} from "@/lib/horse-form-constants";
import { BreedersProChrome } from "@/components/breeders-pro/BreedersProChrome";

/* ------------------------------------------------------------------
 * Presentation layer only.
 * Same props, same filtering, same nav target as the prior version.
 * No data fetching, no server actions, no backend calls here.
 * ------------------------------------------------------------------ */

type StatusFilter = "all" | EmbryoStatus;

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in_bank_fresh", label: "Fresh" },
  { value: "in_bank_frozen", label: "Frozen" },
  { value: "transferred", label: "Transferred" },
  { value: "became_foal", label: "Foaled" },
  { value: "shipped_out", label: "Shipped" },
  { value: "lost", label: "Lost" },
];

const STATUS_CLASS: Record<EmbryoStatus, string> = {
  in_bank_fresh: "bp-status-fresh",
  in_bank_frozen: "bp-status-frozen",
  transferred: "bp-status-transferred",
  became_foal: "bp-status-foal",
  shipped_out: "bp-status-shipped",
  lost: "bp-status-lost",
};

const STATUS_SHORT: Record<EmbryoStatus, string> = {
  in_bank_fresh: "Fresh",
  in_bank_frozen: "Frozen",
  transferred: "Transferred",
  became_foal: "Foaled",
  shipped_out: "Shipped",
  lost: "Lost",
};

const GRADE_NUMBER: Record<Embryo["grade"], string> = {
  grade_1: "1",
  grade_2: "2",
  grade_3: "3",
  grade_4: "4",
  degenerate: "—",
};

const GRADE_CLASS: Record<Embryo["grade"], string> = {
  grade_1: "bp-grade-1",
  grade_2: "bp-grade-2",
  grade_3: "bp-grade-3",
  grade_4: "bp-grade-4",
  degenerate: "bp-grade-4",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function formatAge(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.max(0, Math.floor((Date.now() - then) / 86400000));
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

export function EmbryoBankClient({
  embryos,
  embryoLocations,
  horseNames,
  canEdit,
}: {
  embryos: Embryo[];
  embryoLocations: Record<string, EmbryoLocation>;
  horseNames: Record<string, string>;
  canEdit: boolean;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  // Filter logic — identical semantics to the prior version.
  const filtered = useMemo(() => {
    return embryos.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const donorName = horseNames[e.donor_horse_id] ?? "";
        const stallionName = e.stallion_horse_id
          ? horseNames[e.stallion_horse_id] ?? ""
          : e.external_stallion_name ?? "";
        if (
          !e.embryo_code.toLowerCase().includes(q) &&
          !donorName.toLowerCase().includes(q) &&
          !stallionName.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [embryos, statusFilter, search, horseNames]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of embryos) c[e.status] = (c[e.status] ?? 0) + 1;
    return c;
  }, [embryos]);

  // Metric values — derived from the same in-memory list only.
  const metrics = useMemo(() => {
    const total = embryos.length;
    const fresh = statusCounts.in_bank_fresh ?? 0;
    const frozen = statusCounts.in_bank_frozen ?? 0;
    const inTransfer = statusCounts.transferred ?? 0;
    const gradeNums = embryos
      .map((e): number | null =>
        e.grade === "grade_1"
          ? 1
          : e.grade === "grade_2"
            ? 2
            : e.grade === "grade_3"
              ? 3
              : e.grade === "grade_4"
                ? 4
                : null,
      )
      .filter((n): n is number => n !== null);
    const avgGrade = gradeNums.length
      ? (gradeNums.reduce((a, b) => a + b, 0) / gradeNums.length).toFixed(1)
      : "—";
    return { total, fresh, frozen, inTransfer, avgGrade };
  }, [embryos, statusCounts]);

  const updatedAt = useMemo(() => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    return `UPDATED ${hh}:${mm}`;
  }, []);

  return (
    <BreedersProChrome breadcrumb={[{ label: "Workspace" }, { label: "Embryo Bank" }]}>
      {/* Page header */}
      <div className="bp-page-header">
        <div className="bp-page-title-row">
          <h1 className="bp-page-title">Embryo Bank</h1>
          <div className="bp-page-meta">{updatedAt}</div>
        </div>
        <p className="bp-page-subtitle">
          All embryo assets across the program. Filter by status, sort by any
          column, or search by code, donor, or stallion.
        </p>
      </div>

      {/* Metrics */}
      <div className="bp-metrics">
        <div className="bp-metric">
          <div className="bp-metric-label">Total in Bank</div>
          <div className="bp-metric-value">{metrics.total}</div>
          <div className="bp-metric-delta">across program</div>
        </div>
        <div className="bp-metric">
          <div className="bp-metric-label">Fresh</div>
          <div className="bp-metric-value">{metrics.fresh}</div>
          <div className="bp-metric-delta">awaiting transfer</div>
        </div>
        <div className="bp-metric">
          <div className="bp-metric-label">Frozen</div>
          <div className="bp-metric-value">{metrics.frozen}</div>
          <div className="bp-metric-delta">in storage</div>
        </div>
        <div className="bp-metric">
          <div className="bp-metric-label">In Transfer</div>
          <div className="bp-metric-value">{metrics.inTransfer}</div>
          <div className="bp-metric-delta">pending check</div>
        </div>
        <div className="bp-metric">
          <div className="bp-metric-label">Avg Grade</div>
          <div className="bp-metric-value">{metrics.avgGrade}</div>
          <div className="bp-metric-delta">graded embryos</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bp-toolbar">
        <div className="bp-filters">
          {STATUS_TABS.map((tab) => {
            const count =
              tab.value === "all" ? embryos.length : statusCounts[tab.value] ?? 0;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
                className={`bp-chip ${statusFilter === tab.value ? "bp-active" : ""}`}
              >
                {tab.label}
                <span className="bp-chip-count">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="bp-search">
          <svg
            className="bp-search-icon"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="7" cy="7" r="5" />
            <line x1="11" y1="11" x2="14" y2="14" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code, donor, or stallion…"
          />
        </div>

        <div className="bp-toolbar-actions">
          <button type="button" className="bp-btn">
            Export
          </button>
          {canEdit && (
            <Link href="/breeders-pro/breeding/new" className="bp-btn bp-primary">
              + New Breeding
            </Link>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bp-table-wrap">
        <div className="bp-table-container">
          {filtered.length === 0 ? (
            <div className="bp-empty">
              {embryos.length === 0
                ? "No embryos yet. Record a flush from a donor mare to get started."
                : "No embryos match the current filters."}
            </div>
          ) : (
            <table className="bp-table bp-table-embryos">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Donor</th>
                  <th>Stallion</th>
                  <th>Grade</th>
                  <th>Status</th>
                  <th>Current Location</th>
                  <th>Flush Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((embryo) => {
                  const donorName =
                    horseNames[embryo.donor_horse_id] ?? "Unknown";
                  const stallionName = embryo.stallion_horse_id
                    ? horseNames[embryo.stallion_horse_id] ?? "Unknown"
                    : embryo.external_stallion_name ?? "External";
                  // Pulled from the shared computeEmbryoLocation helper
                  // (computed server-side). Includes surrogate name for
                  // transferred, foal name for foaled, full storage path
                  // for frozen, ship destination for shipped, etc.
                  const loc = embryoLocations[embryo.id];
                  const statusLabel =
                    STATUS_SHORT[embryo.status] ??
                    EMBRYO_STATUS_LABELS[embryo.status];
                  const href = `/breeders-pro/${embryo.id}`;

                  return (
                    <tr
                      key={embryo.id}
                      onClick={(e) => {
                        // Avoid navigation when clicking the explicit row button.
                        if ((e.target as HTMLElement).closest(".bp-row-action"))
                          return;
                        window.location.href = href;
                      }}
                    >
                      <td>
                        <span className="bp-code">{embryo.embryo_code}</span>
                      </td>
                      <td>
                        <Link
                          href={`/breeders-pro/donors/${embryo.donor_horse_id}`}
                          className="bp-donor-cell"
                          onClick={(e) => e.stopPropagation()}
                          style={{ textDecoration: "none", color: "inherit" }}
                        >
                          <span className="bp-donor-name">{donorName}</span>
                          {embryo.label && (
                            <span className="bp-donor-reg">{embryo.label}</span>
                          )}
                        </Link>
                      </td>
                      <td>
                        {embryo.stallion_horse_id ? (
                          <Link
                            href={`/breeders-pro/stallions/${embryo.stallion_horse_id}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ textDecoration: "none", color: "inherit" }}
                          >
                            <span className="bp-donor-name">{stallionName}</span>
                          </Link>
                        ) : (
                          <span className="bp-donor-name">{stallionName}</span>
                        )}
                      </td>
                      <td>
                        <span className={`bp-grade ${GRADE_CLASS[embryo.grade]}`}>
                          {GRADE_NUMBER[embryo.grade]}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`bp-status ${STATUS_CLASS[embryo.status]}`}
                        >
                          <span className="bp-status-dot" />
                          {statusLabel}
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
                              onClick={(e) => e.stopPropagation()}
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
                      <td>
                        <span className="bp-date-cell">
                          {formatDate(embryo.created_at)}
                        </span>
                        <div className="bp-date-age">
                          {formatAge(embryo.created_at)}
                        </div>
                      </td>
                      <td className="bp-actions-cell">
                        <Link
                          href={href}
                          className="bp-row-action"
                          aria-label={`Open ${embryo.embryo_code}`}
                        >
                          →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {filtered.length > 0 && (
            <div className="bp-table-footer">
              <div>
                Showing {filtered.length} of {embryos.length}
              </div>
            </div>
          )}
        </div>
      </div>
    </BreedersProChrome>
  );
}
