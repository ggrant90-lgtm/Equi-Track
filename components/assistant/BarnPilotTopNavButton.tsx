"use client";

import { useChat } from "./ChatProvider";
import { BarnPilotIcon } from "./BarnPilotIcon";

/**
 * Inline trigger for the chat panel, sized + styled to live inside the
 * dark TopNav header. Tap target is 36×36 (Apple HIG minimum) with
 * generous padding for easier mobile use.
 */
export function BarnPilotTopNavButton() {
  const { open, setOpen } = useChat();

  return (
    <button
      type="button"
      aria-label="Open BarnPilot"
      aria-pressed={open}
      onClick={() => setOpen(!open)}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-brass-gold transition hover:bg-brass-gold/15 active:scale-95"
    >
      <BarnPilotIcon size={22} strokeWidth={1.7} />
    </button>
  );
}
