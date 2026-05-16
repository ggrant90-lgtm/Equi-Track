"use client";

import { updateHorseAction, deleteHorseAction } from "@/app/(protected)/actions/horse";
import { deleteLogAction } from "@/app/(protected)/actions/delete-log";
import { moveHorseAction } from "@/app/(protected)/actions/move-horse";
import type { FoalOriginData } from "@/components/embryo/FoalOriginTimeline";
import { ActivityEntry } from "@/components/ActivityEntry";
import { CareCard } from "@/components/CareCard";
import { HealthRecordItem } from "@/components/HealthRecord";
import { HorsePhoto } from "@/components/HorsePhoto";
import { LogDetailModal } from "@/components/LogDetailModal";
import { LogFilters } from "@/components/LogFilters";
import { Button, linkButtonClass } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { HORSE_SEX_OPTIONS, BREEDING_ROLES, BREEDING_ROLE_LABELS } from "@/lib/horse-form-constants";
import { BreedSelect } from "@/components/horse/BreedSelect";
import { getHorseDisplayName, getHorseSecondaryName } from "@/lib/horse-name";
import { uploadHorseProfilePhoto } from "@/lib/horse-photo";
import { LogSummaryBar } from "@/components/LogSummaryBar";
import { HorseCompletenessBar } from "@/components/engagement/HorseCompletenessBar";
import { DocumentsTab } from "./DocumentsTab";
import type { ActivityLog, Flush, HealthRecord, Horse, HorseStay, LogMedia, LogEntryLineItem, Pregnancy } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

const baseTabItems = [
  { id: "overview", label: "Overview" },
  { id: "logs", label: "Logs" },
  { id: "documents", label: "Documents" },
  { id: "breeding", label: "Breeding" },
  { id: "financials", label: "Financials" },
  { id: "access", label: "Access" },
] as const;

type TabId =
  | "overview"
  | "logs"
  | "documents"
  | "breeding"
  | "financials"
  | "access";

const ALL_LOG_TYPES = [
  { value: "exercise", label: "Exercise" },
  { value: "pony", label: "Pony" },
  { value: "feed", label: "Feed" },
  { value: "medication", label: "Medication" },
  { value: "note", label: "Note" },
  { value: "breed_data", label: "Breed Data" },
  { value: "shoeing", label: "Shoeing" },
  { value: "worming", label: "Worming" },
  { value: "vet_visit", label: "Vet Visit" },
  { value: "dentistry", label: "Dentistry" },
] as const;

