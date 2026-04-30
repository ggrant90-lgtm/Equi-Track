"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Embryo, Foaling, Pregnancy } from "@/lib/types";
import {
  PREGNANCY_STATUS_LABELS,
  PREGNANCY_CHECK_LABELS,
  PREGNANCY_CHECKS,
  FOALING_TYPES,
  FOALING_TYPE_LABELS,
} from "@/lib/horse-form-constants";
import {
  logPregnancyCheckAction,
  recordFoalingAction,
  confirmSurvivalAction,
  markPregnancyLostAction,
  deletePregnancyAction,
} from "@/app/(protected)/actions/pregnancy";
import { BreedersProChrome } from "@/components/breeders-pro/BreedersProChrome";

/* --------------------------------------------------------------------
 * Pregnancy Detail — Breeders Pro profile-with-context view.
 *
 * Presentation only. All mutations route through the existing server
 * actions (logPregnancyCheckAction, recordFoalingAction,
 * confirmSurvivalAction) with identical signatures. No data-layer
 * changes were made.
 * ------------------------------------------------------------------ */

function isTraditionalCarry(method: string | null | undefined): boolean {
  return method === "live_cover" || (method?.startsWith("ai_") ?? false);
}

const AI_METHOD_LABELS: Record<string, string> = {
  ai_fresh: "AI \u2014 Fresh",
  ai_cooled: "AI \u2014 Cooled",
  ai_frozen: "AI \u2014 Frozen",
};

const STATUS_CLASS: Record<Pregnancy["status"], string> = {
  pending_check: "bp-status-frozen",
  confirmed: "bp-status-fresh",
  lost_early: "bp-status-lost",
  lost_late: "bp-status-lost",
  foaled: "bp-status-foal",
  aborted: "bp-status-lost",
};

const CHECK_VALUE_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  not_pregnant: "Not Pregnant",
  pending: "Pending",
  not_done: "Not Done",
};

const CHECK_VALUE_CLASS: Record<string, string> = {
  confirmed: "bp-status-fresh",
  not_pregnant: "bp-status-lost",
  pending: "bp-status-transferred",
  not_done: "bp-status-shipped",
};

