"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useBreedersProSession } from "./BreedersProSession";
import { BarnPilotTopNavButton } from "@/components/assistant/BarnPilotTopNavButton";

type NavItem = {
  href: string;
  label: string;
  count?: number;
  icon: ReactNode;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

export type BreadcrumbSegment = { label: string; href?: string };

/**
 * Presentation-only chrome for Breeders Pro routes.
 *
 * Takes over the viewport via `.bp-chrome` (position: fixed inset: 0)
 * so it visually replaces the parent ProtectedChrome without modifying it.
 * Each page renders its own `<BreedersProChrome breadcrumb={[...]}>` wrapper
 * around its content. Session data (user name, initials, barn) comes from
 * `BreedersProSessionProvider` set up once in the layout.
 */
export function BreedersProChrome({
  breadcrumb,
  children,
}: {
  breadcrumb: BreadcrumbSegment[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const session = useBreedersProSession();

  // Sidebar open/closed state. Only meaningful on mobile — on desktop
  // the sidebar is always visible and this value is a no-op. Closed
  // by default so mobile users see content first.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close the sidebar whenever the pathname changes (i.e., user tapped
  // a nav link). Harmless on desktop where the sidebar is always open.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Close on Escape key — nice touch, free from the <dialog> semantics.
  useEffect(() => {
    if (!sidebarOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSidebarOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  // Workspace nav — only actually-reskinned routes are real links. Items
  // whose targets still render in BarnBook chrome are shown as disabled
  // placeholders so users aren't surprised by a visual context switch.
  // As each pass lands, move the corresponding item out of `placeholders`
  // and into `items`.
  // Progressive disclosure — items the user has data for show up,
  // empty ones stay hidden so a new program isn't staring at a wall
  // of unused capabilities. Overview, Donor Mares, and Pregnancies
  // are always visible; the rest reveal as data appears. Counts come
  // from the BreedersProSession context (computed server-side in
  // the BP layout).
  const navCounts = session.navCounts;
  const workspaceItems: NavItem[] = [
    { href: "/breeders-pro/overview", label: "Overview", icon: <IconGrid /> },
  ];
  if (navCounts.hasEmbryos) {
    workspaceItems.push({
      href: "/breeders-pro/embryos",
      label: "Embryo Bank",
      icon: <IconEmbryo />,
    });
  }
  workspaceItems.push({
    href: "/breeders-pro/donors",
    label: "Donor Mares",
    icon: <IconDonor />,
  });
  if (navCounts.hasStallions) {
    workspaceItems.push({
      href: "/breeders-pro/stallions",
      label: "Stallions",
      icon: <IconDiamond />,
    });
  }
  if (navCounts.hasSurrogates) {
    workspaceItems.push({
      href: "/breeders-pro/surrogates",
      label: "Surrogates",
      icon: <IconSurrogate />,
    });
  }
  workspaceItems.push({
    href: "/breeders-pro/pregnancies",
    label: "Pregnancies",
    icon: <IconPregnant />,
  });
  if (navCounts.hasFoalings) {
    workspaceItems.push({
      href: "/breeders-pro/foalings",
      label: "Foaling Records",
      icon: <IconFoal />,
    });
  }

  const workspace: NavGroup = {
    label: "Workspace",
    items: workspaceItems,
  };

  const workspacePlaceholders: NavItem[] = [];

  const analysisPlaceholders: NavItem[] = [
    { href: "#", label: "Performance", icon: <IconChart /> },
    { href: "#", label: "Cost Analysis", icon: <IconClock /> },
    { href: "#", label: "Reports", icon: <IconDoc /> },
  ];

  const isActive = (href: string) => {
    if (href === "#") return false;
    const [path] = href.split("?");
    return pathname.startsWith(path);
  };

  return (
    <div className="bp-scope bp-chrome">
      {/* Mobile-only backdrop behind the open sidebar. Clicking it closes. */}
      <div
        className={`bp-sidebar-backdrop${sidebarOpen ? " bp-sidebar-open" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={`bp-sidebar${sidebarOpen ? " bp-sidebar-open" : ""}`}
      >
        <div className="bp-brand">
          <div className="bp-brand-mark">
            Breeders <span className="bp-pro">Pro</span>
          </div>
          {session.barnLabel && (
            <div className="bp-brand-sub">{session.barnLabel}</div>
          )}
        </div>

        {/* Primary action — universal breeding entry point */}
        <div className="bp-nav-section">
          <Link
            href="/breeders-pro/breeding/new"
            className="bp-nav-item"
            style={{
              background: "var(--bp-ink)",
              color: "var(--bp-bg-elevated)",
              fontWeight: 500,
              justifyContent: "center",
              marginBottom: 4,
            }}
          >
            + New Breeding
          </Link>
        </div>

        {/* Workspace — real reskinned routes */}
        <div className="bp-nav-section">
          <div className="bp-nav-label">{workspace.label}</div>
          {workspace.items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`bp-nav-item ${isActive(item.href) ? "bp-active" : ""}`}
            >
              {item.icon}
              {item.label}
              {typeof item.count === "number" && (
                <span className="bp-count">{item.count}</span>
              )}
            </Link>
          ))}
          {workspacePlaceholders.map((item) => (
            <div
              key={item.label}
              className="bp-nav-item"
              aria-disabled="true"
              title="Coming soon"
              style={{
                cursor: "not-allowed",
                color: "var(--bp-ink-quaternary)",
                pointerEvents: "none",
              }}
            >
              {item.icon}
              {item.label}
              <span
                className="bp-count"
                style={{
                  marginLeft: "auto",
                  fontSize: 8,
                  letterSpacing: "0.1em",
                  color: "var(--bp-ink-quaternary)",
                }}
              >
                SOON
              </span>
            </div>
          ))}
        </div>

        {/* Analysis — all placeholders for now */}
        <div className="bp-nav-section">
          <div className="bp-nav-label">Analysis</div>
          {analysisPlaceholders.map((item) => (
            <div
              key={item.label}
              className="bp-nav-item"
              aria-disabled="true"
              title="Coming soon"
              style={{
                cursor: "not-allowed",
                color: "var(--bp-ink-quaternary)",
                pointerEvents: "none",
              }}
            >
              {item.icon}
              {item.label}
              <span
                className="bp-count"
                style={{
                  marginLeft: "auto",
                  fontSize: 8,
                  letterSpacing: "0.1em",
                  color: "var(--bp-ink-quaternary)",
                }}
              >
                SOON
              </span>
            </div>
          ))}
        </div>

        <div className="bp-sidebar-footer">
          <Link
            href="/dashboard"
            className="bp-nav-item"
            style={{
              fontSize: 12,
              color: "var(--bp-ink-tertiary)",
              marginBottom: 12,
              gap: 8,
            }}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 16, height: 16 }}>
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
            Back to BarnBook
          </Link>
          <div className="bp-user">
            <div className="bp-user-avatar">{session.userInitials}</div>
            <div>
              <div className="bp-user-name">{session.userName}</div>
              <div className="bp-user-role">{session.userRole}</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="bp-main">
        <div className="bp-topbar">
          <button
            type="button"
            className="bp-hamburger"
            aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((v) => !v)}
          >
            {sidebarOpen ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            )}
          </button>
          <nav className="bp-breadcrumb" aria-label="Breadcrumb">
            {breadcrumb.map((seg, i) => {
              const isLast = i === breadcrumb.length - 1;
              return (
                <span key={`${seg.label}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {seg.href && !isLast ? (
                    <Link
                      href={seg.href}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {seg.label}
                    </Link>
                  ) : (
                    <span className={isLast ? "bp-current" : undefined}>
                      {seg.label}
                    </span>
                  )}
                  {!isLast && <span className="bp-sep">/</span>}
                </span>
              );
            })}
          </nav>
          <div className="bp-topbar-actions">
            <BarnPilotTopNavButton />
            <button type="button" className="bp-cmdkey">
              Search
              <kbd>⌘K</kbd>
            </button>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

/* ---------- Icons (stroke-based, match reference mockup) ---------- */

function IconGrid() {
  return (
    <svg className="bp-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="5" height="5" />
      <rect x="9" y="2" width="5" height="5" />
      <rect x="2" y="9" width="5" height="5" />
      <rect x="9" y="9" width="5" height="5" />
    </svg>
  );
}

function IconDonor() {
  return (
    <svg className="bp-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

function IconDiamond() {
  return (
    <svg className="bp-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 8 L8 2 L14 8 L8 14 Z" />
    </svg>
  );
}

function IconEmbryo() {
  return (
    <svg className="bp-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <ellipse cx="8" cy="8" rx="4" ry="6" />
      <line x1="8" y1="2" x2="8" y2="14" />
    </svg>
  );
}

function IconSurrogate() {
  return (
    <svg className="bp-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <path d="M5 8 Q8 11 11 8" />
    </svg>
  );
}

function IconPregnant() {
  return (
    <svg className="bp-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 13 V6 L8 2 L13 6 V13 Z" />
      <line x1="6" y1="13" x2="6" y2="9" />
      <line x1="10" y1="13" x2="10" y2="9" />
    </svg>
  );
}

function IconFoal() {
  return (
    <svg className="bp-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 13 Q4 4 8 4 Q12 4 14 13" />
      <line x1="2" y1="13" x2="14" y2="13" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg className="bp-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="2" y1="13" x2="2" y2="3" />
      <line x1="2" y1="13" x2="14" y2="13" />
      <polyline points="4,10 7,7 9,9 13,5" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg className="bp-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <line x1="8" y1="3" x2="8" y2="8" />
      <line x1="8" y1="8" x2="11" y2="11" />
    </svg>
  );
}

function IconDoc() {
  return (
    <svg className="bp-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="12" height="11" />
      <line x1="2" y1="6" x2="14" y2="6" />
    </svg>
  );
}
