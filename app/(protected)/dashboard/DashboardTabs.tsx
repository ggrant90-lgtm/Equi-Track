"use client";

import { AddLogModal, type AddLogHorse } from "@/components/AddLogModal";
import { CapacityBar } from "@/components/CapacityBar";
import { HorseCard } from "@/components/HorseCard";
import { HorsePhoto } from "@/components/HorsePhoto";
import { PlanBadge } from "@/components/PlanBadge";
import { TodayWidget } from "@/components/TodayWidget";
import { BarnTypeIcon } from "@/components/BarnTypeIcon";
import {
  StallPurchaseFlow,
  type StallFlowBarnOption,
} from "@/components/stalls/StallPurchaseFlow";
import { ModuleChip } from "@/components/modules/ModuleChip";
import { CoreOnboarding } from "@/components/onboarding/CoreOnboarding";
import { useWizardState } from "@/hooks/useWizardState";
import type { ModuleAccess } from "@/lib/modules-query";
import type { OnboardingState } from "@/lib/onboarding-query";
import type { CalendarEvent } from "@/app/(protected)/actions/calendar";
import type { ActivityLog, Barn, Horse } from "@/lib/types";
import {
  PERMISSION_LEVEL_COLORS,
  PERMISSION_LEVEL_EMOJI,
  PERMISSION_LEVEL_LABELS,
  normalizePermissionLevel,
} from "@/lib/key-permissions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { switchBarnAction } from "@/app/(protected)/actions/switch-barn";

