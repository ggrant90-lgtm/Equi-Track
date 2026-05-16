"use client";

import { DesktopSidebar, MobileSidebarDrawer } from "@/components/Sidebar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { fullNav, reducedNav } from "@/components/nav-config";
import { TopNav } from "@/components/TopNav";
import { ToastProvider } from "@/components/ui/Toast";
import { CelebrationProvider } from "@/components/engagement/CelebrationProvider";
import { BarnPilot } from "@/components/assistant/BarnPilot";
import { supabase } from "@/lib/supabase";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export type BarnSummary = { id: string; name: string; barn_type: string };

export function ProtectedChrome({
  children,
  displayName,
  email,
  avatarUrl,
  barnName,
  hasBarn,
  isBarnOwner,
  allBarns,
  activeBarnId,
}: {
  children: React.ReactNode;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  barnName: string | null;
  hasBarn: boolean;
  isBarnOwner?: boolean;
  allBarns?: BarnSummary[];
  activeBarnId?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const baseNav = hasBarn ? fullNav : reducedNav;
  // /keys is owner-only (generating + managing keys). Hide from barn-key
  // and stall-key holders so the menu doesn't suggest things they can't do.
  const navItems = isBarnOwner
    ? baseNav
    : baseNav.filter((n) => n.href !== "/keys");

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }, [router]);

  return (
    <ToastProvider>
      <CelebrationProvider>
      <BarnPilot>
        <div className="flex min-h-full flex-col md:flex-row">
          <DesktopSidebar
            navItems={navItems}
            pathname={pathname}
            barnName={barnName}
            hasBarn={hasBarn}
            allBarns={allBarns}
            activeBarnId={activeBarnId}
          />
          <MobileSidebarDrawer
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            navItems={navItems}
            pathname={pathname}
            barnName={barnName}
            hasBarn={hasBarn}
            allBarns={allBarns}
            activeBarnId={activeBarnId}
          />

          <div className="flex min-h-full min-w-0 flex-1 flex-col">
            <TopNav
              displayName={displayName}
              email={email}
              avatarUrl={avatarUrl}
              barnName={barnName}
              hasBarn={hasBarn}
              menuOpen={menuOpen}
              setMenuOpen={setMenuOpen}
              onOpenMobileSidebar={() => setMobileOpen(true)}
              onSignOut={signOut}
            />

            <main className="flex-1 bg-parchment pb-20 text-barn-dark md:pb-6">{children}</main>

            <MobileBottomNav navItems={navItems} pathname={pathname} />
          </div>
        </div>
      </BarnPilot>
      </CelebrationProvider>
    </ToastProvider>
  );
}
