"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CelebrationOverlay } from "./CelebrationOverlay";

/**
 * Celebration queueing system.
 *
 * Server actions that fire engagement hooks return a list of fresh
 * CelebrationFire objects. The client component that received them
 * calls `pushCelebrations(list)` and the provider displays them one
 * at a time, with a 2-second gap between, regardless of how many
 * fire at once.
 *
 * State lives at the protected-layout level so a celebration survives
 * a route change after the action (server actions often `redirect`
 * back to the horse page; the celebration shows once the new page
 * has hydrated).
 */

export interface QueuedCelebration {
  key: string;
  title: string;
  message: string;
  icon?: string;
  tier: "warm" | "bold";
  shareEnabled: boolean;
  shareMessage?: string;
  /** Optional barn name to bake onto the share card. */
  shareBarnName?: string;
}

interface CelebrationContextValue {
  push: (items: QueuedCelebration[] | QueuedCelebration) => void;
}

const CelebrationContext = createContext<CelebrationContextValue | null>(null);

export function useCelebrations(): CelebrationContextValue {
  const ctx = useContext(CelebrationContext);
  if (!ctx) return { push: () => {} };
  return ctx;
}

const QUEUE_GAP_MS = 2000;
const STORAGE_KEY = "barnbook.celebration_queue";

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<QueuedCelebration | null>(null);
  const queueRef = useRef<QueuedCelebration[]>([]);
  const gapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist the queue across server-action redirects via sessionStorage.
  // (A celebration fired in a server action may be enqueued just before
  // a redirect; without persistence, the queue would reset on navigate.)
  const flushFromStorage = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as QueuedCelebration[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        queueRef.current = [...queueRef.current, ...parsed];
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore malformed payload
    }
  }, []);

  const showNext = useCallback(() => {
    if (active) return;
    flushFromStorage();
    const next = queueRef.current.shift();
    if (next) setActive(next);
  }, [active, flushFromStorage]);

  // On mount and on navigation, drain the server cookie via the
  // engagement API. Server actions stash celebrations there before
  // redirecting; this is how they reach the client overlay.
  const drainServerQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/engagement/celebrations", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as { celebrations?: QueuedCelebration[] };
      if (json.celebrations && json.celebrations.length > 0) {
        queueRef.current = [...queueRef.current, ...json.celebrations];
        showNext();
      }
    } catch {
      /* network blip — try again next mount */
    }
  }, [showNext]);

  useEffect(() => {
    // Drain on mount so anything pushed during the action shows up
    // on the redirected page.
    showNext();
    void drainServerQueue();
    // Listen for storage events from other tabs (rare; defensive).
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) showNext();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [showNext, drainServerQueue]);

  const push = useCallback(
    (items: QueuedCelebration[] | QueuedCelebration) => {
      const list = Array.isArray(items) ? items : [items];
      if (list.length === 0) return;
      // If we're between routes (e.g., a server action just enqueued
      // and is about to redirect), park the queue in sessionStorage so
      // the post-redirect mount can resume it.
      if (typeof window === "undefined") return;
      queueRef.current = [...queueRef.current, ...list];
      try {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(queueRef.current),
        );
      } catch {
        // sessionStorage may be unavailable in privacy mode; we'll
        // still show whichever celebrations are in the in-memory queue.
      }
      showNext();
    },
    [showNext],
  );

  const dismiss = useCallback(() => {
    setActive(null);
    if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
    gapTimerRef.current = setTimeout(() => {
      // Clear from sessionStorage when nothing left to show.
      if (queueRef.current.length === 0 && typeof window !== "undefined") {
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
      showNext();
    }, QUEUE_GAP_MS);
  }, [showNext]);

  useEffect(() => {
    return () => {
      if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
    };
  }, []);

  return (
    <CelebrationContext.Provider value={{ push }}>
      {children}
      {active && <CelebrationOverlay celebration={active} onDismiss={dismiss} />}
    </CelebrationContext.Provider>
  );
}
