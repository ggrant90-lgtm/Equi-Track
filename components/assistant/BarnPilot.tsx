"use client";

import { ChatProvider } from "./ChatProvider";
import { ChatPanel } from "./ChatPanel";

/**
 * Wrap the authenticated app in <BarnPilot> to enable the assistant.
 *
 * Anything rendered inside `children` can call `useChat()` to read state
 * or open the panel (see BarnPilotTopNavButton). The ChatPanel itself is
 * mounted alongside as a sibling so it overlays the whole layout when open.
 *
 * The original bottom-left FAB is no longer mounted by default — the
 * trigger now lives in the TopNav. FloatingChatButton remains in the
 * codebase if we ever want it back.
 */
export function BarnPilot({ children }: { children: React.ReactNode }) {
  return (
    <ChatProvider>
      {children}
      <ChatPanel />
    </ChatProvider>
  );
}