export function HorseProfileClient({
  horse,
  canEdit,
  initialTab,
  completeness,
  activities,
  healthRows,
  accessRows,
  profileUrl,
  qrSrc,
  listError,
  lastShoeing,
  lastWorming,
  activeStay,
  logMedia,
  lineItems,
  userNames,
  barnNames,
  allBarns,
  prevHorse,
  nextHorse,
  barnStallions,
  donorFlushes,
  donorPregnancies,
  surrogatePregnancies,
  stallionFlushes,
  stallionPregnancies,
  breedingHorseNames,
  foalOriginData,
  hasBreedersPro,
  hasBusinessPro,
  hasDocumentScanner,
  horseDocuments,
  canEditProfile,
  permissionLevel,
  allowedLogTypes,
}: {
  horse: Horse;
  canEdit: boolean;
  initialTab: string;
  completeness: import("@/lib/engagement/horse-completeness").HorseCompletenessResult;
  activities: ActivityLog[];
  healthRows: HealthRecord[];
  accessRows: { label: string; sub: string; kind: string }[];
  profileUrl: string;
  qrSrc: string;
  listError?: string;
  lastShoeing?: HealthRecord | null;
  lastWorming?: HealthRecord | null;
  activeStay?: HorseStay | null;
  logMedia?: LogMedia[];
  lineItems?: LogEntryLineItem[];
  userNames?: Record<string, string>;
  barnNames?: Record<string, string>;
  allBarns?: { id: string; name: string }[];
  prevHorse?: { id: string; name: string } | null;
  nextHorse?: { id: string; name: string } | null;
  barnStallions?: { id: string; name: string }[];
  donorFlushes?: Flush[];
  donorPregnancies?: Pregnancy[];
  surrogatePregnancies?: Pregnancy[];
  stallionFlushes?: Flush[];
  stallionPregnancies?: Pregnancy[];
  breedingHorseNames?: Record<string, string>;
  foalOriginData?: FoalOriginData | null;
  hasBreedersPro?: boolean;
  hasBusinessPro?: boolean;
  hasDocumentScanner?: boolean;
  horseDocuments?: Array<{
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
  canEditProfile?: boolean;
  permissionLevel?:
    | "view_only"
    | "log_all"
    | "full_contributor"
    | "custom"
    | null;
  allowedLogTypes?: string[] | null;
}) {
  const router = useRouter();
  const { show } = useToast();
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedLog, setSelectedLog] = useState<{
    kind: "activity" | "health";
    entry: ActivityLog | HealthRecord;
  } | null>(null);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showFlushModal, setShowFlushModal] = useState(false);
  const [moving, setMoving] = useState(false);
  const [logTypeFilter, setLogTypeFilter] = useState<string | null>(null);
  const [logDateRange, setLogDateRange] = useState("all");
  const [showAddLogDropdown, setShowAddLogDropdown] = useState(false);
  const [showHeaderLogDropdown, setShowHeaderLogDropdown] = useState(false);
  const [confirmingDeleteHorse, setConfirmingDeleteHorse] = useState(false);
  const [deletingHorse, setDeletingHorse] = useState(false);

  // Only show breeding tab for Breeders Pro subscribers
  // Gate tabs by subscription: breeding → BP, financials → BusPro
  const tabItems = baseTabItems.filter((t) => {
    if (t.id === "breeding") return !!hasBreedersPro;
    if (t.id === "financials") return !!hasBusinessPro;
    if (t.id === "documents") return !!hasDocumentScanner;
    return true;
  });

  const tabParam = searchParams.get("tab");
  const tab: TabId = ((): TabId => {
    const raw = tabParam ?? initialTab;
    // Remap old tabs to "logs"
    if (raw === "activity" || raw === "health") return "logs";
    if (raw === "breeding" && hasBreedersPro) return "breeding";
    if (raw === "financials" && hasBusinessPro) return "financials";
    if (raw === "documents" && hasDocumentScanner) return "documents";
    if (raw === "overview" || raw === "logs" || raw === "access") return raw as TabId;
    return "overview";
  })();

  const setTab = useCallback(
    (next: string) => {
      const id = next as TabId;
      router.replace(`/horses/${horse.id}?tab=${id}`, { scroll: false });
    },
    [horse.id, router],
  );

  async function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !canEdit) return;
    const up = await uploadHorseProfilePhoto(horse.id, file);
    if ("error" in up) {
      show("We couldn't upload that photo. Try a smaller JPG or PNG.", "error");
      return;
    }
    const { error } = await supabase
      .from("horses")
      .update({ photo_url: up.publicUrl, updated_at: new Date().toISOString() })
      .eq("id", horse.id);
    if (error) {
      show("We couldn't save the photo. Please try again.", "error");
      return;
    }
    show("Photo updated.", "success");
    router.refresh();
  }

  async function handleSave() {
    if (!formRef.current) return;
    setSaving(true);
    const formData = new FormData(formRef.current);
    const result = await updateHorseAction(horse.id, formData);
    setSaving(false);
    if (result?.error) {
      show(result.error, "error");
    } else {
      show("Horse updated.", "success");
      setEditing(false);
      router.refresh();
    }
  }

  function handleCancel() {
    formRef.current?.reset();
    setEditing(false);
    setConfirmingDeleteHorse(false);
  }

  async function handleDeleteHorse(permanent: boolean = false) {
    setDeletingHorse(true);
    const result = await deleteHorseAction(horse.id, permanent);
    if (result?.error) {
      show(result.error, "error");
      setDeletingHorse(false);
      setConfirmingDeleteHorse(false);
    } else {
      show(
        permanent
          ? `${horse.name} and all associated data have been permanently deleted.`
          : `${horse.name} has been archived.`,
        "success",
      );
      router.push("/horses");
    }
  }

  async function handleMove(targetBarnId: string) {
    setMoving(true);
    const result = await moveHorseAction(horse.id, targetBarnId);
    setMoving(false);
    if (result?.error) {
      show(result.error, "error");
    } else {
      show("Horse moved successfully.", "success");
      setShowMoveModal(false);
      router.refresh();
    }
  }

  const otherBarns = useMemo(
    () => (allBarns ?? []).filter((b) => b.id !== horse.barn_id),
    [allBarns, horse.barn_id],
  );

  const filterByDate = useCallback((date: string, range: string) => {
    if (range === "all") return true;
    const d = new Date(date);
    const now = new Date();
    if (range === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return d >= weekAgo;
    }
    if (range === "month") {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (range === "year") {
      return d.getFullYear() === now.getFullYear();
    }
    return true;
  }, []);

  // Unified log entries: merge activities + health, sorted by date desc
  type UnifiedLog =
    | { kind: "activity"; entry: ActivityLog; date: string; type: string }
    | { kind: "health"; entry: HealthRecord; date: string; type: string };

  const allLogs = useMemo(() => {
    const logs: UnifiedLog[] = [
      ...activities.map((a) => ({
        kind: "activity" as const,
        entry: a,
        date: a.performed_at ?? a.created_at,
        type: a.activity_type,
      })),
      ...healthRows.map((h) => ({
        kind: "health" as const,
        entry: h,
        date: h.performed_at ?? h.record_date,
        type: h.record_type?.toLowerCase().replace(" ", "_") ?? "unknown",
      })),
    ];
    logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return logs;
  }, [activities, healthRows]);

  const allLogTypes = useMemo(
    () => [...new Set(allLogs.map((l) => l.type))],
    [allLogs],
  );

  // Count log types for sorting the "Add Log" dropdown by most used
  const logTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of allLogs) {
      counts[l.type] = (counts[l.type] ?? 0) + 1;
    }
    return counts;
  }, [allLogs]);

  // Filter log types by the user's permission level. Custom permissions
  // restrict to a specific set of types; view_only yields an empty list so
  // the "New Log" dropdown has nothing to show. Owner + log_all +
  // full_contributor see everything.
  const sortedLogTypes = useMemo(() => {
    let types = [...ALL_LOG_TYPES];
    if (permissionLevel === "custom") {
      const allowed = new Set(allowedLogTypes ?? []);
      types = types.filter((t) => allowed.has(t.value));
    } else if (permissionLevel === "view_only") {
      types = [];
    }
    return types.sort(
      (a, b) => (logTypeCounts[b.value] ?? 0) - (logTypeCounts[a.value] ?? 0),
    );
  }, [logTypeCounts, permissionLevel, allowedLogTypes]);

  // Can the user create any log entry at all?
  const canCreateAnyLog =
    permissionLevel !== "view_only" && sortedLogTypes.length > 0;

  const filteredLogs = useMemo(
    () =>
      allLogs.filter((l) => {
        if (logTypeFilter && l.type !== logTypeFilter) return false;
        return filterByDate(l.date, logDateRange);
      }),
    [allLogs, logTypeFilter, logDateRange, filterByDate],
  );

  const getMediaForLog = useCallback(
    (logType: "activity" | "health", logId: string) =>
      (logMedia ?? []).filter((m) => m.log_type === logType && m.log_id === logId),
    [logMedia],
  );

  const getLineItemsForLog = useCallback(
    (logType: "activity" | "health", logId: string) =>
      (lineItems ?? []).filter((li) => li.log_type === logType && li.log_id === logId),
    [lineItems],
  );

  const getPerformerInfo = useCallback(
    (entry: ActivityLog | HealthRecord) => {
      if (entry.performed_by_name) return { name: entry.performed_by_name, role: null };
      if (entry.performed_by_user_id && userNames?.[entry.performed_by_user_id]) {
        return { name: userNames[entry.performed_by_user_id], role: null };
      }
      return { name: null, role: null };
    },
    [userNames],
  );

  // Summary stats for filtered logs
  const logSummary = useMemo(() => {
    const totalCost = filteredLogs.reduce((s, l) => s + (l.entry.total_cost ?? 0), 0);
    const dates = filteredLogs.map((l) => l.date).filter(Boolean).sort();
    return {
      count: filteredLogs.length,
      totalCost: totalCost > 0 ? totalCost : null,
      dateRange: dates.length > 0 ? { earliest: dates[0], latest: dates[dates.length - 1] } : null,
    };
  }, [filteredLogs]);

  /** Fields are disabled unless user has permission AND is in edit mode */
  const fieldsDisabled = !editing;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <Link href="/horses" className="text-sm text-barn-dark/70 hover:text-brass-gold">
          ← Horses
        </Link>
        <div className="flex items-center gap-1">
          {prevHorse ? (
            <Link
              href={`/horses/${prevHorse.id}`}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-barn-dark/60 hover:bg-barn-dark/5 hover:text-barn-dark transition"
              title={prevHorse.name}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              <span className="hidden sm:inline max-w-[80px] truncate">{prevHorse.name}</span>
            </Link>
          ) : (
            <span className="w-8" />
          )}
          {nextHorse ? (
            <Link
              href={`/horses/${nextHorse.id}`}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-barn-dark/60 hover:bg-barn-dark/5 hover:text-barn-dark transition"
              title={nextHorse.name}
            >
              <span className="hidden sm:inline max-w-[80px] truncate">{nextHorse.name}</span>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </Link>
          ) : (
            <span className="w-8" />
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-3xl font-semibold text-barn-dark">
            {getHorseDisplayName(horse)}
          </h1>
          {getHorseSecondaryName(horse) && (
            <p className="text-sm text-barn-dark/60 italic">
              {getHorseSecondaryName(horse)}
            </p>
          )}
          <p className="text-sm text-barn-dark/55">{horse.breed ?? "Horse"}</p>
          <div className="mt-2 max-w-sm">
            <HorseCompletenessBar result={completeness} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editing && (canCreateAnyLog || canEditProfile) ? (
            <div className="flex items-center gap-2">
              {/* New Log button — hidden for view_only, filtered for custom */}
              {canCreateAnyLog && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowHeaderLogDropdown(!showHeaderLogDropdown)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-brass-gold bg-brass-gold px-4 py-2.5 text-sm font-medium text-barn-dark shadow hover:brightness-110 transition-all"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  New Log
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {showHeaderLogDropdown && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowHeaderLogDropdown(false)} />
                    <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-xl border border-barn-dark/10 bg-white py-1 shadow-lg sm:left-auto sm:right-0">
                      {sortedLogTypes.map((lt) => (
                        <Link
                          key={lt.value}
                          href={`/horses/${horse.id}/log/${lt.value}`}
                          className="flex items-center justify-between px-4 py-2.5 text-sm text-barn-dark hover:bg-parchment transition"
                          onClick={() => setShowHeaderLogDropdown(false)}
                        >
                          <span>{lt.label}</span>
                          {(logTypeCounts[lt.value] ?? 0) > 0 && (
                            <span className="text-xs text-barn-dark/30">{logTypeCounts[lt.value]}</span>
                          )}
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
              )}

              {canEditProfile && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-brass-gold bg-brass-gold px-4 py-2.5 text-sm font-medium text-barn-dark shadow hover:brightness-110 transition-all"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit Horse
              </button>
              )}
              {(() => {
                // Show Breeders Pro link if horse has breeding data
                const hasBPData =
                  (donorFlushes && donorFlushes.length > 0) ||
                  (donorPregnancies && donorPregnancies.length > 0) ||
                  (surrogatePregnancies && surrogatePregnancies.length > 0) ||
                  (stallionFlushes && stallionFlushes.length > 0) ||
                  (stallionPregnancies && stallionPregnancies.length > 0) ||
                  (horse.breeding_role && horse.breeding_role !== "none");
                if (!hasBPData) return null;

                const bpHref =
                  horse.breeding_role === "stallion"
                    ? `/breeders-pro/stallions/${horse.id}`
                    : horse.breeding_role === "recipient"
                      ? `/breeders-pro/surrogates/${horse.id}`
                      : horse.breeding_role === "donor"
                        ? `/breeders-pro/donors/${horse.id}`
                        : `/breeders-pro/donors/${horse.id}`;

                return (
                  <Link
                    href={bpHref}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-barn-dark/20 bg-white px-4 py-2.5 text-sm font-medium text-barn-dark shadow hover:border-brass-gold transition-all"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    Breeders Pro
                  </Link>
                );
              })()}
              {otherBarns.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowMoveModal(true)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-barn-dark/20 bg-white px-4 py-2.5 text-sm font-medium text-barn-dark shadow hover:border-brass-gold transition-all"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  Move
                </button>
              ) : null}
            </div>
          ) : null}
          <Badge variant="pending">Biometric ID — coming soon</Badge>
        </div>
      </div>

      {listError ? (
        <p className="mt-4 rounded-lg border border-barn-red/40 bg-barn-red/10 px-3 py-2 text-sm text-barn-dark">
          {listError === "no_permission"
            ? "You don't have permission for that action."
            : (() => {
                try {
                  return decodeURIComponent(listError);
                } catch {
                  return "Something went wrong.";
                }
              })()}
        </p>
      ) : null}

      {/* Active stay indicator */}
      {activeStay ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-brass-gold/30 bg-brass-gold/10 px-4 py-2.5">
          <svg className="h-4 w-4 text-brass-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          <p className="text-sm text-barn-dark">
            Currently at{" "}
            <span className="font-medium">
              {barnNames?.[activeStay.host_barn_id] ?? "Mare Motel"}
            </span>
          </p>
        </div>
      ) : null}

      {/* Public Care Summary */}
      <div className="mt-5">
        <CareCard horse={horse} lastShoeing={lastShoeing} lastWorming={lastWorming} />
      </div>

      <div className="mt-6">
        <Tabs items={[...tabItems]} value={tab} onValueChange={setTab} />
      </div>

      <div className="rounded-b-2xl border border-t-0 border-barn-dark/10 bg-white p-5 shadow-sm sm:p-8">
        {tab === "overview" ? (
          <div className="space-y-8">
            <div className="flex flex-col gap-6 lg:flex-row">
              <div className="shrink-0">
                <div className="w-full max-w-sm overflow-hidden rounded-2xl">
                  <HorsePhoto
                    name={horse.name}
                    photoUrl={horse.photo_url}
                    className="rounded-2xl"
                    aspectClassName="aspect-[4/3] w-full"
                  />
                </div>
                {canEdit && editing ? (
                  <label className="mt-3 inline-block cursor-pointer text-sm font-medium text-brass-gold hover:underline">
                    Change photo
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={onPhotoChange}
                    />
                  </label>
                ) : null}
              </div>

              <form ref={formRef} className="min-w-0 flex-1 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Name" name="name" defaultValue={horse.name} disabled={fieldsDisabled} required />
                  <Input label="Barn name" name="barn_name" defaultValue={horse.barn_name ?? ""} disabled={fieldsDisabled} />
                  <fieldset
                    className="sm:col-span-2 rounded-xl border border-barn-dark/10 bg-parchment/40 px-3 py-2.5"
                    disabled={fieldsDisabled}
                  >
                    <legend className="px-1 text-xs font-medium text-barn-dark/70">
                      Primary display name
                    </legend>
                    <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
                      <label className="inline-flex items-center gap-2 text-sm text-barn-dark">
                        <input
                          type="radio"
                          name="primary_name_pref"
                          value="papered"
                          defaultChecked={(horse.primary_name_pref ?? "papered") !== "barn"}
                          className="h-4 w-4 accent-brass-gold"
                        />
                        Use papered name
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-barn-dark">
                        <input
                          type="radio"
                          name="primary_name_pref"
                          value="barn"
                          defaultChecked={horse.primary_name_pref === "barn"}
                          className="h-4 w-4 accent-brass-gold"
                        />
                        Use barn name
                      </label>
                    </div>
                    <p className="mt-1 text-xs text-barn-dark/55">
                      Shown as the main label on this horse&apos;s profile and on horse cards.
                    </p>
                  </fieldset>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-barn-dark/60">
                      Breed
                    </label>
                    <BreedSelect
                      name="breed"
                      defaultValue={horse.breed ?? ""}
                      className="w-full rounded-xl border border-barn-dark/15 bg-white px-3 py-2 text-sm text-barn-dark outline-none focus:border-brass-gold focus:ring-2 focus:ring-brass-gold/25 disabled:bg-barn-dark/5"
                    />
                  </div>
                  <Select label="Sex" name="sex" defaultValue={horse.sex ?? ""} disabled={fieldsDisabled}>
                    <option value="">—</option>
                    {HORSE_SEX_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                  <Input label="Color" name="color" defaultValue={horse.color ?? ""} disabled={fieldsDisabled} />
                  <Input
                    label="Foal date"
                    name="foal_date"
                    type="date"
                    defaultValue={horse.foal_date?.slice(0, 10) ?? ""}
                    disabled={fieldsDisabled}
                  />
                  <Input label="Owner" name="owner_name" defaultValue={horse.owner_name ?? ""} disabled={fieldsDisabled} />
                  <Input label="Sire" name="sire" defaultValue={horse.sire ?? ""} disabled={fieldsDisabled} />
                  <Input label="Dam" name="dam" defaultValue={horse.dam ?? ""} disabled={fieldsDisabled} />
                  <Input
                    label="Registration #"
                    name="registration_number"
                    defaultValue={horse.registration_number ?? ""}
                    disabled={fieldsDisabled}
                  />
                  <Input
                    label="Microchip"
                    name="microchip_number"
                    defaultValue={horse.microchip_number ?? ""}
                    disabled={fieldsDisabled}
                  />
                  <Select label="Breeding Role" name="breeding_role" defaultValue={horse.breeding_role ?? "none"} disabled={fieldsDisabled}>
                    {BREEDING_ROLES.map((r) => (
                      <option key={r} value={r}>{BREEDING_ROLE_LABELS[r]}</option>
                    ))}
                  </Select>
                </div>

                {/* Care info — publicly visible via care card & QR code */}
                <div className="border-t border-barn-dark/10 pt-4">
                  <h3 className="mb-3 text-sm font-semibold text-barn-dark/70">
                    Care info
                    <span className="ml-2 text-xs font-normal text-barn-dark/40">
                      (visible on public care card)
                    </span>
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-sm font-medium text-barn-dark/70">
                        Feed regimen
                      </label>
                      <textarea
                        name="feed_regimen"
                        rows={2}
                        defaultValue={horse.feed_regimen ?? ""}
                        disabled={fieldsDisabled}
                        placeholder="e.g. 2 flakes timothy AM/PM, 1 scoop Strategy"
                        className="w-full rounded-xl border border-barn-dark/15 bg-white px-4 py-3 text-sm text-barn-dark placeholder:text-barn-dark/30 focus:border-brass-gold focus:ring-brass-gold/25 focus:outline-none disabled:opacity-60"
                      />
                    </div>
                    <Input
                      label="Supplements"
                      name="supplements"
                      defaultValue={horse.supplements ?? ""}
                      disabled={fieldsDisabled}
                      placeholder="e.g. SmartPak joint support daily"
                    />
                    <Input
                      label="Turnout schedule"
                      name="turnout_schedule"
                      defaultValue={horse.turnout_schedule ?? ""}
                      disabled={fieldsDisabled}
                      placeholder="e.g. AM turnout 7a-12p, PM stall"
                    />
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-sm font-medium text-barn-dark/70">
                        Special care notes
                      </label>
                      <textarea
                        name="special_care_notes"
                        rows={2}
                        defaultValue={horse.special_care_notes ?? ""}
                        disabled={fieldsDisabled}
                        placeholder="e.g. Easy keeper — no grain. Muzzle on turnout."
                        className="w-full rounded-xl border border-barn-dark/15 bg-white px-4 py-3 text-sm text-barn-dark placeholder:text-barn-dark/30 focus:border-brass-gold focus:ring-brass-gold/25 focus:outline-none disabled:opacity-60"
                      />
                    </div>
                  </div>
                </div>

                {/* Save / Cancel / Delete buttons — only in edit mode */}
                {editing ? (
                  <div className="flex flex-col gap-4 pt-2">
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || deletingHorse}
                      >
                        {saving ? "Saving…" : "Save changes"}
                      </Button>
                      <button
                        type="button"
                        onClick={handleCancel}
                        disabled={saving || deletingHorse}
                        className="inline-flex min-h-[44px] items-center rounded-xl border border-barn-dark/20 bg-white px-4 py-2.5 text-sm font-medium text-barn-dark hover:border-brass-gold disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>

                    {/* Delete horse */}
                    <div className="border-t border-barn-dark/10 pt-4">
                      {!confirmingDeleteHorse ? (
                        <button
                          type="button"
                          onClick={() => setConfirmingDeleteHorse(true)}
                          disabled={saving || deletingHorse}
                          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-all"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete Horse
                        </button>
                      ) : (
                        <div className="rounded-xl border border-red-300 bg-red-50 p-4">
                          <p className="text-sm font-medium text-red-800">
                            What would you like to do with <strong>{horse.name}</strong>?
                          </p>
                          <div className="mt-3 flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={() => handleDeleteHorse(false)}
                              disabled={deletingHorse}
                              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-amber-400 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50 transition-all"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" />
                              </svg>
                              {deletingHorse ? "Archiving…" : "Archive — hide but keep data"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteHorse(true)}
                              disabled={deletingHorse}
                              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-all"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              {deletingHorse ? "Deleting…" : "Permanently delete all data"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmingDeleteHorse(false)}
                              disabled={deletingHorse}
                              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-barn-dark/20 bg-white px-4 py-2.5 text-sm font-medium text-barn-dark hover:border-brass-gold disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </form>
            </div>

            <section className="border-t border-barn-dark/10 pt-8">
              <h2 className="font-serif text-lg text-barn-dark">QR code</h2>
              <p className="mt-1 text-sm text-barn-dark/65">
                Scan to open this horse&apos;s public care card (no sign-in required).
              </p>
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="rounded-xl border border-barn-dark/10 bg-parchment p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrSrc} alt="" width={220} height={220} className="h-auto w-[200px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm text-barn-dark/80">{profileUrl}</p>
                  <p className="mt-2 font-mono text-xs text-barn-dark/50">QR: {horse.qr_code}</p>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {tab === "logs" ? (
          <div className="space-y-4">
            {/* Add Log button + dropdown — hidden when permission doesn't allow any logging */}
            {canCreateAnyLog ? (
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-barn-dark">
                  {allLogs.length} {allLogs.length === 1 ? "entry" : "entries"}
                </h3>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowAddLogDropdown(!showAddLogDropdown)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-brass-gold px-4 py-2 text-sm font-medium text-barn-dark shadow hover:brightness-110 transition"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Add Log
                    <svg className="h-3 w-3 ml-1" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                  {showAddLogDropdown && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowAddLogDropdown(false)} />
                      <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-barn-dark/10 bg-white py-1 shadow-lg">
                        {sortedLogTypes.map((lt) => (
                          <Link
                            key={lt.value}
                            href={`/horses/${horse.id}/log/${lt.value}`}
                            className="flex items-center justify-between px-4 py-2.5 text-sm text-barn-dark hover:bg-parchment transition"
                            onClick={() => setShowAddLogDropdown(false)}
                          >
                            <span>{lt.label}</span>
                            {(logTypeCounts[lt.value] ?? 0) > 0 && (
                              <span className="text-xs text-barn-dark/30">{logTypeCounts[lt.value]}</span>
                            )}
                          </Link>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : null}

            {/* Filters */}
            {allLogs.length > 0 ? (
              <LogFilters
                types={allLogTypes}
                selectedType={logTypeFilter}
                onTypeChange={setLogTypeFilter}
                dateRange={logDateRange}
                onDateRangeChange={setLogDateRange}
              />
            ) : null}

            {/* Summary bar */}
            <LogSummaryBar
              entryCount={logSummary.count}
              totalCost={logSummary.totalCost}
              dateRange={logSummary.dateRange}
            />

            {/* Unified log list */}
            <ul className="divide-y divide-barn-dark/10">
              {filteredLogs.length === 0 ? (
                <li className="py-4 text-barn-dark/60">
                  {allLogs.length === 0 ? "No log entries yet." : "No entries match your filters."}
                </li>
              ) : (
                filteredLogs.map((l) =>
                  l.kind === "activity" ? (
                    <ActivityEntry
                      key={`a-${l.entry.id}`}
                      activity={l.entry}
                      loggerName={l.entry.logged_by ? (userNames?.[l.entry.logged_by] ?? null) : null}
                      loggerBarn={l.entry.logged_at_barn_id ? (barnNames?.[l.entry.logged_at_barn_id] ?? null) : null}
                      onClick={() => setSelectedLog({ kind: "activity", entry: l.entry })}
                    />
                  ) : (
                    <HealthRecordItem
                      key={`h-${l.entry.id}`}
                      record={l.entry}
                      loggerName={l.entry.logged_by ? (userNames?.[l.entry.logged_by] ?? null) : null}
                      loggerBarn={l.entry.logged_at_barn_id ? (barnNames?.[l.entry.logged_at_barn_id] ?? null) : null}
                      onClick={() => setSelectedLog({ kind: "health", entry: l.entry })}
                    />
                  ),
                )
              )}
            </ul>
          </div>
        ) : null}

        {tab === "documents" && hasDocumentScanner ? (
          <DocumentsTab
            horseId={horse.id}
            barnId={horse.barn_id}
            canEdit={canEdit}
            documents={horseDocuments ?? []}
          />
        ) : null}

        {tab === "breeding" && hasBreedersPro ? (
          <div className="space-y-6">
            {/* Reproductive Status */}
            <div className="rounded-2xl border border-barn-dark/10 bg-white p-5">
              <h3 className="text-sm font-semibold text-barn-dark mb-3">Reproductive Status</h3>
              <div className="flex flex-wrap gap-4">
                <div>
                  <span className="text-xs text-barn-dark/50 block">Status</span>
                  <span className="text-sm font-medium capitalize">
                    {horse.reproductive_status?.replace(/_/g, " ") ?? "Not set"}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-barn-dark/50 block">Breeding Role</span>
                  <span className="text-sm font-medium capitalize">
                    {horse.breeding_role?.replace(/_/g, " ") ?? "None"}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-barn-dark/50 block">Lifetime Embryos</span>
                  <span className="text-sm font-medium">{horse.lifetime_embryo_count ?? 0}</span>
                </div>
                <div>
                  <span className="text-xs text-barn-dark/50 block">Lifetime Live Foals</span>
                  <span className="text-sm font-medium">{horse.lifetime_live_foal_count ?? 0}</span>
                </div>
                <div>
                  <span className="text-xs text-barn-dark/50 block">Lifetime Losses</span>
                  <span
                    className="text-sm font-medium"
                    style={{
                      color:
                        (horse.lifetime_loss_count ?? 0) > 0
                          ? "#b8421f"
                          : undefined,
                    }}
                  >
                    {horse.lifetime_loss_count ?? 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Heat Cycle Tracker */}
            {(() => {
              const heatLogs = activities
                .filter((a) => {
                  if (a.activity_type !== "breed_data") return false;
                  const d = (a.details ?? {}) as Record<string, string>;
                  return d.breed_subtype === "heat_detected";
                })
                .sort((a, b) => {
                  const da = a.performed_at || a.created_at;
                  const db = b.performed_at || b.created_at;
                  return new Date(da).getTime() - new Date(db).getTime();
                });

              if (heatLogs.length === 0) return null;

              // Calculate intervals between consecutive heats
              const intervals: number[] = [];
              for (let i = 1; i < heatLogs.length; i++) {
                const prev = new Date(heatLogs[i - 1].performed_at || heatLogs[i - 1].created_at);
                const curr = new Date(heatLogs[i].performed_at || heatLogs[i].created_at);
                const days = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
                if (days > 0 && days < 60) intervals.push(days); // ignore gaps > 60 days (likely missed cycles)
              }

              const avgCycle = intervals.length > 0
                ? Math.round(intervals.reduce((s, d) => s + d, 0) / intervals.length)
                : 21; // default equine cycle

              const lastHeat = new Date(heatLogs[heatLogs.length - 1].performed_at || heatLogs[heatLogs.length - 1].created_at);
              const nextHeat = new Date(lastHeat);
              nextHeat.setDate(nextHeat.getDate() + avgCycle);

              const today = new Date();
              const daysUntilNext = Math.round((nextHeat.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              const inHeatWindow = daysUntilNext <= 2 && daysUntilNext >= -3;

              const fmtShort = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

              return (
                <div className="rounded-2xl border border-barn-dark/10 bg-white p-5">
                  <h3 className="text-sm font-semibold text-barn-dark mb-3">Heat Cycle Tracker</h3>

                  {/* Status banner */}
                  <div
                    className="rounded-xl px-4 py-3 mb-4"
                    style={{
                      background: inHeatWindow ? "#fef3c7" : "#f0fdf4",
                      border: `1px solid ${inHeatWindow ? "#f59e0b" : "#86efac"}`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 18 }}>{inHeatWindow ? "\u26a0\ufe0f" : "\u2705"}</span>
                      <div>
                        <span className="text-sm font-medium" style={{ color: inHeatWindow ? "#92400e" : "#166534" }}>
                          {inHeatWindow
                            ? "Likely in heat window"
                            : daysUntilNext > 0
                              ? `~${daysUntilNext} days until next expected heat`
                              : `${Math.abs(daysUntilNext)} days past expected heat`}
                        </span>
                        <span className="text-xs block" style={{ color: inHeatWindow ? "#a16207" : "#15803d" }}>
                          Next expected: {fmtShort(nextHeat)}
                          {intervals.length > 0 && ` \u00b7 Avg cycle: ${avgCycle} days`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Cycle history */}
                  <div className="space-y-1">
                    {heatLogs.slice().reverse().slice(0, 10).map((log, i, arr) => {
                      const logDate = new Date(log.performed_at || log.created_at);
                      // Find interval to previous heat (next in reversed array)
                      let daysSincePrev: number | null = null;
                      if (i < arr.length - 1) {
                        const prevDate = new Date(arr[i + 1].performed_at || arr[i + 1].created_at);
                        daysSincePrev = Math.round((logDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
                      }
                      return (
                        <div key={log.id} className="flex items-center gap-3 py-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#f59e0b" }} />
                          <span className="text-sm text-barn-dark font-medium" style={{ minWidth: 80 }}>
                            {fmtShort(logDate)}
                          </span>
                          {daysSincePrev != null && daysSincePrev > 0 && (
                            <span className="text-xs text-barn-dark/40">
                              {daysSincePrev}d since previous
                            </span>
                          )}
                          {log.notes && (
                            <span className="text-xs text-barn-dark/50 truncate">{log.notes}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Breed Data Logs (heat cycles, breeding events, ultrasounds) */}
            <div className="rounded-2xl border border-barn-dark/10 bg-white p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-barn-dark">Breeding Activity</h3>
                <Link
                  href={`/horses/${horse.id}/log/breed_data`}
                  className="text-xs font-medium text-brass-gold hover:underline"
                >
                  + Add Entry
                </Link>
              </div>
              {(() => {
                const breedLogs = activities.filter((a) => a.activity_type === "breed_data");
                if (breedLogs.length === 0) {
                  return (
                    <p className="text-sm text-barn-dark/50">
                      No breeding activity recorded yet. Use &quot;+ Add Entry&quot; to log heat cycles, breedings, ultrasounds, and more.
                    </p>
                  );
                }
                return (
                  <ul className="divide-y divide-barn-dark/10">
                    {breedLogs.slice(0, 20).map((log) => {
                      const details = (log.details ?? {}) as Record<string, string>;
                      const subtype = details.subtype ?? "custom";
                      const subtypeLabels: Record<string, string> = {
                        heat_detected: "Heat Detected",
                        bred_ai: "Bred / AI",
                        flush_embryo: "Flush / Embryo",
                        embryo_transfer: "Embryo Transfer",
                        ultrasound: "Ultrasound",
                        foaling: "Foaling",
                        custom: "Custom",
                      };
                      return (
                        <li key={log.id} className="py-3 flex items-start justify-between gap-3">
                          <div>
                            <span className="inline-block rounded-full bg-brass-gold/15 text-brass-gold px-2 py-0.5 text-xs font-medium mr-2">
                              {subtypeLabels[subtype] ?? subtype}
                            </span>
                            {log.notes && (
                              <span className="text-sm text-barn-dark/70">{log.notes}</span>
                            )}
                            {details.result && (
                              <span className="text-sm text-barn-dark/70 ml-1">— {details.result}</span>
                            )}
                          </div>
                          <span className="text-xs text-barn-dark/40 whitespace-nowrap">
                            {new Date(log.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </div>

            {/* Link to Breeders Pro */}
            {horse.breeding_role && horse.breeding_role !== "none" && (
              <div className="text-center">
                <Link
                  href={
                    horse.breeding_role === "stallion"
                      ? `/breeders-pro/stallions/${horse.id}`
                      : horse.breeding_role === "recipient"
                        ? `/breeders-pro/surrogates/${horse.id}`
                        : `/breeders-pro/donors/${horse.id}`
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-brass-gold bg-brass-gold/10 px-4 py-2.5 text-sm font-medium text-barn-dark hover:bg-brass-gold/20 transition-all"
                >
                  View Full Breeding Profile in Breeders Pro →
                </Link>
              </div>
            )}
          </div>
        ) : null}

        {tab === "financials" && hasBusinessPro ? (
          <div className="space-y-6">
            {(() => {
              // Compute per-horse financials from activities + health records
              const now = new Date();
              const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
              const firstOfNext = new Date(now.getFullYear(), now.getMonth() + 1, 1);
              const allFinancial = (activities ?? []).filter((a) => (a as unknown as { cost_type?: string | null }).cost_type);

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const isInMonth = (e: any) => {
                const d = new Date(e.performed_at || e.created_at);
                return d >= firstOfMonth && d < firstOfNext;
              };

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const sumBy = (arr: any[], types: string[]) =>
                arr.filter((e) => types.includes(e.cost_type)).reduce((s, e) => s + (e.total_cost ?? 0), 0);

              const thisMonth = allFinancial.filter(isInMonth);
              const revenue = sumBy(thisMonth, ["revenue", "pass_through"]);
              const expenses = sumBy(thisMonth, ["expense", "pass_through"]);
              const net = sumBy(thisMonth, ["revenue"]) - sumBy(thisMonth, ["expense"]);

              const outstanding = allFinancial
                .filter((e) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const x = e as any;
                  return (x.cost_type === "revenue" || x.cost_type === "pass_through") &&
                    (x.payment_status === "unpaid" || x.payment_status === "partial");
                })
                .reduce((s, e) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const x = e as any;
                  return s + ((x.total_cost ?? 0) - (x.paid_amount ?? 0));
                }, 0);

              // Top expense categories (this month, expense + pass_through)
              const expensesByType: Record<string, number> = {};
              for (const e of thisMonth) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const x = e as any;
                if (x.cost_type === "expense" || x.cost_type === "pass_through") {
                  const t = x.activity_type ?? "other";
                  expensesByType[t] = (expensesByType[t] ?? 0) + (x.total_cost ?? 0);
                }
              }
              const topExpenses = Object.entries(expensesByType)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

              const fmt = (n: number) =>
                n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

              return (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-barn-dark/10 bg-white p-4">
                      <div className="text-xs uppercase tracking-wide text-barn-dark/50">Revenue (Month)</div>
                      <div className="mt-1 font-serif text-xl text-[#2a4031]">{fmt(revenue)}</div>
                    </div>
                    <div className="rounded-xl border border-barn-dark/10 bg-white p-4">
                      <div className="text-xs uppercase tracking-wide text-barn-dark/50">Expenses (Month)</div>
                      <div className="mt-1 font-serif text-xl text-[#8b4a2b]">{fmt(expenses)}</div>
                    </div>
                    <div className="rounded-xl border border-barn-dark/10 bg-white p-4">
                      <div className="text-xs uppercase tracking-wide text-barn-dark/50">Net (Month)</div>
                      <div className={`mt-1 font-serif text-xl ${net >= 0 ? "text-[#2a4031]" : "text-[#b8421f]"}`}>
                        {fmt(net)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-barn-dark/10 bg-white p-4">
                      <div className="text-xs uppercase tracking-wide text-barn-dark/50">Outstanding</div>
                      <div className="mt-1 font-serif text-xl text-[#c9a84c]">{fmt(outstanding)}</div>
                    </div>
                  </div>

                  {topExpenses.length > 0 && (
                    <div className="rounded-xl border border-barn-dark/10 bg-white p-5">
                      <h3 className="font-serif text-base font-semibold text-barn-dark mb-3">
                        Top Expense Categories This Month
                      </h3>
                      <ul className="space-y-2">
                        {topExpenses.map(([type, amt]) => (
                          <li key={type} className="flex justify-between text-sm">
                            <span className="text-barn-dark capitalize">{type.replace(/_/g, " ")}</span>
                            <span className="font-mono text-[#8b4a2b]">{fmt(amt as number)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="text-center">
                    <Link
                      href="/business-pro/overview"
                      className="inline-flex items-center gap-2 rounded-xl border border-brass-gold bg-brass-gold/10 px-4 py-2.5 text-sm font-medium text-barn-dark hover:bg-brass-gold/20 transition-all"
                    >
                      View Full Financial Dashboard in Business Pro →
                    </Link>
                  </div>
                </>
              );
            })()}
          </div>
        ) : null}

        {tab === "access" ? (
          <div className="space-y-6">
            <p className="text-sm text-barn-dark/70">
              People who can see this horse through your barn team or a stall key.
            </p>
            <ul className="divide-y divide-barn-dark/10">
              {accessRows.map((row, i) => (
                <li key={`${row.label}-${row.sub}-${i}`} className="flex justify-between py-3">
                  <div>
                    <p className="font-medium text-barn-dark">{row.label}</p>
                    <p className="text-xs text-barn-dark/50">{row.kind}</p>
                  </div>
                  <span className="text-sm capitalize text-barn-dark/65">{row.sub}</span>
                </li>
              ))}
            </ul>
            {canEdit ? (
              <Link href={`/keys/generate?type=stall&horse=${horse.id}`} className={linkButtonClass("primary")}>
                Generate Stall Key
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Move horse modal */}
      {showMoveModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowMoveModal(false)}>
          <div className="fixed inset-0 bg-black/40" />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-lg font-semibold text-barn-dark">Move {horse.name}</h3>
            <p className="mt-1 text-sm text-barn-dark/60">Select which barn to move this horse to.</p>
            <ul className="mt-4 space-y-2">
              {otherBarns.map((barn) => (
                <li key={barn.id}>
                  <button
                    type="button"
                    disabled={moving}
                    onClick={() => handleMove(barn.id)}
                    className="flex w-full items-center justify-between rounded-xl border border-barn-dark/15 bg-parchment/50 px-4 py-3 text-left text-sm font-medium text-barn-dark transition hover:border-brass-gold hover:bg-brass-gold/10 disabled:opacity-50"
                  >
                    <span>{barn.name}</span>
                    <svg className="h-4 w-4 text-barn-dark/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setShowMoveModal(false)}
              className="mt-4 w-full rounded-xl border border-barn-dark/20 bg-white px-4 py-2.5 text-sm font-medium text-barn-dark hover:border-brass-gold"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}


      {/* Log detail modal */}
      {selectedLog ? (
        <LogDetailModal
          item={
            selectedLog.kind === "activity"
              ? { kind: "activity", entry: selectedLog.entry as ActivityLog }
              : { kind: "health", entry: selectedLog.entry as HealthRecord }
          }
          media={getMediaForLog(selectedLog.kind, selectedLog.entry.id)}
          lineItems={getLineItemsForLog(selectedLog.kind, selectedLog.entry.id)}
          performerName={getPerformerInfo(selectedLog.entry).name}
          performerRole={getPerformerInfo(selectedLog.entry).role}
          loggerName={
            selectedLog.kind === "activity"
              ? ((selectedLog.entry as ActivityLog).logged_by
                  ? userNames?.[(selectedLog.entry as ActivityLog).logged_by!] ?? null
                  : null)
              : ((selectedLog.entry as HealthRecord).logged_by
                  ? userNames?.[(selectedLog.entry as HealthRecord).logged_by!] ?? null
                  : null)
          }
          loggerBarn={
            selectedLog.kind === "activity"
              ? ((selectedLog.entry as ActivityLog).logged_at_barn_id
                  ? barnNames?.[(selectedLog.entry as ActivityLog).logged_at_barn_id!] ?? null
                  : null)
              : ((selectedLog.entry as HealthRecord).logged_at_barn_id
                  ? barnNames?.[(selectedLog.entry as HealthRecord).logged_at_barn_id!] ?? null
                  : null)
          }
          onClose={() => setSelectedLog(null)}
          canEdit={canEdit}
          canDelete={canEdit}
          horseId={horse.id}
          onDelete={async () => {
            const logType = selectedLog.kind === "activity" ? "activity" as const : "health" as const;
            const result = await deleteLogAction(selectedLog.entry.id, logType, horse.id);
            if (result.error) {
              show(result.error, "error");
            } else {
              show("Log entry deleted.", "success");
              setSelectedLog(null);
              router.refresh();
            }
          }}
        />
      ) : null}
    </div>
  );
}
