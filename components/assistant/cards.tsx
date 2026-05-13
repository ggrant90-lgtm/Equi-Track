"use client";

import Link from "next/link";
import type { ParsedCard } from "./message-parser";

/**
 * Card renderer registry. Returns null if the card_type is unknown — the
 * raw JSON stays out of the user-visible UI either way (the parser strips
 * it from prose), so an unknown type just yields silence.
 */
export function renderCard(card: ParsedCard): React.ReactNode {
  switch (card.card_type) {
    case "horse_details":
      return <HorseDetailsCard data={card.data} />;
    case "activity_list":
      return <ActivityListCard data={card.data} />;
    case "schedule_list":
      return <ScheduleListCard data={card.data} />;
    case "financial_summary":
      return <FinancialSummaryCard data={card.data} />;
    case "document_status_list":
      return <DocumentStatusListCard data={card.data} />;
    case "barn_summary":
      return <BarnSummaryCard data={card.data} />;
    case "horse_list":
      return <HorseListCard data={card.data} />;
    default:
      return null;
  }
}

const fmtCurrency = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(n);

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const cardShell =
  "rounded-xl border border-barn-dark/10 bg-parchment/60 p-3 text-sm shadow-sm";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HorseDetailsCard({ data }: { data: any }) {
  const h = data?.horse ?? data;
  if (!h?.id) return null;
  const meta: string[] = [];
  if (h.breed) meta.push(h.breed);
  if (h.color) meta.push(h.color);
  if (h.sex) meta.push(h.sex);
  if (h.age != null) meta.push(`${h.age} yr`);
  return (
    <div className={cardShell}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-serif text-base font-semibold text-barn-dark">
          {h.name}
        </div>
        {h.barn_name && (
          <div className="text-xs text-barn-dark/50">{h.barn_name}</div>
        )}
      </div>
      {meta.length > 0 && (
        <div className="mt-0.5 text-xs text-barn-dark/60">{meta.join(" · ")}</div>
      )}
      {h.is_quick_record && (
        <div className="mt-1 inline-block rounded bg-brass-gold/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brass-gold">
          Quick record
        </div>
      )}
      {h.owner && (
        <div className="mt-2 text-xs text-barn-dark/70">
          Owner: <span className="text-barn-dark">{h.owner}</span>
        </div>
      )}
      {h.location && (
        <div className="text-xs text-barn-dark/70">
          Location: <span className="text-barn-dark">{h.location}</span>
        </div>
      )}
      <Link
        href={`/horses/${h.id}`}
        className="mt-2 inline-block text-xs font-medium text-brass-gold hover:underline"
      >
        View profile →
      </Link>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HorseListCard({ data }: { data: any }) {
  const horses = Array.isArray(data?.horses) ? data.horses : [];
  if (horses.length === 0) return null;
  return (
    <div className={cardShell}>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-barn-dark/50">
        Horses
      </div>
      <ul className="space-y-1">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {horses.map((h: any) => (
          <li key={h.id} className="flex items-baseline justify-between gap-2">
            <Link
              href={`/horses/${h.id}`}
              className="text-sm font-medium text-barn-dark hover:underline"
            >
              {h.name}
            </Link>
            <span className="text-xs text-barn-dark/50">
              {[h.breed, h.barn_name].filter(Boolean).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ACTIVITY_DOT: Record<string, string> = {
  shoeing: "bg-amber-500",
  vet: "bg-red-500",
  worming: "bg-emerald-500",
  feed: "bg-sky-500",
  medication: "bg-rose-500",
  exercise: "bg-violet-500",
  note: "bg-barn-dark/40",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ActivityListCard({ data }: { data: any }) {
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  if (entries.length === 0) return null;
  return (
    <div className={cardShell}>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-barn-dark/50">
        Activity
      </div>
      <ul className="space-y-1.5">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {entries.map((e: any) => (
          <li key={e.id} className="flex items-start gap-2">
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                ACTIVITY_DOT[e.type ?? ""] ?? "bg-barn-dark/30"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-barn-dark/60">
                  {e.type ?? "entry"}
                </span>
                <span className="text-xs text-barn-dark/50">
                  {fmtDate(e.date)}
                </span>
              </div>
              {(e.title || e.notes) && (
                <div className="truncate text-sm text-barn-dark">
                  {e.title ?? e.notes}
                </div>
              )}
              {(e.performed_by || e.cost != null) && (
                <div className="text-xs text-barn-dark/50">
                  {e.performed_by && <>by {e.performed_by}</>}
                  {e.performed_by && e.cost != null && " · "}
                  {e.cost != null && fmtCurrency(e.cost)}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ScheduleListCard({ data }: { data: any }) {
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  if (entries.length === 0) return null;
  return (
    <div className={cardShell}>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-barn-dark/50">
        Upcoming
      </div>
      <ul className="space-y-1.5">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {entries.map((e: any) => (
          <li key={e.id} className="flex items-start gap-2">
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                ACTIVITY_DOT[e.type ?? ""] ?? "bg-barn-dark/30"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-barn-dark/60">
                  {e.type ?? "scheduled"}
                </span>
                <span className="text-xs text-barn-dark/50">
                  {fmtDate(e.date)}
                </span>
              </div>
              {e.horse_name && (
                <div className="text-sm font-medium text-barn-dark">
                  {e.horse_name}
                </div>
              )}
              {(e.title || e.notes) && (
                <div className="truncate text-xs text-barn-dark/70">
                  {e.title ?? e.notes}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FinancialSummaryCard({ data }: { data: any }) {
  if (data == null) return null;
  return (
    <div className={cardShell}>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Revenue" value={fmtCurrency(data.revenue)} tone="positive" />
        <Stat label="Expenses" value={fmtCurrency(data.expenses)} tone="negative" />
        <Stat
          label="Net"
          value={fmtCurrency(data.net)}
          tone={
            typeof data.net === "number" && data.net < 0 ? "negative" : "positive"
          }
        />
      </div>
      {data.outstanding != null && data.outstanding > 0 && (
        <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs">
          <span className="font-medium text-amber-900">
            {fmtCurrency(data.outstanding)}
          </span>
          <span className="text-amber-900/70"> outstanding</span>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "negative"
        ? "text-rose-700"
        : "text-barn-dark";
  return (
    <div className="rounded-lg border border-barn-dark/5 bg-white px-2 py-1.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-barn-dark/50">
        {label}
      </div>
      <div className={`text-sm font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DocumentStatusListCard({ data }: { data: any }) {
  const docs = Array.isArray(data?.documents) ? data.documents : [];
  if (docs.length === 0) return null;
  return (
    <div className={cardShell}>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-barn-dark/50">
        Documents
      </div>
      <ul className="space-y-1.5">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {docs.map((d: any) => {
          const tone =
            d.status === "expired"
              ? "bg-rose-100 text-rose-800"
              : d.status === "expiring_soon"
                ? "bg-amber-100 text-amber-800"
                : "bg-emerald-100 text-emerald-800";
          return (
            <li key={d.id} className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-barn-dark">
                  {d.horse_name ?? "—"}
                </div>
                <div className="text-xs text-barn-dark/60">
                  {d.document_type ?? "document"} · expires{" "}
                  {fmtDate(d.expiration_date)}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${tone}`}
              >
                {d.status?.replace("_", " ") ?? "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarnSummaryCard({ data }: { data: any }) {
  const b = data?.barn ?? null;
  if (!b?.id) return null;
  return (
    <div className={cardShell}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-serif text-base font-semibold text-barn-dark">
          {b.name}
        </div>
        <div className="text-xs uppercase tracking-wide text-barn-dark/50">
          {b.barn_type} · {b.plan_tier}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Stat label="Horses" value={String(data.horse_count ?? 0)} tone="neutral" />
        <Stat label="Members" value={String(data.member_count ?? 0)} tone="neutral" />
        <Stat
          label="Capacity"
          value={`${data.horse_count ?? 0}/${b.base_stalls ?? 0}`}
          tone={data.capacity?.over_capacity ? "negative" : "positive"}
        />
      </div>
      <Link
        href={`/barn/${b.id}`}
        className="mt-2 inline-block text-xs font-medium text-brass-gold hover:underline"
      >
        Open barn →
      </Link>
    </div>
  );
}