function formatWhen(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export function DashboardTabs({
  ownedBarns,
  accessBarns,
  accessBarnHorses,
  primaryBarn,
  primaryBarnEffectiveCapacity,
  userBarnOptions,
  horses,
  horseCount,
  activeKeys,
  pendingRequests,
  recentActivity,
  todayEvents,
  upcomingEvents,
  expiringDocuments,
  stallHorses,
  breedersAccess,
  businessAccess,
  onboardingState,
  coreOnboardingBarn,
  allBarnsOverview,
  recentBarnLogs,
  loggableHorses,
}: {
  ownedBarns: Barn[];
  accessBarns: (Barn & { userRole: string })[];
  accessBarnHorses: Record<
    string,
    Pick<Horse, "id" | "name" | "barn_name" | "primary_name_pref" | "breed" | "photo_url">[]
  >;
  primaryBarn: Barn | null;
  /** base_stalls + SUM(active stall blocks) for primaryBarn. 0 when no barn. */
  primaryBarnEffectiveCapacity: number;
  /** Barns the current user owns, with horseCount + effectiveCapacity pre-computed
   *  for the StallPurchaseFlow list. */
  userBarnOptions: StallFlowBarnOption[];
  horses: Pick<
    Horse,
    "id" | "name" | "barn_name" | "primary_name_pref" | "photo_url" | "breed" | "sex" | "color" | "updated_at"
  >[];
  horseCount: number;
  activeKeys: number;
  pendingRequests: number;
  recentActivity: { log: ActivityLog; horseName: string }[];
  todayEvents?: CalendarEvent[];
  upcomingEvents?: CalendarEvent[];
  expiringDocuments?: Array<{
    id: string;
    horse_id: string;
    horse_name: string;
    document_type: string;
    title: string | null;
    expiration_date: string;
    expired: boolean;
  }>;
  stallHorses?: Array<{
    id: string;
    name: string;
    breed: string | null;
    photo_url: string | null;
    barn_id: string;
    barn_name: string;
    permission_level: string | null;
  }>;
  breedersAccess: ModuleAccess;
  businessAccess: ModuleAccess;
  onboardingState: OnboardingState;
  /** User's owned barn used by the Core wizard step 1 rename path. Null
   *  if no barn exists yet (rare — signup auto-creates one). */
  coreOnboardingBarn: { id: string; name: string } | null;
  /** Five most recent barn-level log entries (barn_expenses) for the
   *  active barn. Empty when no barn is active (All Barns view) or
   *  when the barn has no logs yet. */
  recentBarnLogs: Array<{
    id: string;
    barn_id: string;
    performed_at: string;
    category: string;
    total_cost: number;
    vendor_name: string | null;
    description: string | null;
  }>;
  /** Horses the current user can plausibly create a log entry for —
   *  union of owned-barn horses, barn-key access horses, and stall-key
   *  horses (excluding view_only). Drives the dashboard "Add Log"
   *  modal's horse picker. Server-side createLogAction re-checks
   *  permissions, so this list is best-effort. */
  loggableHorses: AddLogHorse[];
  /** Per-barn summary rendered when the user has "All Barns" active
   *  (activeBarnId === "__all__"). Empty array otherwise — the single-
   *  barn view uses its own dedicated data and doesn't read this. */
  allBarnsOverview: Array<{
    id: string;
    name: string;
    barn_type: string;
    plan_tier: string;
    horseCount: number;
    effectiveCapacity: number;
    isOwner: boolean;
  }>;
}) {
  const [tab, setTab] = useState<"my" | "access">("my");
  const [stallFlowBarnId, setStallFlowBarnId] = useState<string | null>(null);
  const [stallFlowMode, setStallFlowMode] = useState<"expand" | "build">("expand");
  const [addLogOpen, setAddLogOpen] = useState(false);

  // Core onboarding wizard — auto-opens on first dashboard visit for
  // new users (when not completed + not dismissed). Auto-opens at most
  // once per tab session. Has to be set in an effect (not lazy init)
  // because shouldAutoOpen reads sessionStorage, which is only
  // available after hydration; useState's initializer runs at SSR
  // time and React reuses that value on mount.
  const coreWizard = useWizardState("core", onboardingState);
  const [coreOpen, setCoreOpen] = useState(false);
  useEffect(() => {
    if (coreWizard.shouldAutoOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCoreOpen(true);
      coreWizard.markAutoOpened();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coreWizard.shouldAutoOpen]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <AddLogModal
        open={addLogOpen}
        onClose={() => setAddLogOpen(false)}
        horses={loggableHorses}
      />

      <CoreOnboarding
        open={coreOpen}
        onClose={async () => {
          // "Dismissed without completing" path — fires on X, skip,
          // backdrop click, Escape. Writes dismissed_at so we don't
          // keep nagging the user on every dashboard visit.
          setCoreOpen(false);
          await coreWizard.dismissCore();
        }}
        onComplete={async () => {
          // Final-step completion path — writes completed=true AND
          // closes the modal. Intentionally does NOT also call
          // dismissCore; the completion flag alone stops the wizard
          // from auto-opening next time (see shouldAutoOpenCore).
          await coreWizard.markComplete();
          setCoreOpen(false);
        }}
        initialBarn={coreOnboardingBarn}
        initialStep={onboardingState.core.currentStep}
        onStepChange={(step) => {
          // Fire-and-forget; we don't block the user on save failures.
          coreWizard.saveCoreStep(step);
        }}
      />

      {(expiringDocuments?.length ?? 0) > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-amber-900/70 mb-2">
            Needs Attention — Documents Expiring
          </div>
          <ul className="space-y-1">
            {(expiringDocuments ?? []).slice(0, 5).map((d) => (
              <li key={d.id} className="text-sm text-amber-900">
                <a
                  href={`/horses/${d.horse_id}?tab=documents`}
                  className="hover:underline"
                >
                  <strong>{d.horse_name}</strong> —{" "}
                  {d.title ?? labelForDocType(d.document_type)}
                  {d.expired ? (
                    <span className="ml-2 rounded bg-red-100 text-red-800 text-[10px] font-mono uppercase px-1.5 py-0.5">
                      Expired
                    </span>
                  ) : (
                    <span className="ml-2 text-amber-800/80">
                      expires{" "}
                      {new Date(d.expiration_date).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" },
                      )}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* ─── Tab bar ─── */}
      <div className="flex items-center gap-1 rounded-xl bg-barn-dark/5 p-1">
        <button
          type="button"
          onClick={() => setTab("my")}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
            tab === "my"
              ? "bg-white text-barn-dark shadow-sm"
              : "text-barn-dark/55 hover:text-barn-dark/80"
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            My Barns
            {ownedBarns.length > 0 ? (
              <span className="rounded-full bg-brass-gold/20 px-1.5 py-0.5 text-xs text-barn-dark/70">
                {ownedBarns.length}
              </span>
            ) : null}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab("access")}
          className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
            tab === "access"
              ? "bg-white text-barn-dark shadow-sm"
              : "text-barn-dark/55 hover:text-barn-dark/80"
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Barn Access
            {accessBarns.length > 0 ? (
              <span className="rounded-full bg-barn-dark/10 px-1.5 py-0.5 text-xs text-barn-dark/55">
                {accessBarns.length}
              </span>
            ) : null}
          </span>
        </button>
      </div>

      {/* ═══ MY BARNS TAB ═══ */}
      {tab === "my" ? (
        <>
          {ownedBarns.length === 0 ? (
            <div className="mt-10 rounded-2xl border border-barn-dark/10 bg-white p-8 text-center shadow-sm">
              <p className="font-serif text-lg text-barn-dark">You haven&apos;t created a barn yet</p>
              <p className="mt-2 text-sm text-barn-dark/60">
                Create a barn to start managing horses, generating keys, and building your profile.
              </p>
              <Link
                href="/barn/new"
                className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brass-gold px-6 py-2.5 font-medium text-barn-dark shadow hover:brightness-110"
              >
                Create Your Barn
              </Link>
            </div>
          ) : primaryBarn ? (
            <>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="font-serif text-3xl font-semibold text-barn-dark">{primaryBarn.name}</h1>
                    <PlanBadge tier={primaryBarn.plan_tier} />
                  </div>
                  <p className="text-sm text-barn-dark/65">Barn dashboard</p>
                  <div className="mt-1 flex max-w-md items-center gap-2">
                    <div className="flex-1">
                      <CapacityBar
                        stallCapacity={primaryBarnEffectiveCapacity}
                        horseCount={horseCount}
                        compact
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setStallFlowBarnId(primaryBarn.id);
                        setStallFlowMode("expand");
                      }}
                      aria-label="Add more stalls"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brass-gold bg-brass-gold/20 text-barn-dark hover:bg-brass-gold/35"
                    >
                      <span aria-hidden="true" className="text-sm font-semibold leading-none">+</span>
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/barn/${primaryBarn.id}`}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-barn-dark/20 bg-white px-4 py-2.5 text-sm font-medium text-barn-dark hover:border-brass-gold"
                  >
                    View Profile
                  </Link>
                  <Link
                    href={`/barn/${primaryBarn.id}/edit`}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-brass-gold px-4 py-2.5 text-sm font-medium text-barn-dark shadow hover:brightness-110"
                  >
                    Edit Profile
                  </Link>
                </div>
              </div>

              <StallPurchaseFlow
                open={stallFlowBarnId !== null}
                onClose={() => setStallFlowBarnId(null)}
                userBarns={userBarnOptions}
                defaultBarnId={stallFlowBarnId ?? undefined}
                defaultMode={stallFlowMode}
              />


              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-barn-dark/10 bg-white p-5 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-barn-dark/50">Horses</p>
                  <p className="mt-1 font-serif text-3xl text-barn-dark">{horseCount}</p>
                </div>
                <div className="rounded-2xl border border-barn-dark/10 bg-white p-5 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-barn-dark/50">Active keys</p>
                  <p className="mt-1 font-serif text-3xl text-barn-dark">{activeKeys}</p>
                </div>
                <div className="rounded-2xl border border-barn-dark/10 bg-white p-5 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-barn-dark/50">Pending requests</p>
                  <p className="mt-1 font-serif text-3xl text-barn-dark">{pendingRequests}</p>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/horses/new"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brass-gold px-5 py-2.5 text-sm font-medium text-barn-dark shadow hover:brightness-110"
                >
                  Add Horse
                </Link>
                <button
                  type="button"
                  onClick={() => setAddLogOpen(true)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-barn-dark/20 bg-white px-5 py-2.5 text-sm font-medium text-barn-dark hover:border-brass-gold"
                >
                  Add Log
                </button>
                <Link
                  href="/keys"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-barn-dark/20 bg-white px-5 py-2.5 text-sm font-medium text-barn-dark hover:border-brass-gold"
                >
                  Generate Key
                </Link>
                <Link
                  href="/keys/requests"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-barn-dark/20 bg-white px-5 py-2.5 text-sm font-medium text-barn-dark hover:border-brass-gold"
                >
                  View Requests
                </Link>
              </div>

              {/* Premium modules — quiet chip row. Renders as a
                  simple link for users on an active trial /
                  subscription; only becomes promotional for users who
                  haven't started a trial. */}
              <div className="mt-8 flex flex-wrap gap-2">
                <ModuleChip
                  module="breeders_pro"
                  access={breedersAccess}
                  moduleHref="/breeders-pro"
                />
                <ModuleChip
                  module="business_pro"
                  access={businessAccess}
                  moduleHref="/business-pro"
                />
              </div>

              <section className="mt-12">
                <h2 className="font-serif text-xl text-barn-dark">Horses</h2>
                {horses.length === 0 ? (
                  <p className="mt-3 text-barn-dark/70">No horses yet. Add your first horse to get started.</p>
                ) : (
                  <ul className="mt-4 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
                    {horses.map((h) => (
                      <li key={h.id}>
                        <HorseCard horse={h} href={`/horses/${h.id}`} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Today's Schedule */}
              {(todayEvents?.length || upcomingEvents?.length) ? (
                <section className="mt-8">
                  <TodayWidget today={todayEvents ?? []} upcoming={upcomingEvents ?? []} />
                </section>
              ) : null}

              <section className="mt-12">
                <h2 className="font-serif text-xl text-barn-dark">Recent activity</h2>
                {recentActivity.length === 0 ? (
                  <p className="mt-3 text-barn-dark/70">No activity log entries yet.</p>
                ) : (
                  <ul className="mt-4 divide-y divide-barn-dark/10 rounded-2xl border border-barn-dark/10 bg-white">
                    {recentActivity.map(({ log, horseName }) => (
                      <li key={log.id}>
                        <Link
                          href={`/horses/${log.horse_id}`}
                          className="flex flex-col gap-1 px-4 py-3 hover:bg-parchment/60 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p className="font-medium text-barn-dark">{log.activity_type}</p>
                            <p className="text-sm text-barn-dark/65">{horseName}</p>
                          </div>
                          <time className="text-xs text-barn-dark/50" dateTime={log.created_at}>
                            {formatWhen(log.created_at)}
                          </time>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Recent barn activity — barn_expenses rows for the
                  active barn. Includes both zero-cost activity logs
                  (cleaning, maintenance) and financial entries (hay,
                  utilities). Tap a row to jump to /logs scoped to
                  this barn, where the user can edit/delete. */}
              <section className="mt-12">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h2 className="font-serif text-xl text-barn-dark">
                    Recent barn activity
                  </h2>
                  <Link
                    href="/logs"
                    className="text-xs font-medium text-brass-gold hover:underline"
                  >
                    View all · + Add log
                  </Link>
                </div>
                {recentBarnLogs.length === 0 ? (
                  <p className="mt-3 text-barn-dark/70">
                    No barn logs yet. Track hay deliveries, cleaning, or
                    anything that happens at the barn itself.
                  </p>
                ) : (
                  <ul className="mt-4 divide-y divide-barn-dark/10 rounded-2xl border border-barn-dark/10 bg-white">
                    {recentBarnLogs.map((l) => (
                      <li key={l.id}>
                        <Link
                          href="/logs"
                          className="flex flex-col gap-1 px-4 py-3 hover:bg-parchment/60 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                                style={{
                                  background: "rgba(42,64,49,0.08)",
                                  color: "#2a4031",
                                }}
                              >
                                {l.category}
                              </span>
                              <p className="font-medium text-barn-dark truncate">
                                {l.description ?? "(no description)"}
                              </p>
                            </div>
                            {l.vendor_name && (
                              <p className="text-xs text-barn-dark/55 mt-0.5">
                                {l.vendor_name}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-barn-dark/55">
                            {l.total_cost > 0 && (
                              <span className="font-semibold text-barn-dark">
                                ${l.total_cost.toLocaleString()}
                              </span>
                            )}
                            <time dateTime={l.performed_at}>
                              {new Date(l.performed_at).toLocaleDateString(
                                undefined,
                                {
                                  month: "short",
                                  day: "numeric",
                                  year:
                                    new Date(l.performed_at).getFullYear() !==
                                    new Date().getFullYear()
                                      ? "numeric"
                                      : undefined,
                                },
                              )}
                            </time>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : (
            /* All Barns view — one card per barn with capacity. Each
                card deep-links into its barn (Service Barns route to
                their dedicated /service dashboard; everything else
                goes to /barn/[id]/dashboard via BarnSwitcher-style
                routing, or rather just /barn/[id]). */
            <AllBarnsOverview barns={allBarnsOverview} />
          )}
        </>
      ) : null}

      {/* ═══ BARN ACCESS TAB ═══ */}
      {tab === "access" ? (
        <>
          <div className="mt-6">
            <h1 className="font-serif text-2xl font-semibold text-barn-dark">Barn Access</h1>
            <p className="mt-1 text-sm text-barn-dark/60">
              Barns you&apos;ve been given access to via keys or invites.
            </p>
          </div>

          {/* Stall Key grants — specific horses, grouped by barn */}
          {(stallHorses?.length ?? 0) > 0 && (
            <div className="mt-6">
              <div
                className="mb-2 text-xs font-medium uppercase tracking-wide text-barn-dark/55"
              >
                Your Horses
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(stallHorses ?? []).map((h) => {
                  const level = normalizePermissionLevel(h.permission_level);
                  return (
                    <Link
                      key={h.id}
                      href={`/horses/${h.id}`}
                      className="group rounded-2xl border border-barn-dark/10 bg-white p-4 shadow-sm transition hover:border-brass-gold"
                    >
                      <div className="flex items-center gap-3">
                        {h.photo_url ? (
                          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={h.photo_url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-parchment text-barn-dark">
                            <span className="font-serif text-lg">
                              {h.name.charAt(0)}
                            </span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-barn-dark">
                            {h.name}
                          </div>
                          <div className="truncate text-xs text-barn-dark/60">
                            at {h.barn_name}
                          </div>
                        </div>
                      </div>
                      {level && (
                        <div className="mt-3 flex items-center gap-1.5">
                          <span
                            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
                            style={{
                              background: PERMISSION_LEVEL_COLORS[level].bg,
                              color: PERMISSION_LEVEL_COLORS[level].fg,
                            }}
                          >
                            <span>{PERMISSION_LEVEL_EMOJI[level]}</span>
                            {PERMISSION_LEVEL_LABELS[level]}
                          </span>
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {accessBarns.length === 0 && (stallHorses?.length ?? 0) === 0 ? (
            <div className="mt-8 rounded-2xl border border-barn-dark/10 bg-white p-8 text-center shadow-sm">
              <svg className="mx-auto h-12 w-12 text-barn-dark/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <p className="mt-4 font-serif text-lg text-barn-dark">
                No barn access yet
              </p>
              <p className="mt-2 text-sm text-barn-dark/60">
                Ask a barn owner for a Barn Key or Stall Key to get started.
              </p>
              <Link
                href="/join"
                className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-barn-dark/20 bg-white px-6 py-2.5 font-medium text-barn-dark hover:border-brass-gold"
              >
                I Have a Key
              </Link>
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              {accessBarns.map((barn) => {
                const barnHorses = accessBarnHorses[barn.id] ?? [];
                return (
                  <div
                    key={barn.id}
                    className="rounded-2xl border border-barn-dark/10 bg-white shadow-sm overflow-hidden"
                  >
                    {/* Barn header */}
                    <div className="flex items-center gap-4 border-b border-barn-dark/5 bg-parchment/50 px-5 py-4">
                      {barn.logo_url ? (
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-barn-dark/10">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={barn.logo_url} alt="" className="h-full w-full object-cover" />
                        </div>
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-barn-dark">
                          <span className="font-serif text-lg font-semibold text-brass-gold">
                            {barn.name.charAt(0)}
                          </span>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <Link href={`/barn/${barn.id}`} className="font-serif text-lg font-semibold text-barn-dark hover:text-brass-gold">
                          {barn.name}
                        </Link>
                        <p className="text-xs capitalize text-barn-dark/55">
                          <span className="inline-flex items-center gap-1 rounded-full bg-brass-gold/15 px-2 py-0.5 text-xs font-medium text-barn-dark/70">
                            {barn.userRole}
                          </span>
                          {barn.city && barn.state ? (
                            <span className="ml-2 text-barn-dark/40">
                              {barn.city}, {barn.state}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>

                    {/* Horses in this barn */}
                    {barnHorses.length > 0 ? (
                      <div className="px-5 py-4">
                        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-barn-dark/45">
                          Horses ({barnHorses.length})
                        </p>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                          {barnHorses.slice(0, 8).map((h) => (
                            <Link
                              key={h.id}
                              href={`/horses/${h.id}`}
                              className="group flex items-center gap-2 rounded-xl border border-barn-dark/8 p-2 transition-all hover:border-brass-gold/30 hover:bg-parchment/30"
                            >
                              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                                <HorsePhoto
                                  name={h.name}
                                  photoUrl={h.photo_url}
                                  aspectClassName="aspect-square w-full"
                                  className="rounded-lg"
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-barn-dark">{h.name}</p>
                                {h.breed ? (
                                  <p className="truncate text-xs text-barn-dark/45">{h.breed}</p>
                                ) : null}
                              </div>
                            </Link>
                          ))}
                        </div>
                        {barnHorses.length > 8 ? (
                          <p className="mt-2 text-xs text-barn-dark/45">
                            +{barnHorses.length - 8} more
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="px-5 py-4">
                        <p className="text-sm text-barn-dark/50">No horses in this barn yet.</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function labelForDocType(t: string): string {
  switch (t) {
    case "coggins":
      return "Coggins test";
    case "registration":
      return "Registration papers";
    case "health_certificate":
      return "Health certificate";
    case "vet_record":
      return "Vet record";
    default:
      return "Document";
  }
}

/**
 * All Barns view — grid of cards, one per barn, with horse count /
 * capacity. Service Barns skip the capacity bar because base_stalls
 * is the 999 sentinel (meaningless for mobile providers); they show
 * the horse count alone so the card is still informative.
 *
 * Each card links into that barn's dedicated surface: Service Barns
 * go straight to /barn/[id]/service, everything else to /barn/[id].
 */
function AllBarnsOverview({
  barns,
}: {
  barns: Array<{
    id: string;
    name: string;
    barn_type: string;
    plan_tier: string;
    horseCount: number;
    effectiveCapacity: number;
    isOwner: boolean;
  }>;
}) {
  if (barns.length === 0) {
    return (
      <div className="mt-10 rounded-2xl border border-barn-dark/10 bg-white p-8 text-center shadow-sm">
        <p className="font-serif text-lg text-barn-dark">No barns yet</p>
        <p className="mt-2 text-sm text-barn-dark/60">
          Create a barn or redeem a key to get started.
        </p>
      </div>
    );
  }

  // Split owned vs access so the user can tell at a glance which
  // ones they run vs which ones they just hold keys for.
  const owned = barns.filter((b) => b.isOwner);
  const access = barns.filter((b) => !b.isOwner);

  return (
    <div className="mt-6 space-y-8">
      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h1 className="font-serif text-2xl font-semibold text-barn-dark">
            All Barns
          </h1>
          <Link
            href="/barn/new"
            className="text-xs font-medium text-brass-gold hover:underline"
          >
            + Create barn
          </Link>
        </div>
        <p className="text-sm text-barn-dark/60">
          {barns.length} barn{barns.length === 1 ? "" : "s"} total ·{" "}
          {barns.reduce((sum, b) => sum + b.horseCount, 0)} horses combined
        </p>
      </div>

      {owned.length > 0 && (
        <section>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-barn-dark/55">
            Your Barns
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {owned.map((b) => (
              <BarnOverviewCard key={b.id} barn={b} />
            ))}
          </div>
        </section>
      )}

      {access.length > 0 && (
        <section>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-barn-dark/55">
            Shared With You
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {access.map((b) => (
              <BarnOverviewCard key={b.id} barn={b} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function BarnOverviewCard({
  barn,
}: {
  barn: {
    id: string;
    name: string;
    barn_type: string;
    plan_tier: string;
    horseCount: number;
    effectiveCapacity: number;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isService = barn.barn_type === "service";
  const isMareMotel = barn.barn_type === "mare_motel";
  const subtitle = isService
    ? "Service Barn"
    : isMareMotel
      ? "Mare Motel"
      : "Standard Barn";
  const remaining = Math.max(0, barn.effectiveCapacity - barn.horseCount);

  // Clicking a card switches the active barn (updates the sidebar
  // selector + the BarnSwitcher label) and routes to that barn's
  // dashboard — Service Barns go to their dedicated /service view,
  // everything else to /dashboard so the user gets the same per-barn
  // horse grid + recent activity they'd see from the switcher.
  function handleOpen() {
    startTransition(async () => {
      await switchBarnAction(barn.id);
      router.push(isService ? `/barn/${barn.id}/service` : "/dashboard");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleOpen}
      disabled={pending}
      className="group rounded-2xl border border-barn-dark/10 bg-white p-4 shadow-sm transition hover:border-brass-gold hover:shadow-md disabled:opacity-60 text-left w-full"
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: isService
              ? "rgba(75,100,121,0.15)"
              : isMareMotel
                ? "rgba(201,168,76,0.18)"
                : "rgba(42,64,49,0.08)",
            color: isService ? "#4b6479" : "#2a4031",
          }}
        >
          <BarnTypeIcon type={barn.barn_type as "standard" | "mare_motel" | "service"} size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-serif text-lg font-semibold text-barn-dark truncate group-hover:text-brass-gold">
              {barn.name}
            </h3>
            <PlanBadge tier={barn.plan_tier} />
          </div>
          <div className="text-xs text-barn-dark/55">{subtitle}</div>
        </div>
      </div>

      {isService ? (
        <div className="mt-4 text-sm text-barn-dark/70">
          {barn.horseCount} horse{barn.horseCount === 1 ? "" : "s"} tracked
        </div>
      ) : (
        <div className="mt-4">
          <CapacityBar
            stallCapacity={barn.effectiveCapacity}
            horseCount={barn.horseCount}
            compact
          />
          <div className="mt-1.5 text-xs text-barn-dark/55">
            {remaining} stall{remaining === 1 ? "" : "s"} remaining
          </div>
        </div>
      )}
    </button>
  );
}
