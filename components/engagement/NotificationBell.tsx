"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Notification bell — slotted into TopNav next to the user avatar.
 *
 * On mount: fetches the user's notification feed + unread count from
 * `/api/engagement/notifications`. Renders a badge over the bell when
 * `unread > 0`.
 *
 * On click: toggles a popover panel. Tapping a notification marks it
 * read (POSTs to `/notifications/read`) and navigates to its `link`.
 * "Mark all read" zeroes the badge in one shot.
 *
 * Polling: refetches every 60 seconds while mounted, plus an immediate
 * refetch when the panel is opened. We're not using realtime in
 * Phase 1 — 60s is plenty given how rarely notifications arrive in
 * normal use.
 */

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  icon: string | null;
  link: string | null;
  related_barn_id: string | null;
  related_horse_id: string | null;
  group_count: number;
  is_read: boolean;
  created_at: string;
  updated_at: string;
}

const POLL_MS = 60_000;

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const fetchFeed = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/engagement/notifications?limit=20", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        notifications: NotificationRow[];
        unread: number;
      };
      setRows(json.notifications ?? []);
      setUnread(json.unread ?? 0);
    } catch {
      /* network blip — try again next poll */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFeed();
    const t = setInterval(() => void fetchFeed(), POLL_MS);
    return () => clearInterval(t);
  }, [fetchFeed]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [open]);

  async function markRead(id: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, is_read: true } : r)),
    );
    setUnread((u) => Math.max(0, u - 1));
    try {
      await fetch("/api/engagement/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch {
      /* server will reconcile on next fetch */
    }
  }

  async function markAllRead() {
    setRows((prev) => prev.map((r) => ({ ...r, is_read: true })));
    setUnread(0);
    try {
      await fetch("/api/engagement/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      /* server will reconcile on next fetch */
    }
  }

  function onItemClick(row: NotificationRow) {
    if (!row.is_read) void markRead(row.id);
    setOpen(false);
    if (row.link) router.push(row.link);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void fetchFeed();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-brass-gold/20 bg-barn-panel text-parchment hover:border-brass-gold/40"
        aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10 21a2 2 0 004 0" />
        </svg>
        {unread > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none"
            style={{
              background: "#b32d2e",
              color: "#f5efe4",
              boxShadow: "0 0 0 2px #1c1a14",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-1rem))] max-w-sm overflow-hidden rounded-2xl border bg-parchment text-barn-dark shadow-2xl"
          style={{ borderColor: "rgba(201,168,76,0.35)" }}
        >
          <div
            className="flex items-center justify-between border-b px-4 py-3"
            style={{ borderColor: "rgba(42,64,49,0.1)" }}
          >
            <h3 className="font-serif text-base font-semibold">Notifications</h3>
            <button
              type="button"
              onClick={markAllRead}
              disabled={unread === 0}
              className="text-xs font-medium text-barn-dark/65 hover:text-brass-gold disabled:opacity-40"
            >
              Mark all read
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading && rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-barn-dark/55">
                Loading…
              </div>
            ) : rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-barn-dark/55">
                You&apos;re all caught up 🐴
              </div>
            ) : (
              <ul role="list">
                {rows.map((r) => (
                  <li key={r.id}>
                    {r.link ? (
                      <Link
                        href={r.link}
                        onClick={(e) => {
                          e.preventDefault();
                          onItemClick(r);
                        }}
                        className="block border-b px-4 py-3 hover:bg-white/40"
                        style={{ borderColor: "rgba(42,64,49,0.06)" }}
                      >
                        <NotificationRowContent row={r} />
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onItemClick(r)}
                        className="block w-full border-b px-4 py-3 text-left hover:bg-white/40"
                        style={{ borderColor: "rgba(42,64,49,0.06)" }}
                      >
                        <NotificationRowContent row={r} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRowContent({ row }: { row: NotificationRow }) {
  return (
    <div className="flex gap-3">
      <div
        className="mt-0.5 w-1 shrink-0 rounded-full"
        style={{
          background: row.is_read ? "transparent" : "#c9a84c",
        }}
        aria-hidden="true"
      />
      <div className="flex h-7 w-7 shrink-0 items-center justify-center text-base">
        {row.icon ?? "•"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={`truncate text-sm ${
              row.is_read ? "font-normal text-barn-dark/85" : "font-semibold text-barn-dark"
            }`}
          >
            {row.title}
          </p>
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-barn-dark/45">
            {formatRelative(row.created_at)}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-barn-dark/65">
          {row.body}
        </p>
      </div>
    </div>
  );
}
