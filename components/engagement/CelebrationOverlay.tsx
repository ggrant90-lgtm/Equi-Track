"use client";

import { useEffect, useState } from "react";
import type { QueuedCelebration } from "./CelebrationProvider";

/**
 * Celebration overlay — the centered card the user sees when a
 * milestone fires. Two tiers:
 *
 *   warm  — gentle scale-up + parchment-glow edge. Auto-dismiss 8s.
 *   bold  — warm card + a slow radiating brass-gold pulse behind it.
 *           Auto-dismiss 12s.
 *
 * No animation library — pure CSS keyframes defined inline so the
 * overlay is self-contained and can drop into any page. Codebase
 * already has zero animation deps; adding framer-motion just for
 * one component would be wasted bytes.
 *
 * Mobile-first: card is max-width 480 (warm) / 560 (bold) and is
 * vertically centered with safe-area padding. Tap outside or hit
 * Escape to dismiss.
 */
export function CelebrationOverlay({
  celebration,
  onDismiss,
}: {
  celebration: QueuedCelebration;
  onDismiss: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const dismissMs = celebration.tier === "bold" ? 12000 : 8000;

  function close() {
    if (closing) return;
    setClosing(true);
    // Let the fade-out finish before unmounting.
    setTimeout(onDismiss, 220);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    const t = setTimeout(close, dismissMs);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isBold = celebration.tier === "bold";

  return (
    <div
      role="presentation"
      onClick={close}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 px-4 py-6"
      style={{ animation: `${closing ? "celebration-fade-out" : "celebration-fade-in"} 220ms ease-out forwards` }}
    >
      {isBold && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          {/* Radiating pulse rings — purely decorative for bold tier */}
          <div
            className="absolute h-[28rem] w-[28rem] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(201,168,76,0.22) 0%, rgba(201,168,76,0) 70%)",
              animation: "celebration-pulse 3.4s ease-in-out infinite",
            }}
          />
          <div
            className="absolute h-[20rem] w-[20rem] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(201,168,76,0.35) 0%, rgba(201,168,76,0) 70%)",
              animation: "celebration-pulse 3.4s ease-in-out infinite 1.2s",
            }}
          />
        </div>
      )}

      <div
        role="dialog"
        aria-modal
        aria-labelledby="celebration-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full rounded-3xl border bg-parchment p-6 text-barn-dark shadow-2xl sm:p-8"
        style={{
          maxWidth: isBold ? 560 : 480,
          borderColor: "rgba(201,168,76,0.45)",
          boxShadow:
            "0 30px 80px -20px rgba(28,26,20,0.5), 0 0 0 1px rgba(201,168,76,0.25), 0 0 40px rgba(201,168,76,0.2)",
          animation: `${closing ? "celebration-out" : isBold ? "celebration-in-bold" : "celebration-in"} 380ms cubic-bezier(0.2,0.7,0.2,1) forwards`,
        }}
      >
        {/* Decorative double-line border accent at the top */}
        <div
          aria-hidden="true"
          className="absolute left-6 right-6 top-3 h-[1px]"
          style={{ background: "rgba(201,168,76,0.5)" }}
        />
        <div
          aria-hidden="true"
          className="absolute left-6 right-6 top-4 h-[1px]"
          style={{ background: "rgba(201,168,76,0.25)" }}
        />

        <div className="flex flex-col items-center text-center">
          {celebration.icon && (
            <div
              className="mb-3 select-none"
              style={{
                fontSize: isBold ? 56 : 44,
                filter: "drop-shadow(0 2px 6px rgba(201,168,76,0.4))",
              }}
            >
              {celebration.icon}
            </div>
          )}
          <h2
            id="celebration-title"
            className="font-serif font-semibold text-barn-dark"
            style={{
              fontSize: isBold ? 30 : 24,
              lineHeight: 1.15,
              letterSpacing: "-0.01em",
            }}
          >
            {celebration.title}
          </h2>
          <p
            className="mt-3 text-barn-dark/75"
            style={{ fontSize: isBold ? 16 : 15, lineHeight: 1.5 }}
          >
            {celebration.message}
          </p>

          <div className="mt-6 flex w-full items-center justify-center gap-3">
            {celebration.shareEnabled ? (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Phase 2: open the share modal. Phase 1: ack only.
                    close();
                  }}
                  className="rounded-xl border-2 px-4 py-2 text-sm font-medium transition hover:brightness-110"
                  style={{
                    background: "#c9a84c",
                    borderColor: "#c9a84c",
                    color: "#1c1a14",
                  }}
                >
                  Share
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    close();
                  }}
                  className="rounded-xl border px-4 py-2 text-sm font-medium text-barn-dark/75 hover:bg-white/40"
                  style={{ borderColor: "rgba(42,64,49,0.2)" }}
                >
                  Close
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  close();
                }}
                className="rounded-xl border-2 px-5 py-2 text-sm font-medium transition hover:brightness-110"
                style={{
                  background: "#2a4031",
                  borderColor: "#2a4031",
                  color: "#f5efe4",
                }}
              >
                Nice
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes celebration-fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes celebration-fade-out {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
          }
        }
        @keyframes celebration-in {
          from {
            opacity: 0;
            transform: scale(0.94) translateY(8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes celebration-in-bold {
          0% {
            opacity: 0;
            transform: scale(0.9) translateY(12px) rotate(-1deg);
          }
          60% {
            transform: scale(1.02) translateY(-2px) rotate(0.5deg);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0) rotate(0);
          }
        }
        @keyframes celebration-out {
          from {
            opacity: 1;
            transform: scale(1);
          }
          to {
            opacity: 0;
            transform: scale(0.96);
          }
        }
        @keyframes celebration-pulse {
          0%,
          100% {
            opacity: 0.25;
            transform: scale(0.85);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.15);
          }
        }
      `}</style>
    </div>
  );
}
