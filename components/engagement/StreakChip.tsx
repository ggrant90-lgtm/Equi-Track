"use client";

import { useState } from "react";

/**
 * Streak chip — a small flame + day count, slotted near the
 * dashboard greeting.
 *
 * Three visual states:
 *   - current > 0   → bright flame, "🔥 12 days"
 *   - current === 0 but longest >= 1 → soft chip, "Start a streak today"
 *   - current === 0 and longest === 0 → render nothing (clean for fresh accounts)
 *
 * Tap opens a small detail popover with the longest streak. No guilt
 * messaging when a streak breaks — just encouragement.
 */
export function StreakChip({
  current,
  longest,
}: {
  current: number;
  longest: number;
}) {
  const [open, setOpen] = useState(false);

  if (current === 0 && longest === 0) return null;

  const active = current > 0;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition hover:brightness-105"
        style={{
          background: active ? "rgba(201,168,76,0.18)" : "rgba(42,64,49,0.06)",
          borderColor: active ? "#c9a84c" : "rgba(42,64,49,0.15)",
          color: active ? "#7a5c13" : "#2a4031",
        }}
        aria-label={
          active
            ? `${current}-day logging streak`
            : "Streak broken. Tap to see your record."
        }
      >
        <span style={{ filter: active ? "none" : "grayscale(60%)" }}>🔥</span>
        {active ? (
          <span>
            {current} {current === 1 ? "day" : "days"}
          </span>
        ) : (
          <span>Start a streak today</span>
        )}
      </button>

      {open && (
        <div
          className="absolute left-1/2 top-full z-50 mt-2 w-56 -translate-x-1/2 rounded-xl border bg-white p-3 text-xs text-barn-dark shadow-xl"
          style={{ borderColor: "rgba(201,168,76,0.4)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {active ? (
            <>
              <div className="font-medium">
                {current} consecutive {current === 1 ? "day" : "days"} of records.
              </div>
              <div className="mt-1 text-barn-dark/60">
                {longest > current
                  ? `Your record is ${longest} days. Closing in.`
                  : "This is a new personal best. Keep it going."}
              </div>
            </>
          ) : (
            <>
              <div className="font-medium">
                Your record streak is {longest} {longest === 1 ? "day" : "days"}.
              </div>
              <div className="mt-1 text-barn-dark/60">
                Log anything today to start a new one — no guilt, just a clean
                slate.
              </div>
            </>
          )}
        </div>
      )}
    </span>
  );
}
