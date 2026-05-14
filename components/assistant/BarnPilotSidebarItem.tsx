"use client";

import { useChat } from "./ChatProvider";
import { BarnPilotIcon } from "./BarnPilotIcon";
import { navLinkClass } from "@/components/nav-config";

/**
 * Sidebar nav row for the BarnPilot assistant. Renders as a button (not a
 * Link) because it opens the chat panel rather than navigating to a route.
 * Styled with `navLinkClass(false)` so it visually matches the other nav
 * items — never "active" since it's not a route.
 *
 * Accepts `onNavigate` so the mobile drawer can close itself when the user
 * taps the row, mirroring the other nav items.
 */
export function BarnPilotSidebarItem({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const { setOpen } = useChat();
  return (
    <button
      type="button"
      onClick={() => {
        setOpen(true);
        onNavigate?.();
      }}
      className={`${navLinkClass(false)} w-full text-left`}
      aria-label="Open BarnPilot AI assistant"
    >
      <BarnPilotIcon className="h-5 w-5" strokeWidth={2} />
      <span className="flex-1 truncate">BarnPilot AI</span>
    </button>
  );
}
