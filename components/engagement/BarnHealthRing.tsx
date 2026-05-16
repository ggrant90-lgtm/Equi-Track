"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { BarnHealthSnapshot } from "@/lib/engagement/health-score";

/**
 * Circular barn health ring — slotted into the dashboard barn card.
 *
 * Visual: an SVG ring at the given percent, amber under 50%, brass
 * gold 50-80%, forest green 80+. Number in the center, descriptor
 * label below. Tappable — opens a breakdown modal showing which
 * criteria are met and which aren't, with direct links to fix
 * the unmet ones.
 *
 * If the snapshot has no criteria (cache-only read), the breakdown
 * shows a "loading breakdown" hint and the parent should refetch
 * with criteria when opened. For Phase 2 we ship the simple version
 * where the server always passes criteria.
 */
export function BarnHealthRing({
  snapshot,
  size = 96,
  showLabel = true,
}: {
  snapshot: BarnHealthSnapshot;
  size?: number;
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = Math.PI * 2 * r;
  const pct = Math.max(0, Math.min(100, snapshot.score));
  const dash = (pct / 100) * c;

  const color = colorForScore(pct);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex flex-col items-center gap-1.5 rounded-xl p-1 transition hover:bg-parchment/40"
        aria-label={`Barn health ${pct} percent. Tap for breakdown.`}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(42,64,49,0.1)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dasharray 600ms ease-out" }}
          />
          <text
            x="50%"
            y="50%"
            dy="0.35em"
            textAnchor="middle"
            className="font-serif"
            style={{
              fontSize: Math.floor(size * 0.28),
              fontWeight: 600,
              fill: "#1c1a14",
            }}
          >
            {pct}%
          </text>
        </svg>
        {showLabel && (
          <span
            className="text-xs font-medium"
            style={{ color, letterSpacing: "0.02em" }}
          >
            {snapshot.label}
          </span>
        )}
      </button>

      {open && (
        <BarnHealthBreakdown
          snapshot={snapshot}
          color={color}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function BarnHealthBreakdown({
  snapshot,
  color,
  onClose,
}: {
  snapshot: BarnHealthSnapshot;
  color: string;
  onClose: () => void;
}): ReactNode {
  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[180] flex items-center justify-center bg-black/55 px-4 py-6"
    >
      <div
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border bg-white shadow-2xl"
        style={{ borderColor: "rgba(201,168,76,0.4)" }}
      >
        <div
          className="border-b px-5 py-4"
          style={{ borderColor: "rgba(42,64,49,0.1)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-serif text-lg font-semibold text-barn-dark">
                Barn Health
              </h3>
              <p className="mt-0.5 text-xs text-barn-dark/55">
                Based on how complete your barn&apos;s setup is.
              </p>
            </div>
            <div
              className="font-mono text-2xl font-semibold"
              style={{ color }}
            >
              {snapshot.score}%
            </div>
          </div>
        </div>
        <ul className="divide-y" style={{ borderColor: "rgba(42,64,49,0.08)" }}>
          {snapshot.criteria.map((c) => (
            <li
              key={c.key}
              className="flex items-start gap-3 px-5 py-3"
            >
              <div
                aria-hidden="true"
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs"
                style={{
                  background: c.met ? "rgba(42,64,49,0.12)" : "transparent",
                  border: c.met ? "none" : "1px solid rgba(42,64,49,0.2)",
                  color: c.met ? "#2a4031" : "rgba(42,64,49,0.55)",
                }}
              >
                {c.met ? "✓" : ""}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-barn-dark">
                    {c.label}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-barn-dark/45">
                    {c.weight}%
                  </span>
                </div>
                {c.hint && (
                  <p className="mt-0.5 text-xs text-barn-dark/65">{c.hint}</p>
                )}
                {!c.met && c.fix && (
                  <Link
                    href={c.fix}
                    onClick={onClose}
                    className="mt-1 inline-block text-xs font-medium text-brass-gold hover:underline"
                  >
                    Fix this →
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div
          className="flex justify-end border-t px-5 py-3"
          style={{ borderColor: "rgba(42,64,49,0.08)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-barn-dark/15 px-4 py-1.5 text-sm font-medium text-barn-dark/75 hover:bg-parchment"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function colorForScore(score: number): string {
  if (score >= 80) return "#2a4031"; // forest
  if (score >= 50) return "#c9a84c"; // brass
  return "#b48a2a"; // amber
}
