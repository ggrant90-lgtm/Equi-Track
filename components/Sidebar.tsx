"use client";

import { BarnSwitcher } from "@/components/BarnSwitcher";
import { isNavActive, navLinkClass, supportNav, type NavItem } from "@/components/nav-config";
import type { BarnSummary } from "@/components/protected/ProtectedChrome";
import { BarnPilotSidebarItem } from "@/components/assistant/BarnPilotSidebarItem";
import Link from "next/link";
import { Fragment } from "react";

export function SidebarBrand({
  barnName,
  hasBarn,
  onNavigate,
}: {
  barnName: string | null;
  hasBarn: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="border-b border-brass-gold/10 px-4 py-5">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="font-serif text-xl font-semibold text-parchment"
      >
        BarnBook
      </Link>
      {hasBarn && barnName ? (
        <p className="mt-1 truncate text-xs text-muted-tan">{barnName}</p>
      ) : null}
    </div>
  );
}

export function SidebarNavList({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5 p-3" aria-label="Main navigation">
      {items.map((item, idx) => (
        <Fragment key={item.href}>
          {item.external ? (
            <a
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className={navLinkClass(false)}
            >
              {item.icon}
              {item.label}
            </a>
          ) : (
            <Link
              href={item.href}
              onClick={onNavigate}
              className={navLinkClass(isNavActive(pathname, item.href))}
            >
              {item.icon}
              {item.label}
            </Link>
          )}
          {/* BarnPilot lives right below Dashboard. */}
          {idx === 0 && <BarnPilotSidebarItem onNavigate={onNavigate} />}
        </Fragment>
      ))}

      {/* Support section */}
      <div className="mt-auto border-t border-brass-gold/10 pt-2">
        {supportNav.map((item) => (
          <a
            key={item.href}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className={navLinkClass(false)}
          >
            {item.icon}
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

/** Desktop fixed sidebar (md+). */
export function DesktopSidebar({
  navItems,
  pathname,
  barnName,
  hasBarn,
  allBarns,
  activeBarnId,
}: {
  navItems: NavItem[];
  pathname: string;
  barnName: string | null;
  hasBarn: boolean;
  allBarns?: BarnSummary[];
  activeBarnId?: string | null;
}) {
  return (
    <aside
      className="hidden w-56 shrink-0 flex-col border-r border-brass-gold/15 bg-barn-dark md:flex"
      aria-label="Sidebar"
    >
      <SidebarBrand barnName={barnName} hasBarn={hasBarn} />
      {allBarns && allBarns.length > 0 ? (
        <BarnSwitcher allBarns={allBarns} activeBarnId={activeBarnId} />
      ) : null}
      <SidebarNavList items={navItems} pathname={pathname} />
    </aside>
  );
}

/** Mobile slide-in drawer + backdrop. */
export function MobileSidebarDrawer({
  open,
  onClose,
  navItems,
  pathname,
  barnName,
  hasBarn,
  allBarns,
  activeBarnId,
}: {
  open: boolean;
  onClose: () => void;
  navItems: NavItem[];
  pathname: string;
  barnName: string | null;
  hasBarn: boolean;
  allBarns?: BarnSummary[];
  activeBarnId?: string | null;
}) {
  return (
    <>
      <div
        className={[
          "fixed inset-0 z-40 bg-black/60 transition-opacity md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
        aria-hidden={!open}
        onClick={onClose}
      />
      <div
        className={[
          "fixed left-0 top-0 z-50 flex h-full w-[min(18rem,100%)] flex-col border-r border-brass-gold/15 bg-barn-dark transition-transform duration-200 ease-out md:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex items-center justify-between border-b border-brass-gold/10 px-4 py-4">
          <Link
            href="/dashboard"
            className="font-serif text-xl font-semibold text-parchment"
            onClick={onClose}
          >
            BarnBook
          </Link>
          <button
            type="button"
            className="rounded-lg p-2 text-parchment hover:bg-barn-panel"
            onClick={onClose}
            aria-label="Close menu"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>
        {allBarns && allBarns.length > 0 ? (
          <BarnSwitcher allBarns={allBarns} activeBarnId={activeBarnId} onSwitch={onClose} />
        ) : hasBarn && barnName ? (
          <p className="truncate px-4 py-2 text-xs text-muted-tan">{barnName}</p>
        ) : null}
        <SidebarNavList items={navItems} pathname={pathname} onNavigate={onClose} />
      </div>
    </>
  );
}
