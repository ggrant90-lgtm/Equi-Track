import {
  IconCalendar,
  IconCamera,
  IconChat,
  IconEmbryo,
  IconHome,
  IconHorses,
  IconKey,
  IconLedger,
  IconReports,
  IconUser,
} from "@/components/protected/nav-icons";
import type { ReactNode } from "react";

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  external?: boolean;
};

export function navLinkClass(active: boolean): string {
  return [
    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
    active
      ? "bg-brass-gold/15 text-brass-gold"
      : "text-parchment/90 hover:bg-barn-panel hover:text-parchment",
  ].join(" ");
}

// Authenticated sidebar order. BarnPilot is injected by SidebarNavList
// right after Dashboard (the first item), so the explicit list here
// starts at "Horses" implicitly — Dashboard appears first, BarnPilot
// next, then the rest in the order below.
export const fullNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <IconHome className="h-5 w-5" /> },
  { href: "/horses", label: "Horses", icon: <IconHorses className="h-5 w-5" /> },
  { href: "/identify", label: "Scan", icon: <IconCamera className="h-5 w-5" /> },
  { href: "/calendar", label: "Calendar", icon: <IconCalendar className="h-5 w-5" /> },
  { href: "/logs", label: "Barn Logs", icon: <IconReports className="h-5 w-5" /> },
  { href: "/reports", label: "Reports", icon: <IconReports className="h-5 w-5" /> },
  { href: "/keys", label: "Keys", icon: <IconKey className="h-5 w-5" /> },
  { href: "/business-pro", label: "Business Pro", icon: <IconLedger className="h-5 w-5" /> },
  { href: "/breeders-pro", label: "Breeders Pro", icon: <IconEmbryo className="h-5 w-5" /> },
];

export const supportNav: NavItem[] = [
  { href: "https://wa.me/19289103669", label: "Support", icon: <IconChat className="h-5 w-5" />, external: true },
];

export const reducedNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <IconHome className="h-5 w-5" /> },
  { href: "/profile", label: "Profile", icon: <IconUser className="h-5 w-5" /> },
];

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