function fmtIso(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso);
  const b = new Date(bIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function PregnancyDetailClient({
  pregnancy,
  horseNames,
  canEdit,
  foaling,
  embryo,
}: {
  pregnancy: Pregnancy;
  horseNames: Record<string, string>;
  canEdit: boolean;
  foaling: Foaling | null;
  embryo: Pick<Embryo, "id" | "embryo_code" | "label" | "grade" | "stage"> | null;
}) {
  const router = useRouter();
  const [checkModal, setCheckModal] = useState<string | null>(null);
  const [showFoalingModal, setShowFoalingModal] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const surrogateName = horseNames[pregnancy.surrogate_horse_id] ?? "Unknown";
  const donorName = horseNames[pregnancy.donor_horse_id] ?? "Unknown";
  const stallionName = pregnancy.stallion_horse_id
    ? (horseNames[pregnancy.stallion_horse_id] ?? "Unknown")
    : "—";

  const daysPregnant = Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(pregnancy.transfer_date).getTime()) /
        (1000 * 60 * 60 * 24),
    ),
  );
  const daysToFoal = pregnancy.expected_foaling_date
    ? daysBetween(
        new Date().toISOString(),
        pregnancy.expected_foaling_date,
      )
    : null;

  const isActive =
    pregnancy.status === "pending_check" || pregnancy.status === "confirmed";
  const canRecordFoaling = isActive && !foaling;

  const foalDaysOld = foaling
    ? Math.floor(
        (Date.now() - new Date(foaling.foaling_date).getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : 0;
  const canConfirmSurvival =
    !!foaling &&
    foaling.foal_alive_at_24hr !== false &&
    foaling.foal_alive_at_30d !== true &&
    foalDaysOld >= 30;

  const breadcrumb = [
    { label: "Breeders Pro", href: "/breeders-pro" },
    { label: "Pregnancies", href: "/breeders-pro/pregnancies" },
    { label: surrogateName },
  ];

  async function handleCheckSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const result = await logPregnancyCheckAction(pregnancy.id, formData);
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    setCheckModal(null);
    setSaving(false);
    router.refresh();
  }

  async function handleFoalingSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const result = await recordFoalingAction(pregnancy.id, formData);
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    setShowFoalingModal(false);
    setSaving(false);
    router.refresh();
  }

  async function handleConfirmSurvival() {
    if (!foaling) return;
    setSaving(true);
    setError(null);
    const result = await confirmSurvivalAction(foaling.id);
    if (result.error) {
      setError(result.error);
    }
    setSaving(false);
    router.refresh();
  }

  async function handleMarkLostSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const result = await markPregnancyLostAction(pregnancy.id, formData);
    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }
    setShowLostModal(false);
    setSaving(false);
    router.refresh();
  }

  async function handleDelete() {
    setSaving(true);
    setError(null);
    const result = await deletePregnancyAction(pregnancy.id);
    if (result.error) {
      setError(result.error);
      setSaving(false);
      setConfirmingDelete(false);
      return;
    }
    // No router.refresh() — the page is gone.
    router.push("/breeders-pro/pregnancies");
  }

  return (
    <BreedersProChrome breadcrumb={breadcrumb}>
      {/* ============== HEADER ============== */}
      <div className="bp-profile-header">
        <div className="bp-profile-top">
          <div className="bp-profile-identity">
            <div className="bp-profile-meta">
              <div className="bp-role-tag">
                {isTraditionalCarry(pregnancy.conception_method)
                  ? "Traditional Carry"
                  : "Pregnancy"}
              </div>
              <h1 className="bp-profile-name">
                {isTraditionalCarry(pregnancy.conception_method)
                  ? `${donorName} × ${stallionName}`
                  : surrogateName}
              </h1>
              <div className="bp-profile-attributes">
                <div className="bp-attr">
                  <span className="bp-attr-label">
                    {pregnancy.conception_method === "live_cover"
                      ? "Cover Date"
                      : pregnancy.conception_method?.startsWith("ai_")
                        ? "Insemination Date"
                        : "Transfer"}
                  </span>
                  <span>{fmtIso(pregnancy.transfer_date)}</span>
                </div>
                <div className="bp-attr">
                  <span className="bp-attr-label">Gestation</span>
                  <span className="bp-mono">{daysPregnant}d</span>
                </div>
                {pregnancy.expected_foaling_date && (
                  <div className="bp-attr">
                    <span className="bp-attr-label">Expected</span>
                    <span>{fmtIso(pregnancy.expected_foaling_date)}</span>
                  </div>
                )}
                {daysToFoal != null && isActive && (
                  <div className="bp-attr">
                    <span className="bp-attr-label">ETA</span>
                    <span className="bp-mono">
                      {daysToFoal < 0 ? `${-daysToFoal}d late` : `${daysToFoal}d`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div
            className="bp-profile-actions"
            style={{ alignItems: "center", flexWrap: "wrap" }}
          >
            <div
              className={`bp-status ${STATUS_CLASS[pregnancy.status]}`}
              style={{ marginRight: 4 }}
            >
              <span className="bp-status-dot" />
              {PREGNANCY_STATUS_LABELS[pregnancy.status]}
            </div>
            {canEdit && canRecordFoaling && (
              <button
                type="button"
                className="bp-btn bp-primary"
                onClick={() => {
                  setError(null);
                  setShowFoalingModal(true);
                }}
              >
                Record Foaling
              </button>
            )}
            {canEdit && canConfirmSurvival && (
              <button
                type="button"
                className="bp-btn"
                onClick={handleConfirmSurvival}
                disabled={saving}
              >
                {saving ? "Saving…" : "Confirm 30-Day Survival"}
              </button>
            )}
            {canEdit && isActive && (
              <button
                type="button"
                className="bp-btn"
                onClick={() => {
                  setError(null);
                  setShowLostModal(true);
                }}
                title="Record this pregnancy as lost"
              >
                Mark Lost
              </button>
            )}
            {canEdit && (
              confirmingDelete ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--bp-ink-secondary)",
                    }}
                  >
                    Delete this pregnancy?
                  </span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={saving}
                    className="bp-btn"
                    style={{
                      background: "#b8421f",
                      color: "white",
                      borderColor: "#b8421f",
                    }}
                  >
                    {saving ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={saving}
                    className="bp-btn"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="bp-btn"
                  style={{ color: "#b8421f" }}
                  onClick={() => {
                    setError(null);
                    setConfirmingDelete(true);
                  }}
                  title="Delete this pregnancy (use only if it was created in error)"
                >
                  Delete
                </button>
              )
            )}
          </div>
        </div>

        {/* Lineage strip */}
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
            Cross
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
            <Link
              href={`/breeders-pro/donors/${pregnancy.donor_horse_id}`}
              style={{
                color: "var(--bp-ink)",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              {donorName}
            </Link>
            <span
              style={{
                color: "var(--bp-ink-tertiary)",
                fontFamily: "var(--bp-font-mono)",
              }}
            >
              ×
            </span>
            {pregnancy.stallion_horse_id ? (
              <Link
                href={`/breeders-pro/stallions/${pregnancy.stallion_horse_id}`}
                style={{
                  color: "var(--bp-ink)",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                {stallionName}
              </Link>
            ) : (
              <span style={{ color: "var(--bp-ink)", fontWeight: 500 }}>
                {stallionName}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ============== CONTENT ============== */}
      <div className="bp-content">
        <div className="bp-content-main">
          {/* Pregnancy check timeline */}
          <div className="bp-side-section">
            <div className="bp-section-header">
              <div className="bp-section-title">Pregnancy Check Timeline</div>
              <div className="bp-section-meta">
                {PREGNANCY_CHECKS.filter(
                  (c) =>
                    pregnancy[c] === "confirmed" ||
                    pregnancy[c] === "not_pregnant",
                ).length}{" "}
                / {PREGNANCY_CHECKS.length} checks logged
              </div>
            </div>

            <div
              style={{
                marginTop: 12,
                border: "1px solid var(--bp-border)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <table className="bp-table" style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>Result</th>
                    <th style={{ width: 120, textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {PREGNANCY_CHECKS.map((check) => {
                    const value = (pregnancy[check] ?? "not_done") as string;
                    const canLog =
                      canEdit &&
                      isActive &&
                      (value === "pending" || value === "not_done");
                    return (
                      <tr key={check}>
                        <td>{PREGNANCY_CHECK_LABELS[check]}</td>
                        <td>
                          <span
                            className={`bp-status ${CHECK_VALUE_CLASS[value]}`}
                          >
                            <span className="bp-status-dot" />
                            {CHECK_VALUE_LABEL[value]}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {canLog ? (
                            <button
                              type="button"
                              className="bp-btn"
                              style={{
                                padding: "4px 10px",
                                fontSize: 11,
                              }}
                              onClick={() => {
                                setError(null);
                                setCheckModal(check);
                              }}
                            >
                              Log
                            </button>
                          ) : (
                            <span className="bp-empty-cell">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Foaling record, if any */}
          {foaling && (
            <div className="bp-side-section">
              <div className="bp-side-label">Foaling Record</div>
              <div className="bp-info-list">
                <div className="bp-info-row">
                  <span className="bp-info-key">Date</span>
                  <span className="bp-info-value bp-mono">
                    {fmtIso(foaling.foaling_date)}
                  </span>
                </div>
                <div className="bp-info-row">
                  <span className="bp-info-key">Type</span>
                  <span className="bp-info-value">
                    {FOALING_TYPE_LABELS[foaling.foaling_type]}
                  </span>
                </div>
                <div className="bp-info-row">
                  <span className="bp-info-key">Sex</span>
                  <span
                    className="bp-info-value"
                    style={{ textTransform: "capitalize" }}
                  >
                    {foaling.foal_sex}
                  </span>
                </div>
                {foaling.foal_color && (
                  <div className="bp-info-row">
                    <span className="bp-info-key">Color</span>
                    <span className="bp-info-value">{foaling.foal_color}</span>
                  </div>
                )}
                {foaling.attending_vet_name && (
                  <div className="bp-info-row">
                    <span className="bp-info-key">Vet</span>
                    <span className="bp-info-value">
                      {foaling.attending_vet_name}
                    </span>
                  </div>
                )}
                <div className="bp-info-row">
                  <span className="bp-info-key">24-Hour</span>
                  <span className="bp-info-value">
                    {foaling.foal_alive_at_24hr === true
                      ? "Alive"
                      : foaling.foal_alive_at_24hr === false
                        ? "Lost"
                        : "—"}
                  </span>
                </div>
                <div className="bp-info-row">
                  <span className="bp-info-key">30-Day</span>
                  <span className="bp-info-value">
                    {foaling.foal_alive_at_30d === true
                      ? "Confirmed"
                      : foaling.foal_alive_at_30d === false
                        ? "Lost"
                        : "—"}
                  </span>
                </div>
                {foaling.foal_horse_id && (
                  <div className="bp-info-row">
                    <span className="bp-info-key">Foal Record</span>
                    <span
                      className="bp-info-value bp-mono"
                      style={{
                        fontSize: 10,
                        color: "var(--bp-ink-tertiary)",
                      }}
                    >
                      REGISTERED · PROFILE SOON
                    </span>
                  </div>
                )}
              </div>
              {foaling.complications && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    background: "var(--bp-bg-sunken)",
                    border: "1px solid var(--bp-border)",
                    borderRadius: 4,
                    fontSize: 12,
                    color: "var(--bp-ink-secondary)",
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--bp-font-mono)",
                      fontSize: 9,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "var(--bp-ink-tertiary)",
                      marginBottom: 4,
                    }}
                  >
                    Complications
                  </div>
                  {foaling.complications}
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {pregnancy.notes && (
            <div className="bp-side-section">
              <div className="bp-side-label">Transfer Notes</div>
              <div
                style={{
                  padding: 14,
                  background: "var(--bp-bg-sunken)",
                  border: "1px solid var(--bp-border)",
                  borderRadius: 4,
                  fontSize: 12,
                  color: "var(--bp-ink-secondary)",
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                }}
              >
                {pregnancy.notes}
              </div>
            </div>
          )}
        </div>

        {/* ============== SIDE PANEL ============== */}
        <aside className="bp-content-side">
          <div className="bp-side-section">
            <div className="bp-side-label">Linked Parties</div>
            <div className="bp-info-list">
              <div className="bp-info-row">
                <span className="bp-info-key">Surrogate</span>
                <span className="bp-info-value">
                  <Link
                    href={`/breeders-pro/surrogates/${pregnancy.surrogate_horse_id}`}
                    style={{
                      color: "var(--bp-ink)",
                      textDecoration: "none",
                      fontWeight: 500,
                    }}
                  >
                    {surrogateName}
                  </Link>
                </span>
              </div>
              <div className="bp-info-row">
                <span className="bp-info-key">Donor</span>
                <span className="bp-info-value">
                  <Link
                    href={`/breeders-pro/donors/${pregnancy.donor_horse_id}`}
                    style={{
                      color: "var(--bp-ink)",
                      textDecoration: "none",
                      fontWeight: 500,
                    }}
                  >
                    {donorName}
                  </Link>
                </span>
              </div>
              <div className="bp-info-row">
                <span className="bp-info-key">Sire</span>
                <span className="bp-info-value">
                  {pregnancy.stallion_horse_id ? (
                    <Link
                      href={`/breeders-pro/stallions/${pregnancy.stallion_horse_id}`}
                      style={{
                        color: "var(--bp-ink)",
                        textDecoration: "none",
                        fontWeight: 500,
                      }}
                    >
                      {stallionName}
                    </Link>
                  ) : (
                    <span>—</span>
                  )}
                </span>
              </div>
              {/* Embryo link — only for ET pregnancies, not traditional carry */}
              {!isTraditionalCarry(pregnancy.conception_method) && (
                <div className="bp-info-row">
                  <span className="bp-info-key">Embryo</span>
                  <span className="bp-info-value">
                    {embryo ? (
                      <Link
                        href={`/breeders-pro/${embryo.id}`}
                        className="bp-code"
                        style={{ textDecoration: "none" }}
                      >
                        {embryo.embryo_code}
                      </Link>
                    ) : (
                      <span className="bp-empty-cell">—</span>
                    )}
                  </span>
                </div>
              )}
              {/* Conception method — show for all pregnancies */}
              <div className="bp-info-row">
                <span className="bp-info-key">Method</span>
                <span className="bp-info-value bp-mono" style={{ textTransform: "uppercase", fontSize: 10, letterSpacing: "0.06em" }}>
                  {pregnancy.conception_method === "live_cover"
                    ? "LIVE COVER"
                    : pregnancy.conception_method === "embryo_transfer"
                      ? "ET"
                      : AI_METHOD_LABELS[pregnancy.conception_method]?.toUpperCase()
                        ?? pregnancy.conception_method?.replace(/_/g, " ").toUpperCase() ?? "—"}
                </span>
              </div>
              {/* Cover details — only for live cover */}
              {pregnancy.conception_method === "live_cover" && pregnancy.cover_method && (
                <div className="bp-info-row">
                  <span className="bp-info-key">Cover Method</span>
                  <span className="bp-info-value">
                    {pregnancy.cover_method.replace(/_/g, " ")}
                  </span>
                </div>
              )}
              {pregnancy.conception_method === "live_cover" && pregnancy.cover_count && (
                <div className="bp-info-row">
                  <span className="bp-info-key">Covers</span>
                  <span className="bp-info-value bp-mono">{pregnancy.cover_count}</span>
                </div>
              )}
              {/* AI details */}
              {pregnancy.conception_method?.startsWith("ai_") && (
                <>
                  {pregnancy.semen_source && (
                    <div className="bp-info-row">
                      <span className="bp-info-key">Semen Source</span>
                      <span className="bp-info-value">{pregnancy.semen_source}</span>
                    </div>
                  )}
                  {pregnancy.collection_date && (
                    <div className="bp-info-row">
                      <span className="bp-info-key">Collection Date</span>
                      <span className="bp-info-value bp-mono">{fmtIso(pregnancy.collection_date)}</span>
                    </div>
                  )}
                  {pregnancy.insemination_technique && (
                    <div className="bp-info-row">
                      <span className="bp-info-key">Technique</span>
                      <span className="bp-info-value">
                        {pregnancy.insemination_technique.replace(/_/g, " ")}
                      </span>
                    </div>
                  )}
                  {pregnancy.semen_volume_ml != null && (
                    <div className="bp-info-row">
                      <span className="bp-info-key">Volume</span>
                      <span className="bp-info-value bp-mono">{pregnancy.semen_volume_ml} mL</span>
                    </div>
                  )}
                  {pregnancy.motility_percent != null && (
                    <div className="bp-info-row">
                      <span className="bp-info-key">Motility</span>
                      <span className="bp-info-value bp-mono">{pregnancy.motility_percent}%</span>
                    </div>
                  )}
                  {pregnancy.semen_dose && (
                    <div className="bp-info-row">
                      <span className="bp-info-key">Dose</span>
                      <span className="bp-info-value">{pregnancy.semen_dose}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="bp-side-section">
            <div className="bp-side-label">Timeline</div>
            <div className="bp-info-list">
              <div className="bp-info-row">
                <span className="bp-info-key">Transfer</span>
                <span className="bp-info-value bp-mono">
                  {fmtIso(pregnancy.transfer_date)}
                </span>
              </div>
              {pregnancy.transfer_veterinarian_name && (
                <div className="bp-info-row">
                  <span className="bp-info-key">Vet</span>
                  <span className="bp-info-value">
                    {pregnancy.transfer_veterinarian_name}
                  </span>
                </div>
              )}
              <div className="bp-info-row">
                <span className="bp-info-key">Gestation</span>
                <span className="bp-info-value bp-mono">
                  {daysPregnant} days
                </span>
              </div>
              <div className="bp-info-row">
                <span className="bp-info-key">Expected Foal</span>
                <span className="bp-info-value bp-mono">
                  {fmtIso(pregnancy.expected_foaling_date)}
                </span>
              </div>
              {daysToFoal != null && isActive && (
                <div className="bp-info-row">
                  <span className="bp-info-key">ETA</span>
                  <span
                    className="bp-info-value bp-mono"
                    style={{
                      color:
                        daysToFoal <= 14
                          ? "var(--bp-status-lost)"
                          : daysToFoal <= 30
                            ? "var(--bp-status-transferred)"
                            : undefined,
                    }}
                  >
                    {daysToFoal < 0 ? `${-daysToFoal}d late` : `${daysToFoal}d`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {error && !checkModal && !showFoalingModal && (
            <div className="bp-modal-error" style={{ margin: 0 }}>
              {error}
            </div>
          )}
        </aside>
      </div>

      {/* ============== CHECK MODAL ============== */}
      {checkModal && (
        <div
          className="bp-modal-overlay"
          onClick={() => !saving && setCheckModal(null)}
        >
          <div
            className="bp-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bp-modal-header">
              <div className="bp-modal-title">
                {PREGNANCY_CHECK_LABELS[checkModal]}
              </div>
              <button
                type="button"
                className="bp-modal-close"
                aria-label="Close"
                onClick={() => !saving && setCheckModal(null)}
              >
                ×
              </button>
            </div>

            {error && <div className="bp-modal-error">{error}</div>}

            <form onSubmit={handleCheckSubmit}>
              <div className="bp-modal-body">
                <input type="hidden" name="check_field" value={checkModal} />
                <div className="bp-field">
                  <label className="bp-field-label">Result</label>
                  <select
                    name="check_result"
                    className="bp-select"
                    defaultValue="confirmed"
                  >
                    <option value="confirmed">Confirmed Pregnant</option>
                    <option value="not_pregnant">Not Pregnant</option>
                  </select>
                </div>
                <div className="bp-field">
                  <label className="bp-field-label">Date</label>
                  <input
                    type="date"
                    name="check_date"
                    className="bp-input"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </div>
              </div>
              <div className="bp-modal-actions">
                <button
                  type="button"
                  className="bp-btn"
                  onClick={() => setCheckModal(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bp-btn bp-primary"
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Log Check"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============== FOALING MODAL ============== */}
      {showFoalingModal && (
        <div
          className="bp-modal-overlay"
          onClick={() => !saving && setShowFoalingModal(false)}
        >
          <div
            className="bp-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bp-modal-header">
              <div>
                <div className="bp-modal-title">Record Foaling</div>
                <div
                  style={{
                    fontFamily: "var(--bp-font-mono)",
                    fontSize: 9,
                    color: "var(--bp-ink-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginTop: 4,
                  }}
                >
                  SURROGATE · {surrogateName}
                </div>
              </div>
              <button
                type="button"
                className="bp-modal-close"
                aria-label="Close"
                onClick={() => !saving && setShowFoalingModal(false)}
              >
                ×
              </button>
            </div>

            {error && <div className="bp-modal-error">{error}</div>}

            <form onSubmit={handleFoalingSubmit}>
              <div className="bp-modal-body">
                <div className="bp-field">
                  <label className="bp-field-label">Foal Date *</label>
                  <input
                    type="date"
                    name="foal_date"
                    className="bp-input"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </div>
                <div className="bp-field-row">
                  <div className="bp-field">
                    <label className="bp-field-label">Sex</label>
                    <select
                      name="foal_sex"
                      className="bp-select"
                      defaultValue="colt"
                    >
                      <option value="colt">Colt</option>
                      <option value="filly">Filly</option>
                    </select>
                  </div>
                  <div className="bp-field">
                    <label className="bp-field-label">Color</label>
                    <input
                      type="text"
                      name="foal_color"
                      className="bp-input"
                      placeholder="Bay, Sorrel…"
                    />
                  </div>
                  <div className="bp-field">
                    <label className="bp-field-label">Type</label>
                    <select
                      name="foaling_type"
                      className="bp-select"
                      defaultValue="normal"
                    >
                      {FOALING_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {FOALING_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="bp-field">
                  <label className="bp-field-label">Foal Name</label>
                  <input
                    type="text"
                    name="foal_name"
                    className="bp-input"
                    placeholder="Optional"
                  />
                </div>
                <div className="bp-field">
                  <label className="bp-field-label">Veterinarian</label>
                  <input
                    type="text"
                    name="veterinarian_name"
                    className="bp-input"
                    placeholder="Dr. Smith"
                  />
                </div>
                <div className="bp-field">
                  <label className="bp-field-label">Complications</label>
                  <textarea
                    name="complications"
                    rows={2}
                    className="bp-textarea"
                    placeholder="Optional"
                  />
                </div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    color: "var(--bp-ink-secondary)",
                  }}
                >
                  <input type="hidden" name="foal_alive" value="true" />
                  <input
                    type="checkbox"
                    name="create_horse_profile"
                    value="true"
                    defaultChecked
                  />
                  Create horse record for the foal
                </label>
              </div>
              <div className="bp-modal-actions">
                <button
                  type="button"
                  className="bp-btn"
                  onClick={() => setShowFoalingModal(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bp-btn bp-primary"
                  disabled={saving}
                >
                  {saving ? "Recording…" : "Record Foaling"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============== MARK LOST MODAL ============== */}
      {showLostModal && (
        <div
          className="bp-modal-overlay"
          onClick={() => !saving && setShowLostModal(false)}
        >
          <div
            className="bp-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bp-modal-header">
              <div className="bp-modal-title">Mark Pregnancy Lost</div>
              <button
                type="button"
                className="bp-modal-close"
                aria-label="Close"
                onClick={() => !saving && setShowLostModal(false)}
              >
                ×
              </button>
            </div>

            {error && <div className="bp-modal-error">{error}</div>}

            <form onSubmit={handleMarkLostSubmit}>
              <div className="bp-modal-body">
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--bp-ink-secondary)",
                    marginBottom: 12,
                  }}
                >
                  Records this pregnancy as lost.
                  {pregnancy.donor_horse_id ? (
                    <> The donor mare&apos;s lifetime loss count will be incremented.</>
                  ) : null}
                  {pregnancy.embryo_id ? (
                    <> The embryo will be marked lost.</>
                  ) : null}
                  {pregnancy.surrogate_horse_id ? (
                    <> The surrogate&apos;s status will return to open.</>
                  ) : null}
                </p>

                <label className="bp-field">
                  <span className="bp-field-label">When was the loss</span>
                  <select name="loss_kind" defaultValue="lost_late" className="bp-input">
                    <option value="lost_early">Early loss (≤90 days)</option>
                    <option value="lost_late">Late loss (after 90 days)</option>
                    <option value="aborted">Aborted</option>
                  </select>
                </label>

                <label className="bp-field">
                  <span className="bp-field-label">Date of loss</span>
                  <input
                    type="date"
                    name="loss_date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className="bp-input"
                  />
                </label>

                <label className="bp-field">
                  <span className="bp-field-label">Reason (optional)</span>
                  <textarea
                    name="loss_reason"
                    rows={3}
                    placeholder="Twins reduced, placentitis, dystocia, unknown, etc."
                    className="bp-input"
                  />
                </label>
              </div>
              <div className="bp-modal-actions">
                <button
                  type="button"
                  className="bp-btn"
                  onClick={() => setShowLostModal(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bp-btn bp-primary"
                  disabled={saving}
                  style={{ background: "#b8421f", borderColor: "#b8421f" }}
                >
                  {saving ? "Saving…" : "Mark Lost"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </BreedersProChrome>
  );
}
