"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Shared session data for the Breeders Pro chrome.
 *
 * Fetched once server-side in `app/(protected)/breeders-pro/layout.tsx`
 * using the same auth helpers the rest of the app already uses, then
 * exposed to client components so each page can render its own
 * `BreedersProChrome` with its own breadcrumb without duplicating work.
 */
/** Presence flags driving progressive sidebar disclosure. Computed
 *  once in the BP layout from the user's operational barns. */
export type BreedersNavCounts = {
  hasEmbryos: boolean;
  hasStallions: boolean;
  hasSurrogates: boolean;
  hasFoalings: boolean;
};

export type BreedersProSession = {
  userName: string;
  userInitials: string;
  userRole: string;
  barnLabel: string;
  navCounts: BreedersNavCounts;
};

const Ctx = createContext<BreedersProSession | null>(null);

export function BreedersProSessionProvider({
  session,
  children,
}: {
  session: BreedersProSession;
  children: ReactNode;
}) {
  return <Ctx.Provider value={session}>{children}</Ctx.Provider>;
}

export function useBreedersProSession(): BreedersProSession {
  const v = useContext(Ctx);
  if (!v) {
    // Safe default so the component still renders during SSR boundary edge cases.
    return {
      userName: "Member",
      userInitials: "U",
      userRole: "Program Director",
      barnLabel: "",
      navCounts: {
        hasEmbryos: true,
        hasStallions: true,
        hasSurrogates: true,
        hasFoalings: true,
      },
    };
  }
  return v;
}
