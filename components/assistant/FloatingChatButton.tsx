"use client";

import { useChat } from "./ChatProvider";
import { BarnPilotIcon } from "./BarnPilotIcon";

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
      <BarnPilotIcon size={28} strokeWidth={1.6} />
    </button>
  );
}
