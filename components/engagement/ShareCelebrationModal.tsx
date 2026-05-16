"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Share modal for celebrations.
 *
 * Opens from the CelebrationOverlay's "Share" button. Generates a
 * branded card via /api/share-card (next/og), shows a live preview,
 * and offers three actions:
 *
 *   - Share — Web Share API on mobile (opens native share sheet with
 *     the PNG attached + caption). Falls back to download on desktop.
 *   - Download — saves the PNG to the user's device.
 *   - Copy link — copies the share-card URL (good for direct paste
 *     into social).
 *
 * Privacy: an "Include barn name" checkbox controls whether the card
 * carries the barn's name. Default checked, since most users want
 * the recognition. Never includes financial amounts — the share
 * message only references the accomplishment.
 */
export interface ShareTarget {
  /** The plain-text caption that goes with the image. */
  message: string;
  /** Emoji rendered as the hero icon. */
  icon: string;
  /** Optional barn name baked onto the card (toggleable in UI). */
  barnName?: string | null;
  /** Marks user_celebrations.shared after a successful share. */
  celebrationKey?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  target: ShareTarget;
}

export function ShareCelebrationModal({ open, onClose, target }: Props) {
  const [includeBarn, setIncludeBarn] = useState(true);
  const [copied, setCopied] = useState(false);
  const [shareSupported, setShareSupported] = useState(false);

  // Probe Web Share API support once on mount. The "files" feature is
  // a separate test; we feature-detect it before attempting.
  useEffect(() => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      setShareSupported(true);
    }
  }, []);

  const cardUrl = useCallback(() => {
    const params = new URLSearchParams({
      text: target.message,
      icon: target.icon,
    });
    if (includeBarn && target.barnName) {
      params.set("barn", target.barnName);
    }
    return `/api/share-card?${params.toString()}`;
  }, [target.message, target.icon, target.barnName, includeBarn]);

  async function markShared() {
    if (!target.celebrationKey) return;
    try {
      await fetch("/api/engagement/celebrations/mark-shared", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: target.celebrationKey }),
      });
    } catch {
      /* best-effort — the celebration row will just have shared=false */
    }
  }

  async function onShare() {
    try {
      const res = await fetch(cardUrl());
      if (!res.ok) throw new Error("Failed to fetch share card");
      const blob = await res.blob();
      const file = new File([blob], "barnbook-share.png", {
        type: "image/png",
      });
      const data: ShareData = {
        text: target.message,
        files: [file],
      };
      if (
        "canShare" in navigator &&
        typeof navigator.canShare === "function" &&
        navigator.canShare(data)
      ) {
        await navigator.share(data);
        await markShared();
        onClose();
        return;
      }
      // Fallback to text-only share
      await navigator.share({ text: target.message });
      await markShared();
      onClose();
    } catch (err) {
      // User cancelled or share failed — silent.
      console.warn("[share] failed", (err as Error).message);
    }
  }

  async function onDownload() {
    try {
      const res = await fetch(cardUrl());
      if (!res.ok) throw new Error("Failed to fetch share card");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "barnbook-share.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await markShared();
    } catch {
      /* swallow */
    }
  }

  async function onCopyLink() {
    try {
      const absolute =
        typeof window !== "undefined"
          ? new URL(cardUrl(), window.location.origin).toString()
          : cardUrl();
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked in some contexts */
    }
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/65 px-4 py-6"
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="share-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border bg-white shadow-2xl"
        style={{ borderColor: "rgba(201,168,76,0.4)" }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-3"
          style={{ borderColor: "rgba(42,64,49,0.1)" }}
        >
          <h3
            id="share-title"
            className="font-serif text-lg font-semibold text-barn-dark"
          >
            Share this moment
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-barn-dark/55 hover:text-barn-dark"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="bg-parchment/30 p-4">
          {/* Live preview — pulls the actual share-card image. */}
          <div
            className="overflow-hidden rounded-xl border shadow-inner"
            style={{ borderColor: "rgba(201,168,76,0.35)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cardUrl()}
              alt="Preview of your share card"
              width={1080}
              height={1080}
              className="block w-full"
              style={{ aspectRatio: "1 / 1", background: "#f5efe4" }}
            />
          </div>

          {target.barnName && (
            <label className="mt-3 flex items-center gap-2 text-sm text-barn-dark/75">
              <input
                type="checkbox"
                checked={includeBarn}
                onChange={(e) => setIncludeBarn(e.target.checked)}
              />
              Include barn name &mdash; <em>{target.barnName}</em>
            </label>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 px-5 pb-5 pt-3 sm:grid-cols-3">
          {shareSupported ? (
            <button
              type="button"
              onClick={onShare}
              className="rounded-xl border-2 px-4 py-2 text-sm font-medium hover:brightness-110"
              style={{
                background: BRASS,
                borderColor: BRASS,
                color: INK,
              }}
            >
              Share
            </button>
          ) : (
            <span /> /* takes a grid slot on desktop */
          )}
          <button
            type="button"
            onClick={onDownload}
            className="rounded-xl border px-4 py-2 text-sm font-medium text-barn-dark hover:bg-parchment"
            style={{ borderColor: "rgba(42,64,49,0.2)" }}
          >
            Download
          </button>
          <button
            type="button"
            onClick={onCopyLink}
            className="rounded-xl border px-4 py-2 text-sm font-medium text-barn-dark hover:bg-parchment"
            style={{ borderColor: "rgba(42,64,49,0.2)" }}
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      </div>
    </div>
  );
}

const BRASS = "#c9a84c";
const INK = "#1c1a14";
