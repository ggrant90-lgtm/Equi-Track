"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Contextual nudge toast.
 *
 * Mounted once at the protected-chrome level. On every pathname
 * change, fetches `/api/engagement/nudges?path=` and renders the
 * highest-priority match. Honors a master "don't show tips" toggle
 * (server side via profiles.nudges_disabled) so dismissal sticks.
 *
 * Never shows simultaneously with a celebration overlay — the
 * overlay sits on z-[200], this toast on z-50. The toast also waits
 * a brief delay after page load so it doesn't race with the
 * celebration cookie drain.
 *
 * Tone: parchment chip with a small icon, action link, X to dismiss.
 * No animations beyond a gentle slide-up + fade.
 */

interface NudgeResult {
  key: string;
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
}

const PAGE_DELAY_MS = 1200; // wait a beat so celebrations land first

export function NudgeToast() {
  const pathname = usePathname();
  const [nudge, setNudge] = useState<NudgeResult | null>(null);
  const [closing, setClosing] = useState(false);
  const seenInSessionRef = useRef<Set<string>>(new Set());

  const dismiss = useCallback(async (key: string) => {
    setClosing(true);
    setTimeout(() => {
      setNudge(null);
      setClosing(false);
    }, 220);
    seenInSessionRef.current.add(key);
    try {
      await fetch("/api/engagement/nudges/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
    } catch {
      /* best-effort */
    }
  }, []);

  const disableAll = useCallback(async () => {
    setClosing(true);
    setTimeout(() => {
      setNudge(null);
      setClosing(false);
    }, 220);
    try {
      await fetch("/api/engagement/nudges/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    // Skip admin routes and auth routes — nudges are for app users
    // doing horse-management work, not the platform-admin UX.
    if (!pathname) return;
    if (pathname.startsWith("/admin")) return;
    if (pathname.startsWith("/auth")) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/engagement/nudges?path=${encodeURIComponent(pathname)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const json = (await res.json()) as { nudge: NudgeResult | null };
        if (cancelled) return;
        if (json.nudge && !seenInSessionRef.current.has(json.nudge.key)) {
          setNudge(json.nudge);
        }
      } catch {
        /* network blip */
      }
    }, PAGE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pathname]);

  if (!nudge) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 sm:bottom-6"
      aria-live="polite"
    >
      <div
        className="pointer-events-auto flex w-full max-w-md gap-3 rounded-2xl border bg-parchment p-3 shadow-xl"
        style={{
          borderColor: "rgba(201,168,76,0.5)",
          borderLeftWidth: 4,
          animation: closing
            ? "nudge-slide-down 220ms ease-in forwards"
            : "nudge-slide-up 280ms ease-out forwards",
        }}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center text-base">
          💡
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-semibold text-barn-dark">
              {nudge.title}
            </p>
          </div>
          <p className="mt-0.5 text-xs text-barn-dark/65">{nudge.body}</p>
          <div className="mt-1.5 flex items-center gap-3">
            <Link
              href={nudge.actionHref}
              onClick={() => {
                // Treat tapping the action as a successful "saw it" —
                // record it so we don't show it again next page load.
                void dismiss(nudge.key);
              }}
              className="text-xs font-medium text-brass-gold hover:underline"
            >
              {nudge.actionLabel} →
            </Link>
            <button
              type="button"
              onClick={disableAll}
              className="text-[10px] text-barn-dark/50 hover:text-barn-dark"
            >
              Don&apos;t show tips
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void dismiss(nudge.key)}
          aria-label="Dismiss"
          className="shrink-0 rounded p-1 text-barn-dark/55 hover:text-barn-dark"
        >
          ✕
        </button>
      </div>
      <style jsx>{`
        @keyframes nudge-slide-up {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes nudge-slide-down {
          from {
            opacity: 1;
            transform: translateY(0);
          }
          to {
            opacity: 0;
            transform: translateY(8px);
          }
        }
      `}</style>
    </div>
  );
}
