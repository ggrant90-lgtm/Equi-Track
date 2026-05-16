import { HorseCard } from "@/components/HorseCard";
import { HorsePhoto } from "@/components/HorsePhoto";
import { getActiveBarnId } from "@/lib/barn-session";
import { getTodayAndUpcoming } from "@/app/(protected)/actions/calendar";
import { getEffectiveCapacityMap } from "@/lib/stalls-query";
import { getModuleAccess } from "@/lib/modules-query";
import { getOnboardingState } from "@/lib/onboarding-query";
import { runBackfillIfNeeded } from "@/lib/engagement/backfill";
import { runCogginsExpiryCheck } from "@/lib/engagement/notifications/scheduled";
import { createServerComponentClient } from "@/lib/supabase-server";
import type { ActivityLog, Barn, Horse } from "@/lib/types";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardTabs } from "./DashboardTabs";

function formatWhen(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export default async function DashboardPage() {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Engagement: one-time backfill so existing users see real signal
  // in the bell (streak from history + welcome flight) — guarded by
  // a unique celebration_key, so it's a no-op on every load after
  // the first. Then the scheduled coggins-expiry check. Both are
  // fire-and-forget — page render must not wait on engagement work.
  void runBackfillIfNeeded(supabase, user.id);
  void runCogginsExpiryCheck(supabase, user.id);

  // ── My Barns: barns the user owns ──
  const { data: ownedBarns } = await supabase
    .from("barns")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });

  // ── Barn Access: barns where user is a member but NOT owner ──
  const { data: memberships } = await supabase
    .from("barn_members")
    .select("barn_id, role, status")
    .eq("user_id", user.id)
    .or("status.eq.active,status.is.null");

  const ownedIds = new Set((ownedBarns ?? []).map((b) => b.id));
  const accessMemberships = (memberships ?? []).filter(
    (m) => !ownedIds.has(m.barn_id),
  );

  // Fetch barn details for access barns
  const accessBarnIds = accessMemberships.map((m) => m.barn_id);
  let accessBarns: (Barn & { userRole: string })[] = [];
  if (accessBarnIds.length > 0) {
    const { data: barnsData } = await supabase
      .from("barns")
      .select("*")
      .in("id", accessBarnIds);

    const roleMap = new Map(accessMemberships.map((m) => [m.barn_id, m.role]));
    accessBarns = ((barnsData ?? []) as Barn[]).map((b) => ({
      ...b,
      userRole: roleMap.get(b.id) ?? "member",
    }));
  }

  // Check if user has no barns at all
  const hasNoBarns = (ownedBarns ?? []).length === 0 && accessBarns.length === 0;

  if (hasNoBarns) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 sm:px-6">
        <h1 className="font-serif text-3xl font-semibold text-barn-dark">Welcome to BarnBook</h1>
        <p className="mt-3 text-barn-dark/80">
          You&apos;re not linked to a barn yet. Create one, redeem a key, or request access from a barn
          you work with.
        </p>

        <div className="mt-10 flex flex-col gap-4">
          <Link
            href="/barn/new"
            className="flex min-h-[52px] items-center justify-center rounded-xl bg-brass-gold px-6 py-3 text-center font-medium text-barn-dark shadow-md transition hover:brightness-110"
          >
            Create Your Barn
          </Link>
          <Link
            href="/join"
            className="flex min-h-[52px] items-center justify-center rounded-xl border-2 border-barn-dark/20 bg-white px-6 py-3 text-center font-medium text-barn-dark transition hover:border-brass-gold hover:bg-parchment"
          >
            I Have a Key
          </Link>
        </div>

        <section className="mt-12 rounded-2xl border border-barn-dark/10 bg-white p-6 shadow-sm">
          <h2 className="font-serif text-lg text-barn-dark">Request access</h2>
          <p className="mt-2 text-sm leading-relaxed text-barn-dark/75">
            If your trainer or barn manager invited you by email, ask them for a Barn Key or Stall Key.
            You can redeem keys on the next screen. For access without a key, contact your barn owner —
            they can send an invite or approve your request when that flow is enabled.
          </p>
        </section>
      </div>
    );
  }

  // ── Determine which barn to show (active barn from cookie, or first owned) ──
  const activeBarnId = await getActiveBarnId();
  const allUserBarns = [...(ownedBarns ?? []) as Barn[], ...accessBarns];
  const isAllBarns = activeBarnId === "__all__" && allUserBarns.length > 1;
  const primaryBarn = isAllBarns
    ? null
    : activeBarnId && activeBarnId !== "__all__"
      ? allUserBarns.find((b) => b.id === activeBarnId) ?? (ownedBarns ?? [])[0] ?? null
      : (ownedBarns ?? [])[0] ?? null;

  // Service Barns have their own dashboard at /barn/[id]/service — the
  // standard horse-photo grid is meaningless for a mobile service
  // provider whose horses are quick records and Stall-Key linked refs.
  if (primaryBarn && primaryBarn.barn_type === "service") {
    redirect(`/barn/${primaryBarn.id}/service`);
  }

  let horses: Pick<
    Horse,
    "id" | "name" | "barn_name" | "primary_name_pref" | "photo_url" | "breed" | "sex" | "color" | "updated_at"
  >[] = [];
  let horseCount = 0;
  let activeKeys = 0;
  let pendingRequests = 0;
  let recentActivity: { log: ActivityLog; horseName: string }[] = [];

  if (isAllBarns) {
    // Combined view: fetch horses from ALL user's barns
    const allBarnIds = allUserBarns.map((b) => b.id);
    const [horsesRes, keysRes] = await Promise.all([
      supabase
        .from("horses")
        .select("id, name, barn_name, primary_name_pref, photo_url, breed, sex, color, updated_at")
        .in("barn_id", allBarnIds)
        .eq("archived", false)
        .order("name", { ascending: true })
        .limit(100),
      supabase
        .from("access_keys")
        .select("id", { count: "exact", head: true })
        .in("barn_id", allBarnIds)
        .eq("is_active", true),
    ]);

    horses = (horsesRes.data ?? []) as typeof horses;
    horseCount = horses.length;
    activeKeys = keysRes.count ?? 0;

    const ids = horses.map((h) => h.id);
    if (ids.length > 0) {
      const { data: logs } = await supabase
        .from("activity_log")
        .select("*")
        .in("horse_id", ids)
        .order("created_at", { ascending: false })
        .limit(5);

      const nameByHorse = new Map(horses.map((h) => [h.id, h.name]));
      recentActivity = (logs ?? []).map((log) => ({
        log: log as ActivityLog,
        horseName: nameByHorse.get(log.horse_id) ?? "Horse",
      }));
    }
  } else if (primaryBarn) {
    const barnId = primaryBarn.id;
    const [horsesRes, keysRes, pendingRes, horseIdsForActivity] = await Promise.all([
      supabase
        .from("horses")
        .select("id, name, barn_name, primary_name_pref, photo_url, breed, sex, color, updated_at")
        .eq("barn_id", barnId)
        .order("name", { ascending: true })
        .limit(24),
      supabase
        .from("access_keys")
        .select("id", { count: "exact", head: true })
        .eq("barn_id", barnId)
        .eq("is_active", true),
      supabase
        .from("key_requests")
        .select("id", { count: "exact", head: true })
        .eq("barn_id", barnId)
        .eq("status", "pending"),
      supabase.from("horses").select("id").eq("barn_id", barnId),
    ]);

    horses = (horsesRes.data ?? []) as typeof horses;
    horseCount = horses.length;
    activeKeys = keysRes.count ?? 0;
    pendingRequests = pendingRes.count ?? 0;

    const ids = (horseIdsForActivity.data ?? []).map((r) => r.id);
    if (ids.length > 0) {
      const { data: logs } = await supabase
        .from("activity_log")
        .select("*")
        .in("horse_id", ids)
        .order("created_at", { ascending: false })
        .limit(5);

      const nameByHorse = new Map(horses.map((h) => [h.id, h.name]));
      recentActivity = (logs ?? []).map((log) => ({
        log: log as ActivityLog,
        horseName: nameByHorse.get(log.horse_id) ?? "Horse",
      }));
    }
  }

  // Fetch today's schedule for the TodayWidget
  let todayEvents: Awaited<ReturnType<typeof getTodayAndUpcoming>> = { today: [], upcoming: [] };
  if (primaryBarn) {
    todayEvents = await getTodayAndUpcoming(primaryBarn.id);
  }

  // Recent barn-level logs for the single-barn dashboard ribbon. Five
  // newest entries on barn_expenses scoped to the active barn. Only
  // fetched when a specific barn is active — the All Barns view has
  // its own layout and doesn't need this section.
  type DashboardBarnLog = {
    id: string;
    barn_id: string;
    performed_at: string;
    category: string;
    total_cost: number;
    vendor_name: string | null;
    description: string | null;
  };
  let recentBarnLogs: DashboardBarnLog[] = [];
  if (primaryBarn) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows } = await (supabase as any)
      .from("barn_expenses")
      .select("id, barn_id, performed_at, category, total_cost, vendor_name, description")
      .eq("barn_id", primaryBarn.id)
      .order("performed_at", { ascending: false })
      .limit(5);
    recentBarnLogs = (rows ?? []) as DashboardBarnLog[];
  }

  // Fetch horses for each access barn (full barn access via Barn Key)
  const accessBarnHorses: Record<
    string,
    Pick<Horse, "id" | "name" | "barn_name" | "primary_name_pref" | "breed" | "photo_url">[]
  > = {};
  if (accessBarnIds.length > 0) {
    const { data: allAccessHorses } = await supabase
      .from("horses")
      .select("id, name, barn_name, primary_name_pref, breed, photo_url, barn_id")
      .in("barn_id", accessBarnIds)
      .order("name", { ascending: true });

    for (const h of allAccessHorses ?? []) {
      const bid = (h as { barn_id: string }).barn_id;
      if (!accessBarnHorses[bid]) accessBarnHorses[bid] = [];
      accessBarnHorses[bid].push(h);
    }
  }

  // Stall-key grants — each row is "this user has access to this specific
  // horse." Unlike barn-key access, we do NOT pull the whole barn's horse
  // list. We show only the specific horse(s) the user holds stall keys to.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stallAccessRows } = await (supabase as any)
    .from("user_horse_access")
    .select("horse_id, permission_level, allowed_log_types")
    .eq("user_id", user.id);
  const stallRows = (stallAccessRows ?? []) as Array<{
    horse_id: string;
    permission_level: string | null;
    allowed_log_types: string[] | null;
  }>;
  const stallHorseIds = stallRows.map((r) => r.horse_id);
  type StallHorse = {
    id: string;
    name: string;
    breed: string | null;
    photo_url: string | null;
    barn_id: string;
    /** barns.name — the owning barn's name (shown as "at {barn_name}" in the stall-key card) */
    barn_name: string;
    permission_level: string | null;
  };
  const stallHorses: StallHorse[] = [];
  if (stallHorseIds.length > 0) {
    const { data: stallHorseRows } = await supabase
      .from("horses")
      .select("id, name, barn_name, primary_name_pref, breed, photo_url, barn_id")
      .in("id", stallHorseIds)
      .eq("archived", false)
      .order("name", { ascending: true });
    const stallBarnIds = [
      ...new Set((stallHorseRows ?? []).map((h) => h.barn_id)),
    ];
    const barnNameMap: Record<string, string> = {};
    if (stallBarnIds.length > 0) {
      const { data: stallBarns } = await supabase
        .from("barns")
        .select("id, name")
        .in("id", stallBarnIds);
      for (const b of (stallBarns ?? []) as { id: string; name: string }[]) {
        barnNameMap[b.id] = b.name;
      }
    }
    const permMap = new Map(
      stallRows.map((r) => [r.horse_id, r.permission_level]),
    );
    for (const h of (stallHorseRows ?? []) as {
      id: string;
      name: string;
      breed: string | null;
      photo_url: string | null;
      barn_id: string;
    }[]) {
      stallHorses.push({
        ...h,
        barn_name: barnNameMap[h.barn_id] ?? "Barn",
        permission_level: permMap.get(h.id) ?? null,
      });
    }
  }

  // Expiring-soon documents across the user's accessible barns.
  const allAccessibleBarnIds = [
    ...(ownedBarns ?? []).map((b) => b.id),
    ...accessBarns.map((b) => b.id),
  ];
  const in30Iso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const todayIso = new Date().toISOString().slice(0, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: expiringRaw } = allAccessibleBarnIds.length > 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (supabase as any)
        .from("horse_documents")
        .select("id, horse_id, barn_id, document_type, title, expiration_date")
        .in("barn_id", allAccessibleBarnIds)
        .not("expiration_date", "is", null)
        .lte("expiration_date", in30Iso)
        .order("expiration_date", { ascending: true })
        .limit(10)
    : { data: [] };
  const expiringDocs = ((expiringRaw ?? []) as Array<{
    id: string;
    horse_id: string;
    barn_id: string;
    document_type: string;
    title: string | null;
    expiration_date: string;
  }>).map((d) => ({ ...d, expired: d.expiration_date < todayIso }));

  // Lookup horse names for display.
  const expiringHorseIds = [...new Set(expiringDocs.map((d) => d.horse_id))];
  const horseNameMap: Record<string, string> = {};
  if (expiringHorseIds.length > 0) {
    const { data: hrs } = await supabase
      .from("horses")
      .select("id, name")
      .in("id", expiringHorseIds);
    for (const h of (hrs ?? []) as { id: string; name: string }[]) {
      horseNameMap[h.id] = h.name;
    }
  }

  // ── Loggable horses for the dashboard "Add Log" modal ──
  // Scoped to the active-barn context so the picker matches what the
  // dashboard is showing:
  //   • single-barn view → only horses in that barn (plus stall-key
  //     horses that happen to live in that barn)
  //   • All Barns view  → horses across every owned/access barn (plus
  //     all stall-key horses)
  // view_only stall keys are excluded — they can't create logs.
  // Server-side createLogAction re-checks via canUserLogOnHorse, so
  // this list is best-effort: worst case is a horse appears in the
  // picker and the form rejects on submit.
  const allAccessibleBarnIdsForLog = primaryBarn
    ? [primaryBarn.id]
    : [
        ...((ownedBarns ?? []) as Barn[]).map((b) => b.id),
        ...accessBarns.map((b) => b.id),
      ];
  type LoggableHorse = {
    id: string;
    name: string;
    photo_url: string | null;
    barn_name: string | null;
    /** null = all log types allowed; array = restricted (stall-key custom permission) */
    allowed_log_types: string[] | null;
  };
  const loggableHorseMap = new Map<string, LoggableHorse>();
  if (allAccessibleBarnIdsForLog.length > 0) {
    const { data: barnHorses } = await supabase
      .from("horses")
      .select("id, name, photo_url, barn_name, barn_id")
      .in("barn_id", allAccessibleBarnIdsForLog)
      .eq("archived", false)
      .order("name", { ascending: true })
      .limit(500);
    for (const h of (barnHorses ?? []) as Array<{
      id: string;
      name: string;
      photo_url: string | null;
      barn_name: string | null;
    }>) {
      loggableHorseMap.set(h.id, {
        id: h.id,
        name: h.name,
        photo_url: h.photo_url,
        barn_name: h.barn_name,
        allowed_log_types: null,
      });
    }
  }
  // Add stall-only horses (those whose barn isn't in the accessible
  // set) — barn-key access overrides stall-key restrictions, so we
  // skip stall horses already covered above. In single-barn mode, also
  // restrict to stall horses living in the active barn so the picker
  // matches what the dashboard is showing.
  for (const sh of stallHorses) {
    if (loggableHorseMap.has(sh.id)) continue;
    if (primaryBarn && sh.barn_id !== primaryBarn.id) continue;
    const lvl = (sh.permission_level ?? "").toLowerCase();
    if (lvl === "view_only") continue;
    const stallRow = stallRows.find((r) => r.horse_id === sh.id);
    const restricted =
      lvl === "custom" ? stallRow?.allowed_log_types ?? [] : null;
    loggableHorseMap.set(sh.id, {
      id: sh.id,
      name: sh.name,
      photo_url: sh.photo_url,
      barn_name: sh.barn_name,
      allowed_log_types: restricted,
    });
  }
  const loggableHorses = [...loggableHorseMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  // Compute effective capacity for the primary barn + build userBarns list
  // for the StallPurchaseFlow (owner-only barns). For the All Barns view
  // we need capacity + horse counts across *every* barn the user has any
  // relationship to (owned or access), so the "All Barns" dashboard can
  // render one card per barn with a capacity bar.
  const ownedBarnIds = (ownedBarns ?? []).map((b) => b.id);
  const allUserBarnIds = allUserBarns.map((b) => b.id);
  const capacityMap = await getEffectiveCapacityMap(supabase, allUserBarnIds);

  // Horse counts per barn — one query across the full set covers both
  // the owner-only StallPurchaseFlow list and the All Barns overview.
  const { data: horseCountRows } = allUserBarnIds.length
    ? await supabase
        .from("horses")
        .select("barn_id")
        .in("barn_id", allUserBarnIds)
        .eq("archived", false)
    : { data: [] as Array<{ barn_id: string }> };
  const hcByBarn = new Map<string, number>();
  for (const r of (horseCountRows ?? []) as Array<{ barn_id: string }>) {
    hcByBarn.set(r.barn_id, (hcByBarn.get(r.barn_id) ?? 0) + 1);
  }

  const userBarnOptions = (ownedBarns ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    horseCount: hcByBarn.get(b.id) ?? 0,
    effectiveCapacity: capacityMap.get(b.id) ?? (b.base_stalls ?? 0),
  }));

  const primaryBarnEffectiveCapacity = primaryBarn
    ? capacityMap.get(primaryBarn.id) ?? (primaryBarn.base_stalls ?? 0)
    : 0;

  // All Barns overview: one card per barn. Service barns don't have
  // meaningful capacity semantics (stored as 999); the card renders
  // just the horse count in that case. Owned + access barns are both
  // included; an isOwner flag lets the UI tag them differently.
  const allBarnsOverview = isAllBarns
    ? allUserBarns.map((b) => ({
        id: b.id,
        name: b.name,
        barn_type: b.barn_type,
        plan_tier: b.plan_tier,
        horseCount: hcByBarn.get(b.id) ?? 0,
        effectiveCapacity: capacityMap.get(b.id) ?? (b.base_stalls ?? 0),
        isOwner: ownedBarnIds.includes(b.id),
      }))
    : [];

  // Module access (Breeders Pro + Business Pro) for the dashboard
  // premium section.
  const [breedersAccess, businessAccess, onboardingState] = await Promise.all([
    getModuleAccess(supabase, user.id, "breeders_pro"),
    getModuleAccess(supabase, user.id, "business_pro"),
    getOnboardingState(supabase, user.id),
  ]);

  // Core onboarding wants the user's owned barn (the one auto-created at
  // signup) so step 1 can rename it rather than creating a second. If
  // there's no barn yet — rare but possible — the wizard step 1 will
  // error and point the user to /barn/new.
  const coreOnboardingBarn =
    (ownedBarns ?? [])[0]
      ? { id: (ownedBarns ?? [])[0].id, name: (ownedBarns ?? [])[0].name }
      : null;

  return (
    <DashboardTabs
      ownedBarns={(ownedBarns ?? []) as Barn[]}
      accessBarns={accessBarns}
      accessBarnHorses={accessBarnHorses}
      primaryBarn={primaryBarn as Barn | null}
      primaryBarnEffectiveCapacity={primaryBarnEffectiveCapacity}
      userBarnOptions={userBarnOptions}
      horses={horses}
      horseCount={horseCount}
      activeKeys={activeKeys}
      pendingRequests={pendingRequests}
      recentActivity={recentActivity}
      todayEvents={todayEvents.today}
      upcomingEvents={todayEvents.upcoming}
      expiringDocuments={expiringDocs.map((d) => ({
        ...d,
        horse_name: horseNameMap[d.horse_id] ?? "Unknown horse",
      }))}
      stallHorses={stallHorses}
      breedersAccess={breedersAccess}
      businessAccess={businessAccess}
      onboardingState={onboardingState}
      coreOnboardingBarn={coreOnboardingBarn}
      allBarnsOverview={allBarnsOverview}
      recentBarnLogs={recentBarnLogs}
      loggableHorses={loggableHorses}
    />
  );
}
