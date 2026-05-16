"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useBusinessProSession } from "./BusinessProSession";
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
 * Presentation-only chrome for Business Pro routes.
 *
 * Reuses the `.bp-scope` design system from Breeders Pro so the dedicated
 * workspace feel is consistent. Each page renders its own
 * `<BusinessProChrome breadcrumb={[...]}>` wrapper around its content.
 */
export function BusinessProChrome({
  breadcrumb,
  children,
}: {
  breadcrumb: BreadcrumbSegment[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const session = useBusinessProSession();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!sidebarOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSidebarOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  // Workspace — real pages ship here; the rest are placeholders
  const workspace: NavGroup = {
    label: "Workspace",
    items: [
      { href: "/business-pro/overview", label: "Overview", icon: <IconDashboard /> },
      { href: "/business-pro/receivables", label: "Receivables", icon: <IconInbox /> },
      { href: "/business-pro/invoicing", label: "Invoicing", icon: <IconDoc /> },
      { href: "/business-pro/expenses", label: "Expenses", icon: <IconArrowDown /> },
      { href: "/business-pro/receipts", label: "Receipts", icon: <IconFolder /> },
      { href: "/business-pro/clients", label: "Clients", icon: <IconUsers /> },
      { href: "/business-pro/transactions", label: "Transactions", icon: <IconList /> },
    ],
  };

  const workspacePlaceholders: NavItem[] = [];

  const analysis: NavGroup = {
    label: "Analysis",
    items: [
      { href: "/business-pro/aging", label: "Aging Report", icon: <IconClock /> },
    ],
  };

  const analysisPlaceholders: NavItem[] = [
    { href: "#", label: "P&L Report", icon: <IconChart /> },
    { href: "#", label: "Cash Flow", icon: <IconTrend /> },
    { href: "#", label: "Tax Prep", icon: <IconFolder /> },
  ];

  const isActive = (href: string) => {
    if (href === "#") return false;
    const [path] = href.split("?");
    if (path === "/business-pro") return pathname === "/business-pro";
    return pathname.startsWith(path);
  };

  return (
    <div className="bp-scope bp-chrome">
      <div
        className={`bp-sidebar-backdrop${sidebarOpen ? " bp-sidebar-open" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <aside className={`bp-sidebar${sidebarOpen ? " bp-sidebar-open" : ""}`}>
        <div className="bp-brand">
          <div className="bp-brand-mark">
            Business <span className="bp-pro">Pro</span>
          </div>
          {session.userRole && (
            <div className="bp-brand-sub">Financials · {new Date().getFullYear()}</div>
          )}
        </div>

        {/* Primary action */}
        <div className="bp-nav-section">
          <Link
            href="/business-pro/overview"
            className="bp-nav-item"
            style={{
              background: "var(--bp-ink)",
              color: "var(--bp-bg-elevated)",
              fontWeight: 500,
              justifyContent: "center",
              marginBottom: 4,
            }}
          >
            Money Pulse →
          </Link>
        </div>

        {/* Workspace */}
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

        {/* Analysis */}
        <div className="bp-nav-section">
          <div className="bp-nav-label">{analysis.label}</div>
          {analysis.items.map((item) => (
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
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <BarnPilotTopNavButton />
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Icons (inline SVGs, kept simple)
// ──────────────────────────────────────────────────────────────────────────

function IconDashboard() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
      <rect x="3" y="3" width="6" height="7" rx="1" />
      <rect x="11" y="3" width="6" height="4" rx="1" />
      <rect x="11" y="9" width="6" height="8" rx="1" />
      <rect x="3" y="12" width="6" height="5" rx="1" />
    </svg>
  );
}

function IconList() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
      <line x1="6" y1="5" x2="17" y2="5" />
      <line x1="6" y1="10" x2="17" y2="10" />
      <line x1="6" y1="15" x2="17" y2="15" />
      <circle cx="3" cy="5" r="1" fill="currentColor" />
      <circle cx="3" cy="10" r="1" fill="currentColor" />
      <circle cx="3" cy="15" r="1" fill="currentColor" />
    </svg>
  );
}

function IconInbox() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
      <path d="M3 11l2-6h10l2 6v4a1 1 0 01-1 1H4a1 1 0 01-1-1v-4z" />
      <path d="M3 11h4l1 2h4l1-2h4" />
    </svg>
  );
}

function IconDoc() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
      <path d="M5 3h7l3 3v11a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" />
      <path d="M12 3v3h3" />
      <line x1="7" y1="10" x2="13" y2="10" />
      <line x1="7" y1="13" x2="13" y2="13" />
    </svg>
  );
}

function IconArrowDown() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
      <line x1="10" y1="4" x2="10" y2="16" />
      <polyline points="5 11 10 16 15 11" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
      <circle cx="7" cy="7" r="3" />
      <path d="M2 17c0-3 2-5 5-5s5 2 5 5" />
      <circle cx="14" cy="8" r="2.5" />
      <path d="M12 17c0-2 2-4 4-4" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
      <line x1="3" y1="17" x2="17" y2="17" />
      <rect x="5" y="10" width="2" height="7" />
      <rect x="9" y="7" width="2" height="10" />
      <rect x="13" y="4" width="2" height="13" />
    </svg>
  );
}

function IconTrend() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
      <polyline points="3 14 7 10 11 13 17 6" />
      <polyline points="13 6 17 6 17 10" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
      <circle cx="10" cy="10" r="7" />
      <polyline points="10 6 10 10 13 12" />
    </svg>
  );
}

function IconFolder() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
      <path d="M3 6a1 1 0 011-1h4l2 2h6a1 1 0 011 1v7a1 1 0 01-1 1H4a1 1 0 01-1-1V6z" />
    </svg>
  );
}
