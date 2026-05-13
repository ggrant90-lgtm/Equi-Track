"use client";

import { ChatProvider } from "./ChatProvider";
import { FloatingChatButton } from "./FloatingChatButton";
import { ChatPanel } from "./ChatPanel";

/**
 * Single mount point for everything BarnPilot. Drop one of these inside
 * ProtectedChrome and you get the floating button, the slide-over panel,
 * and the conversation state provider.
 */
export function BarnPilot() {
  return (
    <ChatProvider>
      <FloatingChatButton />
      <ChatPanel />
    </ChatProvider>
  );
}
