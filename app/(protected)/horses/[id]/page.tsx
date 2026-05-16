import { canUserAccessHorse, canUserEditHorse, canUserEditHorseProfile } from "@/lib/horse-access";
import { normalizePermissionLevel, type PermissionLevel } from "@/lib/key-permissions";
import { canUserUseDocumentScanner } from "@/lib/document-scanner/access";
import { createServerComponentClient } from "@/lib/supabase-server";
import type { ActivityLog, Embryo, Flush, Foaling, HealthRecord, Horse, HorseStay, LogMedia, LogEntryLineItem, Pregnancy } from "@/lib/types";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { HorseProfileClient } from "./HorseProfileClient";
import { QuickRecordProfile } from "@/components/service-barn/QuickRecordProfile";
import { AutoLinkBanner } from "@/components/service-barn/AutoLinkBanner";
import { computeHorseCompleteness } from "@/lib/engagement/horse-completeness";

async function getOrigin(): Promise<string> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) return siteUrl.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export default async function HorseProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; error?: string; linkPrompt?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab ?? "overview";
  const linkPromptBarnId = sp.linkPrompt?.trim();

  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const ok = await canUserAccessHorse(supabase, user.id, id);
  if (!ok) redirect("/horses");

  const { data: horseRaw, error: horseErr } = await supabase
    .from("horses")
    .select("*")
    .eq("id", id)
    .single();

  if (horseErr || !horseRaw) notFound();

  const horse = horseRaw as Horse;

  // If the user just redeemed a Stall Key and they own a Service Barn,
  // /join/actions.ts tacks on a ?linkPrompt=<serviceBarnId> querystring
  // to invite auto-linking this horse. Validate the querystring against
  // an actual service-type barn the user owns before rendering the
  // banner — don't trust it blindly.
  let autoLinkBanner: { serviceBarnId: string; serviceBarnName: string } | null = null;
  if (linkPromptBarnId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: serviceBarn } = await (supabase as any)
      .from("barns")
      .select("id, name, owner_id, barn_type")
      .eq("id", linkPromptBarnId)
      .maybeSingle();
    if (
      serviceBarn &&
      serviceBarn.owner_id === user.id &&
      serviceBarn.barn_type === "service"
    ) {
      // Don't show the banner if the horse is already linked.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingLink } = await (supabase as any)
        .from("service_barn_links")
        .select("id")
        .eq("service_barn_id", serviceBarn.id)
        .eq("horse_id", horse.id)
        .maybeSingle();
      if (!existingLink) {
        autoLinkBanner = {
          serviceBarnId: serviceBarn.id as string,
          serviceBarnName: serviceBarn.name as string,
        };
      }
    }
  }

  // Quick records (Service Barn) short-circuit into a simplified single-
  // page profile. They skip the full Horse Profile (documents, health
  // tabs, breeding, etc. — none of which apply). We still pull the
  // activity log below, but the QuickRecordProfile only uses a slice.
  if (horse.is_quick_record) {
    const [{ data: activityLogs }, { data: healthRecords }] = await Promise.all([
      supabase
        .from("activity_log")
        .select("*")
        .eq("horse_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("health_records")
        .select("*")
        .eq("horse_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    const canEditQuick = horse.barn_id
      ? await canUserEditHorseProfile(supabase, user.id, horse.barn_id)
      : false;
    return (
      <QuickRecordProfile
        horse={horse}
        canEdit={canEditQuick}
        activityLogs={(activityLogs ?? []) as ActivityLog[]}
        healthRecords={(healthRecords ?? []) as HealthRecord[]}
      />
    );
  }

  const canEdit = await canUserEditHorse(supabase, user.id, horse.barn_id);
  // Horse PROFILE edits (name/breed/photo/etc.) are owner-only — a hard rule
  // that supersedes key permissions.
  const canEditProfile = await canUserEditHorseProfile(
    supabase,
    user.id,
    horse.barn_id,
  );

  // Resolve the user's permission context for this horse: read permission_level
  // and allowed_log_types from whichever grant applies (barn_members for barn
  // keys, user_horse_access for stall keys). Owner gets "log_all" by default.
  let permissionLevel: PermissionLevel | null = null;
  let allowedLogTypes: string[] | null = null;
  if (canEditProfile) {
    permissionLevel = "log_all";
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [{ data: bmRow }, { data: uhaRow }] = await Promise.all([
      (supabase as any)
        .from("barn_members")
        .select("permission_level, allowed_log_types")
        .eq("barn_id", horse.barn_id)
        .eq("user_id", user.id)
        .maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("user_horse_access")
        .select("permission_level, allowed_log_types")
        .eq("horse_id", id)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    // Pick the more permissive of the two grants (lower priority = more perm).
    const order: Record<string, number> = {
      full_contributor: 1,
      log_all: 2,
      custom: 3,
      view_only: 4,
    };
    const bmLevel = normalizePermissionLevel(bmRow?.permission_level ?? null);
    const uhaLevel = normalizePermissionLevel(uhaRow?.permission_level ?? null);
    const bmPr = bmLevel ? order[bmLevel] ?? 99 : 99;
    const uhaPr = uhaLevel ? order[uhaLevel] ?? 99 : 99;
    if (bmPr <= uhaPr && bmLevel) {
      permissionLevel = bmLevel;
      allowedLogTypes = (bmRow?.allowed_log_types as string[] | null) ?? null;
    } else if (uhaLevel) {
      permissionLevel = uhaLevel;
      allowedLogTypes = (uhaRow?.allowed_log_types as string[] | null) ?? null;
    }
  }

  // Check Breeders Pro / Business Pro subscriptions for gated tabs
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("has_breeders_pro, has_business_pro")
    .eq("id", user.id)
    .maybeSingle();
  const hasBreedersPro = profileRow?.has_breeders_pro === true;
  const hasBusinessPro = profileRow?.has_business_pro === true;

  // Document Scanner access — profile flag OR paid/comped barn.
  const hasDocumentScanner = await canUserUseDocumentScanner(
    supabase,
    user.id,
    horse.barn_id,
  );

  // Fetch horse documents (only if the user has scanner access — otherwise
  // the tab isn't shown and the data is never rendered).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: horseDocsRaw } = hasDocumentScanner
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (supabase as any)
        .from("horse_documents")
        .select(
          "id, document_type, title, file_name, file_size_bytes, mime_type, scan_confidence, document_date, expiration_date, created_at",
        )
        .eq("horse_id", id)
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: [] };
  const horseDocuments = (horseDocsRaw ?? []) as Array<{
    id: string;
    document_type:
      | "coggins"
      | "registration"
      | "health_certificate"
      | "vet_record"
      | "other";
    title: string | null;
    file_name: string;
    file_size_bytes: number;
    mime_type: string;
    scan_confidence: "high" | "medium" | "low" | null;
    document_date: string | null;
    expiration_date: string | null;
    created_at: string;
  }>;

  const [{ data: activities }, { data: healthRows }, { data: shoeingRows }, { data: wormingRows }] =
    await Promise.all([
      supabase
        .from("activity_log")
        .select("*")
        .eq("horse_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("health_records")
        .select("*")
        .eq("horse_id", id)
        .order("record_date", { ascending: false }),
      supabase
        .from("health_records")
        .select("*")
        .eq("horse_id", id)
        .eq("record_type", "shoeing")
        .order("record_date", { ascending: false })
        .limit(1),
      supabase
        .from("health_records")
        .select("*")
        .eq("horse_id", id)
        .eq("record_type", "worming")
        .order("record_date", { ascending: false })
        .limit(1),
    ]);

  const lastShoeing = (shoeingRows?.[0] as HealthRecord) ?? null;
  const lastWorming = (wormingRows?.[0] as HealthRecord) ?? null;

  const { data: barnMembers } = await supabase
    .from("barn_members")
    .select("user_id, role")
    .eq("barn_id", horse.barn_id);

  const memberIds = [...new Set((barnMembers ?? []).map((m) => m.user_id))];
  let memberProfiles: { id: string; full_name: string | null }[] = [];
  if (memberIds.length > 0) {
    const { data: mp } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", memberIds);
    memberProfiles = mp ?? [];
  }

  const nameByUser = new Map(
    memberProfiles.map((p) => [p.id, p.full_name?.trim() || "Member"]),
  );

  const accessRows: { label: string; sub: string; kind: string }[] = [];

  for (const m of barnMembers ?? []) {
    accessRows.push({
      label: nameByUser.get(m.user_id) ?? "Member",
      sub: m.role,
      kind: "Barn membership",
    });
  }

  const { data: stallAccess } = await supabase
    .from("user_horse_access")
    .select("user_id")
    .eq("horse_id", id);

  const stallIds = [...new Set((stallAccess ?? []).map((s) => s.user_id))];
  if (stallIds.length) {
    const { data: stallProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", stallIds);

    const stallMap = new Map(
      (stallProfiles ?? []).map((p) => [p.id, p.full_name?.trim() || "Member"]),
    );

    for (const uid of stallIds) {
      if ((barnMembers ?? []).some((m) => m.user_id === uid)) continue;
      accessRows.push({
        label: stallMap.get(uid) ?? "Member",
        sub: "Stall key",
        kind: "Individual access",
      });
    }
  }

  // Fetch active stay for this horse
  const { data: activeStayRaw } = await supabase
    .from("horse_stays")
    .select("*")
    .eq("horse_id", id)
    .eq("status", "active")
    .maybeSingle();
  const activeStay = (activeStayRaw as HorseStay) ?? null;

  // Fetch log media
  const actIds = (activities ?? []).map((a) => (a as ActivityLog).id);
  const healthIds = (healthRows ?? []).map((h) => (h as HealthRecord).id);
  const allLogIds = [...actIds, ...healthIds];
  let logMedia: LogMedia[] = [];
  if (allLogIds.length > 0) {
    const { data: mediaRaw } = await supabase
      .from("log_media")
      .select("*")
      .in("log_id", allLogIds);
    logMedia = (mediaRaw ?? []) as LogMedia[];
  }

  // Fetch line items for all logs
  let logLineItems: LogEntryLineItem[] = [];
  if (allLogIds.length > 0) {
    const { data: liRaw } = await supabase
      .from("log_entry_line_items")
      .select("*")
      .in("log_id", allLogIds)
      .order("sort_order", { ascending: true });
    logLineItems = (liRaw ?? []) as LogEntryLineItem[];
  }

  // Build user name and barn name lookup maps for provenance
  const allUserIds = new Set<string>();
  const allBarnIds = new Set<string>();
  for (const a of (activities ?? []) as ActivityLog[]) {
    if (a.logged_by) allUserIds.add(a.logged_by);
    if (a.logged_at_barn_id) allBarnIds.add(a.logged_at_barn_id);
  }
  for (const h of (healthRows ?? []) as HealthRecord[]) {
    if (h.logged_by) allUserIds.add(h.logged_by);
    if (h.logged_at_barn_id) allBarnIds.add(h.logged_at_barn_id);
  }
  if (activeStay) allBarnIds.add(activeStay.host_barn_id);

  const userNames: Record<string, string> = {};
  if (allUserIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", [...allUserIds]);
    for (const p of profiles ?? []) {
      userNames[p.id] = p.full_name?.trim() || "Member";
    }
  }

  const barnNames: Record<string, string> = {};
  if (allBarnIds.size > 0) {
    const { data: barns } = await supabase
      .from("barns")
      .select("id, name")
      .in("id", [...allBarnIds]);
    for (const b of barns ?? []) {
      barnNames[b.id] = b.name;
    }
  }

  // Fetch all barns user has access to (for "Move to Barn")
  const { data: userOwnedBarns } = await supabase
    .from("barns")
    .select("id, name")
    .eq("owner_id", user.id);
  const { data: userMemberships } = await supabase
    .from("barn_members")
    .select("barn_id")
    .eq("user_id", user.id)
    .or("status.eq.active,status.is.null");
  const memberBarnIds = (userMemberships ?? [])
    .map((m) => m.barn_id)
    .filter((bid) => !(userOwnedBarns ?? []).some((b) => b.id === bid));
  let memberBarnsForMove: { id: string; name: string }[] = [];
  if (memberBarnIds.length > 0) {
    const { data: mBarns } = await supabase
      .from("barns")
      .select("id, name")
      .in("id", memberBarnIds);
    memberBarnsForMove = (mBarns ?? []) as { id: string; name: string }[];
  }
  const allBarnsForMove = [
    ...((userOwnedBarns ?? []) as { id: string; name: string }[]),
    ...memberBarnsForMove,
  ];

  // Fetch barn stallions for flush form
  const { data: stallionHorses } = await supabase
    .from("horses")
    .select("id, name")
    .eq("barn_id", horse.barn_id)
    .eq("archived", false)
    .in("breeding_role", ["stallion", "multiple"]);
  const barnStallions = (stallionHorses ?? []) as { id: string; name: string }[];

  // Fetch breeding data if horse has a breeding role
  let donorFlushes: Flush[] = [];
  let surrogatePregnancies: Pregnancy[] = [];
  let stallionFlushes: Flush[] = [];
  let stallionPregnancies: Pregnancy[] = [];
  const breedingHorseNames: Record<string, string> = {};

  let donorPregnancies: Pregnancy[] = [];

  if (horse.breeding_role === "donor" || horse.breeding_role === "multiple") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: flushRaw, error: flushErr } = await (supabase as any)
      .from("flushes")
      .select("*")
      .eq("donor_horse_id", id)
      .order("flush_date", { ascending: false });
    if (flushErr) console.error("[BREEDING] donor flushes error:", flushErr);
    donorFlushes = (flushRaw ?? []) as Flush[];

    // Pregnancies where this horse is the donor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: donorPregRaw, error: donorPregErr } = await (supabase as any)
      .from("pregnancies")
      .select("*")
      .eq("donor_horse_id", id)
      .order("transfer_date", { ascending: false });
    if (donorPregErr) console.error("[BREEDING] donor pregnancies error:", donorPregErr);
    donorPregnancies = (donorPregRaw ?? []) as Pregnancy[];

    // Collect horse IDs for name lookup
    const donorHorseIds = new Set<string>();
    for (const p of donorPregnancies) {
      if (p.surrogate_horse_id) donorHorseIds.add(p.surrogate_horse_id);
      if (p.stallion_horse_id) donorHorseIds.add(p.stallion_horse_id);
    }
    if (donorHorseIds.size > 0) {
      const { data: dHorses } = await supabase
        .from("horses")
        .select("id, name")
        .in("id", [...donorHorseIds]);
      for (const h of dHorses ?? []) {
        breedingHorseNames[h.id] = h.name;
      }
    }
  }

  if (horse.breeding_role === "recipient" || horse.breeding_role === "multiple") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pregRaw } = await (supabase as any)
      .from("pregnancies")
      .select("*")
      .eq("surrogate_horse_id", id)
      .order("transfer_date", { ascending: false });
    surrogatePregnancies = (pregRaw ?? []) as Pregnancy[];

    // Fetch donor names for pregnancies
    const pregHorseIds = new Set<string>();
    for (const p of surrogatePregnancies) {
      if (p.donor_horse_id) pregHorseIds.add(p.donor_horse_id);
      if (p.stallion_horse_id) pregHorseIds.add(p.stallion_horse_id);
    }
    if (pregHorseIds.size > 0) {
      const { data: pregHorses } = await supabase
        .from("horses")
        .select("id, name")
        .in("id", [...pregHorseIds]);
      for (const h of pregHorses ?? []) {
        breedingHorseNames[h.id] = h.name;
      }
    }
  }

  if (horse.breeding_role === "stallion" || horse.breeding_role === "multiple") {
    // Flushes where this horse was the stallion
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sFlushRaw } = await (supabase as any)
      .from("flushes")
      .select("*")
      .eq("stallion_horse_id", id)
      .order("flush_date", { ascending: false });
    stallionFlushes = (sFlushRaw ?? []) as Flush[];

    // Pregnancies where this horse was the sire
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sPregRaw } = await (supabase as any)
      .from("pregnancies")
      .select("*")
      .eq("stallion_horse_id", id)
      .order("transfer_date", { ascending: false });
    stallionPregnancies = (sPregRaw ?? []) as Pregnancy[];

    // Collect horse IDs for name lookup
    const stallionHorseIds = new Set<string>();
    for (const f of stallionFlushes) {
      if (f.donor_horse_id) stallionHorseIds.add(f.donor_horse_id);
    }
    for (const p of stallionPregnancies) {
      if (p.donor_horse_id) stallionHorseIds.add(p.donor_horse_id);
      if (p.surrogate_horse_id) stallionHorseIds.add(p.surrogate_horse_id);
    }
    if (stallionHorseIds.size > 0) {
      const { data: sHorses } = await supabase
        .from("horses")
        .select("id, name")
        .in("id", [...stallionHorseIds]);
      for (const h of sHorses ?? []) {
        breedingHorseNames[h.id] = h.name;
      }
    }
  }

  // Fetch foal origin data if this horse was born through the system
  let foalOriginData: {
    foaling: Foaling;
    pregnancy: Pregnancy;
    embryo: Embryo | null;
    flush: Flush | null;
    horseNames: Record<string, string>;
  } | null = null;

  {
    // Always check if this horse was born through the breeding system
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: foalingRaw, error: foalingErr } = await (supabase as any)
      .from("foalings")
      .select("*")
      .eq("foal_horse_id", id)
      .maybeSingle();
    if (foalingErr) console.error("[BREEDING] foaling lookup error:", foalingErr);
    console.log("[BREEDING] foal origin check for horse", id, "foaling found:", !!foalingRaw);

    if (foalingRaw) {
      const foaling = foalingRaw as Foaling;

      // Get the pregnancy
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pregRaw, error: pregErr } = await (supabase as any)
        .from("pregnancies")
        .select("*")
        .eq("id", foaling.pregnancy_id)
        .maybeSingle();
      if (pregErr) console.error("[BREEDING] pregnancy lookup error:", pregErr);

      if (pregRaw) {
        const pregnancy = pregRaw as Pregnancy;

        // Get the embryo
        let embryo: Embryo | null = null;
        if (pregnancy.embryo_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: embryoRaw } = await (supabase as any)
            .from("embryos")
            .select("*")
            .eq("id", pregnancy.embryo_id)
            .maybeSingle();
          embryo = (embryoRaw as Embryo) ?? null;
        }

        // Get the flush
        let flush: Flush | null = null;
        if (embryo?.flush_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: flushRaw } = await (supabase as any)
            .from("flushes")
            .select("*")
            .eq("id", embryo.flush_id)
            .maybeSingle();
          flush = (flushRaw as Flush) ?? null;
        }

        // Collect horse names for the timeline
        const originHorseIds = new Set<string>();
        if (pregnancy.donor_horse_id) originHorseIds.add(pregnancy.donor_horse_id);
        if (pregnancy.stallion_horse_id) originHorseIds.add(pregnancy.stallion_horse_id);
        if (foaling.surrogate_horse_id) originHorseIds.add(foaling.surrogate_horse_id);

        const originHorseNames: Record<string, string> = {};
        if (originHorseIds.size > 0) {
          const { data: oHorses } = await supabase
            .from("horses")
            .select("id, name")
            .in("id", [...originHorseIds]);
          for (const h of oHorses ?? []) {
            originHorseNames[h.id] = h.name;
          }
        }

        foalOriginData = { foaling, pregnancy, embryo, flush, horseNames: originHorseNames };
      }
    }
  }

  // Fetch sibling horses for prev/next navigation
  const { data: siblingHorses } = await supabase
    .from("horses")
    .select("id, name")
    .eq("barn_id", horse.barn_id)
    .eq("archived", false)
    .order("name", { ascending: true });

  const siblings = (siblingHorses ?? []) as { id: string; name: string }[];
  const currentIndex = siblings.findIndex((h) => h.id === id);
  const prevHorse = currentIndex > 0 ? siblings[currentIndex - 1] : null;
  const nextHorse = currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;

  const origin = await getOrigin();
  const profileUrl = `${origin}/horses/${horse.id}`;
  const careUrl = `${origin}/care/${horse.id}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(careUrl)}`;

  return (
    <Suspense fallback={<div className="px-4 py-16 text-center text-barn-dark/70">Loading…</div>}>
      {autoLinkBanner && (
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6">
          <AutoLinkBanner
            horseId={horse.id}
            horseName={horse.name}
            serviceBarnId={autoLinkBanner.serviceBarnId}
            serviceBarnName={autoLinkBanner.serviceBarnName}
          />
        </div>
      )}
      <HorseProfileClient
        horse={horse}
        canEdit={canEdit}
        initialTab={tab}
        completeness={computeHorseCompleteness({
          horse,
          hasAnyEntry:
            ((activities ?? []) as unknown[]).length > 0 ||
            ((healthRows ?? []) as unknown[]).length > 0,
          hasCurrentCoggins: (() => {
            const today = new Date().toISOString().slice(0, 10);
            return horseDocuments.some(
              (d) =>
                /coggins/i.test(d.document_type) &&
                d.expiration_date != null &&
                d.expiration_date >= today,
            );
          })(),
          hasRegistrationPapers: horseDocuments.some(
            (d) => d.document_type === "registration",
          ),
        })}
        activities={(activities ?? []) as ActivityLog[]}
        healthRows={(healthRows ?? []) as HealthRecord[]}
        accessRows={accessRows}
        profileUrl={profileUrl}
        qrSrc={qrSrc}
        listError={sp.error}
        lastShoeing={lastShoeing}
        lastWorming={lastWorming}
        activeStay={activeStay}
        logMedia={logMedia}
        lineItems={logLineItems}
        userNames={userNames}
        barnNames={barnNames}
        allBarns={allBarnsForMove}
        prevHorse={prevHorse}
        nextHorse={nextHorse}
        barnStallions={barnStallions}
        donorFlushes={donorFlushes}
        donorPregnancies={donorPregnancies}
        surrogatePregnancies={surrogatePregnancies}
        stallionFlushes={stallionFlushes}
        stallionPregnancies={stallionPregnancies}
        breedingHorseNames={breedingHorseNames}
        foalOriginData={foalOriginData}
        hasBreedersPro={hasBreedersPro}
        hasBusinessPro={hasBusinessPro}
        hasDocumentScanner={hasDocumentScanner}
        horseDocuments={horseDocuments}
        canEditProfile={canEditProfile}
        permissionLevel={permissionLevel}
        allowedLogTypes={allowedLogTypes}
      />
    </Suspense>
  );
}
