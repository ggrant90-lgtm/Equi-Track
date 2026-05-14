"use client";

import { IconChevronDown, IconMenu } from "@/components/protected/nav-icons";
import Link from "next/link";
import { useEffect, useRef } from "react";

export type TopNavProps = {
  displayName: string;
  email: string;
  avatarUrl: string | null;
  barnName: string | null;
  hasBarn: boolean;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  onOpenMobileSidebar: () => void;
  onSignOut: () => void;
};

export function TopNav({
  displayName,
  email,
  avatarUrl,
  barnName,
  hasBarn,
  menuOpen,
  setMenuOpen,
  onOpenMobileSidebar,
  onSignOut,
}: TopNavProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const initial = (displayName || email || "?").charAt(0).toUpperCase();

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [menuOpen, setMenuOpen]);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-brass-gold/15 bg-barn-dark px-3 sm:px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          className="rounded-lg p-2 text-parchment hover:bg-barn-panel md:hidden"
          aria-label="Open menu"
          onClick={onOpenMobileSidebar}
        >
          <IconMenu className="h-6 w-6" />
        </button>
        <Link href="/dashboard" className="font-serif text-lg font-semibold text-parchment md:hidden">
          BarnBook
        </Link>
        {hasBarn && barnName ? (
          <span className="hidden max-w-[40vw] truncate text-center text-sm text-muted-tan md:inline lg:absolute lg:left-1/2 lg:-translate-x-1/2">
            {barnName}
          </span>
        ) : null}
      </div>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          className="flex max-w-[14rem] items-center gap-2 rounded-xl border border-brass-gold/20 bg-barn-panel px-2 py-1.5 text-left text-sm text-parchment hover:border-brass-gold/40"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brass-gold/25 text-sm font-medium text-brass-gold">
              {initial}
            </span>
          )}
          <span className="hidden min-w-0 flex-1 truncate sm:block">{displayName}</span>
          <IconChevronDown
            className={["h-4 w-4 shrink-0 opacity-70 transition", menuOpen ? "rotate-180" : ""].join(" ")}
          />
        </button>
        {menuOpen ? (
          <div
            className="absolute right-0 top-full z-50 mt-1 min-w-[12rem] rounded-xl border border-brass-gold/20 bg-barn-panel py-1 shadow-xl"
            role="menu"
          >
            <Link
              href="/profile"
              className="block px-4 py-2.5 text-sm text-parchment hover:bg-barn-dark"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
            >
              Profile
            </Link>
            <Link
              href="/settings"
              className="block px-4 py-2.5 text-sm text-parchment hover:bg-barn-dark"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
            >
              Settings
            </Link>
            <button
              type="button"
              className="w-full px-4 py-2.5 text-left text-sm text-barn-red hover:bg-barn-dark"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onSignOut();
              }}
            >
              Sign Out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
