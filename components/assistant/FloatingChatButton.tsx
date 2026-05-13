"use client";

import { useChat } from "./ChatProvider";

/**
 * Bottom-left FAB that toggles the BarnPilot chat panel. Yields z-index
 * to the QuickLogFab (z-40) so service-barn users don't accidentally hit
 * BarnPilot when reaching for the quick-log button.
 *
 * Position mirrors QuickLogFab — safe-area-inset aware, lifted above the
 * mobile bottom nav.
 */
export function FloatingChatButton() {
  const { open, setOpen } = useChat();

  if (open) return null;

  return (
    <button
      type="button"
      aria-label="Open BarnPilot"
      onClick={() => setOpen(true)}
      style={{
        position: "fixed",
        left: "max(16px, env(safe-area-inset-left))",
        bottom:
          "calc(max(16px, env(safe-area-inset-bottom)) + 72px)",
        width: 56,
        height: 56,
        zIndex: 30,
        borderRadius: "50%",
      }}
      className="md:bottom-[max(16px,env(safe-area-inset-bottom))] flex items-center justify-center bg-brass-gold text-barn-dark shadow-lg transition hover:scale-105 hover:shadow-xl active:scale-95"
    >
      <HorseIcon />
    </button>
  );
}

function HorseIcon() {
  // Side-profile horse head; matches the new sidebar treatment.
  return (
    <svg
      viewBox="0 0 24 24"
      width={28}
      height={28}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 21c0-3 1-5 3-6.5C9.4 13.4 9 12.5 9 11c0-3 2-5 5-5 1.4 0 2.4.5 3 1l2-2 1 3-2 1c.6.9 1 2 1 3.5 0 4-3 6-7 6.5L11 21" />
      <circle cx="14" cy="9.5" r="0.5" fill="currentColor" />
    </svg>
  );
}
