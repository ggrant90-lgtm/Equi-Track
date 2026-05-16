"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { BusinessProChrome } from "@/components/business-pro/BusinessProChrome";
import { formatCurrency } from "@/lib/currency";
import {
  formatCategoryLabel,
  type TransactionRow,
} from "@/lib/business-pro/transactions-query";

const breadcrumb = [
  { label: "Business Pro", href: "/business-pro" },
  { label: "Transactions" },
];

interface BarnOption {
  id: string;
  name: string;
}

interface InitialFilters {
  start: string | null;
  end: string | null;
  barnIds: string[];
}

/**
 * Transactions page client. Renders the date / barn filter bar,
 * a category-totals strip (the "where did the money go" view at a
 * glance), the unified transactions list, and the CSV export.
 *
 * State lives in the URL so links + back/forward navigation work.
 * Server fetches happen on URL change via router.push().
 */
export function TransactionsClient({
  barns,
  initialRows,
  initialFilters,
  truncated,
}: {
  barns: BarnOption[];
  initialRows: TransactionRow[];
  initialFilters: InitialFilters;
  truncated: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

  const barnNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of barns) m[b.id] = b.name;
    return m;
  }, [barns]);

  // Local form state — committed to URL only on apply, so the user
  // can fiddle without re-fetching on every keystroke.
  const [start, setStart] = useState<string>(initialFilters.start ?? "");
  const [end, setEnd] = useState<string>(initialFilters.end ?? "");
  const [selectedBarns, setSelectedBarns] = useState<string[]>(
    initialFilters.barnIds,
  );

  function applyFilters(next: {
    start?: string;
    end?: string;
    barnIds?: string[];
  }) {
    const params = new URLSearchParams(sp.toString());
    const s = next.start ?? start;
    const e = next.end ?? end;
    const b = next.barnIds ?? selectedBarns;
    if (s) params.set("start", s);
    else params.delete("start");
    if (e) params.set("end", e);
    else params.delete("end");
    if (b.length > 0) params.set("barns", b.join(","));
    else params.delete("barns");
    startTransition(() => {
      router.push(`/business-pro/transactions?${params.toString()}`);
    });
  }

  function setPreset(kind: "this_month" | "last_month" | "ytd" | "12mo") {
    const now = new Date();
    let s: Date;
    let e: Date = now;
    if (kind === "this_month") {
      s = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (kind === "last_month") {
      s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      e = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (kind === "ytd") {
      s = new Date(now.getFullYear(), 0, 1);
    } else {
      s = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate());
    }
    const startIso = s.toISOString().slice(0, 10);
    const endIso = e.toISOString().slice(0, 10);
    setStart(startIso);
    setEnd(endIso);
    applyFilters({ start: startIso, end: endIso });
  }

  function toggleBarn(barnId: string) {
    const next = selectedBarns.includes(barnId)
      ? selectedBarns.filter((id) => id !== barnId)
      : [...selectedBarns, barnId];
    setSelectedBarns(next);
    applyFilters({ barnIds: next });
  }

  // ── Aggregates ──────────────────────────────────────────────────
  // Total in / out, plus per-category rollups for the strip.
  const totals = useMemo(() => {
    let revenue = 0;
    let expense = 0;
    let passThrough = 0;
    for (const r of initialRows) {
      if (r.cost_type === "revenue") revenue += r.total_cost;
      else if (r.cost_type === "expense") expense += r.total_cost;
      else if (r.cost_type === "pass_through") passThrough += r.total_cost;
    }
    return { revenue, expense, passThrough };
  }, [initialRows]);

  const categoryTotals = useMemo(() => {
    type Bucket = {
      label: string;
      total: number;
      kind: "revenue" | "expense" | "pass_through" | "mixed";
      count: number;
    };
    const map = new Map<string, Bucket>();
    for (const r of initialRows) {
      const label = formatCategoryLabel(r.category);
      const key = `${r.cost_type ?? "none"}:${label}`;
      const existing = map.get(key);
      if (existing) {
        existing.total += r.total_cost;
        existing.count += 1;
      } else {
        map.set(key, {
          label,
          total: r.total_cost,
          kind: r.cost_type ?? "mixed",
          count: 1,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [initialRows]);

  // ── CSV export ─────────────────────────────────────────────────
  function exportCsv() {
    const header = [
      "Date",
      "Barn",
      "Source",
      "Category",
      "Type",
      "Vendor",
      "Description / Notes",
      "Total",
      "Payment status",
      "Paid amount",
      "Paid at",
    ];
    const lines = [header.join(",")];
    for (const r of initialRows) {
      const cells = [
        r.performed_at.slice(0, 10),
        barnNames[r.barn_id] ?? "",
        sourceLabel(r.source),
        formatCategoryLabel(r.category),
        r.cost_type ?? "",
        r.vendor_name ?? "",
        (r.description || r.notes || "")
          .replace(/\n/g, " ")
          .replace(/,/g, ";"),
        (r.total_cost ?? 0).toFixed(2),
        r.payment_status ?? "",
        (r.paid_amount ?? 0).toFixed(2),
        r.paid_at ? r.paid_at.slice(0, 10) : "",
      ];
      lines.push(
        cells
          .map((c) =>
            typeof c === "string" && c.includes(",") ? `"${c}"` : c,
          )
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `barnbook-transactions-${start || "all"}-to-${end || "now"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <BusinessProChrome breadcrumb={breadcrumb}>
      <div className="bp-page-header">
        <h1 className="bp-display" style={{ fontSize: 32 }}>
          Transactions
        </h1>
        <p
          style={{
            color: "var(--bp-ink-secondary)",
            fontSize: 13,
            marginTop: 4,
          }}
        >
          Every priced entry across your barns — horse logs, health records,
          and barn expenses. Filter by date or barn to dial in a period and
          see where the money actually went.
        </p>
      </div>

      <div style={{ padding: "0 32px 48px" }}>
        {/* ── Filter bar ───────────────────────────────────────── */}
        <div
          className="rounded-lg border bg-white p-3 mb-4"
          style={{ borderColor: "rgba(42,64,49,0.1)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-barn-dark/55">
              Range
            </span>
            <PresetButton
              label="This month"
              onClick={() => setPreset("this_month")}
            />
            <PresetButton
              label="Last month"
              onClick={() => setPreset("last_month")}
            />
            <PresetButton label="YTD" onClick={() => setPreset("ytd")} />
            <PresetButton
              label="Last 12 months"
              onClick={() => setPreset("12mo")}
            />
            <div className="flex items-center gap-1 ml-2">
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                onBlur={() => applyFilters({})}
                className="rounded-md border px-2 py-1 text-xs outline-none"
                style={{ borderColor: "rgba(42,64,49,0.15)" }}
                aria-label="Start date"
              />
              <span className="text-xs text-barn-dark/45">to</span>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                onBlur={() => applyFilters({})}
                className="rounded-md border px-2 py-1 text-xs outline-none"
                style={{ borderColor: "rgba(42,64,49,0.15)" }}
                aria-label="End date"
              />
            </div>
          </div>

          {barns.length > 1 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-barn-dark/55">
                Barn
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedBarns([]);
                  applyFilters({ barnIds: [] });
                }}
                className="rounded-full border px-3 py-1 text-xs font-medium"
                style={{
                  background:
                    selectedBarns.length === 0
                      ? "rgba(201,168,76,0.2)"
                      : "white",
                  borderColor:
                    selectedBarns.length === 0
                      ? "#c9a84c"
                      : "rgba(42,64,49,0.15)",
                  color:
                    selectedBarns.length === 0 ? "#7a5c13" : "#2a4031",
                }}
              >
                All barns
              </button>
              {barns.map((b) => {
                const active = selectedBarns.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBarn(b.id)}
                    className="rounded-full border px-3 py-1 text-xs font-medium"
                    style={{
                      background: active ? "rgba(201,168,76,0.2)" : "white",
                      borderColor: active ? "#c9a84c" : "rgba(42,64,49,0.15)",
                      color: active ? "#7a5c13" : "#2a4031",
                    }}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Totals strip ─────────────────────────────────────── */}
        <div
          className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border bg-white px-3 py-2 text-sm"
          style={{ borderColor: "rgba(42,64,49,0.1)" }}
        >
          <InlineStat
            label="Entries"
            value={initialRows.length.toLocaleString()}
          />
          <InlineStat
            label="Revenue"
            value={formatCurrency(totals.revenue)}
            color="#2a4031"
          />
          <InlineStat
            label="Expense"
            value={formatCurrency(totals.expense)}
            color="#8b4a2b"
          />
          {totals.passThrough > 0 && (
            <InlineStat
              label="Pass-through"
              value={formatCurrency(totals.passThrough)}
              color="#7a5c13"
            />
          )}
          <InlineStat
            label="Net"
            value={formatCurrency(totals.revenue - totals.expense)}
          />
          <div className="ml-auto flex items-center gap-2">
            {truncated && (
              <span className="text-[11px] text-barn-dark/55">
                Showing a partial result — narrow the date range.
              </span>
            )}
            <button
              type="button"
              onClick={exportCsv}
              disabled={initialRows.length === 0}
              className="rounded-md border px-3 py-1 text-xs font-medium text-barn-dark/80 hover:bg-parchment disabled:opacity-40"
              style={{ borderColor: "rgba(42,64,49,0.15)" }}
            >
              ⬇ Export CSV
            </button>
          </div>
        </div>

        {/* ── Category totals strip ────────────────────────────── */}
        {categoryTotals.length > 0 && (
          <div className="mb-6">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-barn-dark/55">
              By category
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {categoryTotals.map((c) => (
                <div
                  key={`${c.kind}:${c.label}`}
                  className="rounded-lg border bg-white p-2.5"
                  style={{ borderColor: "rgba(42,64,49,0.1)" }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wide"
                      style={{
                        color:
                          c.kind === "revenue"
                            ? "#2a4031"
                            : c.kind === "expense"
                              ? "#8b4a2b"
                              : c.kind === "pass_through"
                                ? "#7a5c13"
                                : "#4b6479",
                      }}
                    >
                      {c.kind === "pass_through" ? "Pass-through" : c.kind}
                    </span>
                    <span className="text-[10px] text-barn-dark/45">
                      {c.count}
                    </span>
                  </div>
                  <div className="mt-0.5 font-medium text-barn-dark truncate">
                    {c.label}
                  </div>
                  <div className="font-mono text-sm font-semibold text-barn-dark mt-0.5">
                    {formatCurrency(c.total)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Transactions list ────────────────────────────────── */}
        {initialRows.length === 0 ? (
          <div
            className="rounded-2xl border bg-white p-8 text-center"
            style={{ borderColor: "rgba(42,64,49,0.1)" }}
          >
            <p className="font-serif text-lg text-barn-dark">
              No transactions in this range
            </p>
            <p className="mt-2 text-sm text-barn-dark/60">
              Widen the date range, or log entries on the{" "}
              <Link href="/logs" className="underline hover:text-brass-gold">
                Barn Logs
              </Link>{" "}
              and horse profiles.
            </p>
          </div>
        ) : (
          <div
            className="overflow-x-auto rounded-2xl border bg-white"
            style={{ borderColor: "rgba(42,64,49,0.1)" }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="border-b text-left"
                  style={{ borderColor: "rgba(42,64,49,0.1)" }}
                >
                  <Th>Date</Th>
                  {barns.length > 1 && <Th>Barn</Th>}
                  <Th>Category</Th>
                  <Th>Type</Th>
                  <Th>Description</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {initialRows.map((r) => (
                  <tr
                    key={`${r.source}:${r.id}`}
                    className="border-b last:border-0 hover:bg-parchment/30"
                    style={{ borderColor: "rgba(42,64,49,0.05)" }}
                  >
                    <td className="px-4 py-2 whitespace-nowrap text-barn-dark/80">
                      {new Date(r.performed_at).toLocaleDateString(undefined, {
                        year: "2-digit",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    {barns.length > 1 && (
                      <td className="px-4 py-2 text-barn-dark/70">
                        {barnNames[r.barn_id] ?? "—"}
                      </td>
                    )}
                    <td className="px-4 py-2 text-barn-dark">
                      <span
                        className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                        style={{
                          background:
                            r.cost_type === "revenue"
                              ? "rgba(42,64,49,0.08)"
                              : r.cost_type === "expense"
                                ? "rgba(139,74,43,0.08)"
                                : "rgba(201,168,76,0.15)",
                          color:
                            r.cost_type === "revenue"
                              ? "#2a4031"
                              : r.cost_type === "expense"
                                ? "#8b4a2b"
                                : "#7a5c13",
                        }}
                      >
                        {formatCategoryLabel(r.category)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-barn-dark/55">
                      {sourceLabel(r.source)}
                    </td>
                    <td className="px-4 py-2 text-barn-dark/80 max-w-xs">
                      <span className="block truncate">
                        {r.vendor_name ?? r.description ?? r.notes ?? "—"}
                      </span>
                    </td>
                    <td
                      className="px-4 py-2 text-right font-mono"
                      style={{
                        color:
                          r.cost_type === "revenue" ? "#2a4031" : "#2a4031",
                      }}
                    >
                      {formatCurrency(r.total_cost ?? 0)}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {r.payment_status ? (
                        <PaymentChip status={r.payment_status} />
                      ) : (
                        <span className="text-barn-dark/40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </BusinessProChrome>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-barn-dark/55 ${
        className ?? ""
      }`}
    >
      {children}
    </th>
  );
}

function PresetButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border px-2.5 py-1 text-xs font-medium text-barn-dark/80 hover:bg-parchment"
      style={{ borderColor: "rgba(42,64,49,0.15)" }}
    >
      {label}
    </button>
  );
}

function InlineStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className="text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: "rgba(42,64,49,0.55)" }}
      >
        {label}
      </span>
      <span
        className="font-semibold text-barn-dark"
        style={{ color: color ?? "#2a4031" }}
      >
        {value}
      </span>
    </div>
  );
}

function sourceLabel(s: "activity" | "health" | "barn_expense"): string {
  if (s === "activity") return "Activity";
  if (s === "health") return "Health";
  return "Barn";
}

function PaymentChip({
  status,
}: {
  status: "unpaid" | "paid" | "partial" | "waived";
}) {
  const map: Record<
    "unpaid" | "paid" | "partial" | "waived",
    { label: string; bg: string; fg: string }
  > = {
    unpaid: { label: "Unpaid", bg: "rgba(184,66,31,0.15)", fg: "#b8421f" },
    paid: { label: "Paid", bg: "rgba(42,64,49,0.1)", fg: "#2a4031" },
    partial: { label: "Partial", bg: "rgba(201,168,76,0.25)", fg: "#7a5c13" },
    waived: { label: "Waived", bg: "rgba(75,100,121,0.15)", fg: "#4b6479" },
  };
  const cfg = map[status];
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: cfg.bg, color: cfg.fg }}
    >
      {cfg.label}
    </span>
  );
}
