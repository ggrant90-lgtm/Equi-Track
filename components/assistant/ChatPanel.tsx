"use client";

import { useEffect } from "react";
import { useChat } from "./ChatProvider";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { BarnPilotIcon } from "./BarnPilotIcon";
import { ASSISTANT_NAME } from "@/lib/assistant/config";

/**
 * Slide-over chat panel. Desktop: 400px panel anchored to the right with a
 * dimmed backdrop. Mobile: full-screen sheet that slides up from the
 * bottom. Custom (no Radix/headless-ui) to match the rest of BarnBook's
 * UI conventions.
 */
export function ChatPanel() {
  const { open, setOpen, clear } = useChat();

  // Lock body scroll while open on mobile (matches MobileSidebarDrawer's
  // behavior in ProtectedChrome).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop (desktop fades, mobile is fully covered by the panel) */}
      <div
        className="fixed inset-0 z-40 bg-black/40 md:bg-black/30"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-label={`${ASSISTANT_NAME} chat`}
        className="fixed inset-x-0 bottom-0 top-0 z-50 flex flex-col bg-parchment shadow-2xl md:left-auto md:right-0 md:w-[420px] md:border-l md:border-barn-dark/10"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <Header onClose={() => setOpen(false)} onClear={clear} />
        <MessageList />
        <ChatInput />
      </div>
    </>
  );
}

function Header({
  onClose,
  onClear,
}: {
  onClose: () => void;
  onClear: () => void;
}) {
  const { messages } = useChat();
  return (
    <div
      className="flex shrink-0 items-center justify-between border-b border-barn-dark/10 bg-white px-3"
      style={{
        paddingTop:
          "calc(max(env(safe-area-inset-top), 0px) + 0.5rem)",
        paddingBottom: "0.5rem",
      }}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brass-gold text-barn-dark">
          <BarnPilotIcon size={18} strokeWidth={1.8} />
        </div>
        <div className="font-serif text-base font-semibold text-barn-dark">
          {ASSISTANT_NAME}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {messages.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-md px-2 py-1 text-xs text-barn-dark/60 hover:bg-barn-dark/5 hover:text-barn-dark"
            aria-label="Clear conversation"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md text-barn-dark/60 hover:bg-barn-dark/5 hover:text-barn-dark"
          aria-label="Close"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
