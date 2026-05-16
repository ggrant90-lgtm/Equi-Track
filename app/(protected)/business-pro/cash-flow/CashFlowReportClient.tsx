"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BusinessProChrome } from "@/components/business-pro/BusinessProChrome";
import { formatCurrency } from "@/lib/currency";
import type { TransactionRow } from "@/lib/business-pro/transactions-query";

const breadcrumb = [
  { label: "Business Pro", href: "/business-pro" },
  { label: "Cash Flow" },
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

interface BucketRow {
  /** ISO start-of-bucket (YYYY-MM-01 for monthly, YYYY-MM-DD for weekly). */
  key: string;
  /** Pretty display label, eg "Jan '26" or "May 10". */
  label: string;
  cashIn: number;
  cashOut: number;
  net: number;
  running: number;
  inCount: number;
  outCount: number;
}

/**
 * Cash Flow Report client. Renders the period picker, summary tiles,
 * a monthly bars + running-balance chart, and the data table.
 *
 * "Cash" here means money that actually moved — every row has a
 * `paid_at` (the server filters rows without one) and contributes its
 * `paid_amount` (not total_cost) to the bucket.
 *
 * Bucket granularity auto-switches to weekly when the selected range
 * is ≤ 90 days, so a "last 30 days" view doesn't render a single big
 * bar.
 */
export function CashFlowReportClient({
  barns,
  rows,
  initialFilters,
  truncated,
}: {
  barns: BarnOption[];
  rows: TransactionRow[];
  initialFilters: InitialFilters;
  truncated: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();

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
      router.push(`/business-pro/cash-flow?${params.toString()}`);
    });
  }

  function setPreset(
    kind: "30d" | "this_month" | "ytd" | "12mo" | "24mo",
  ) {
    const now = new Date();
    let s: Date;
    const e: Date = now;
    if (kind === "30d") {
      s = new Date(now);
      s.setDate(s.getDate() - 30);
    } else if (kind === "this_month") {
      s = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (kind === "ytd") {
      s = new Date(now.getFullYear(), 0, 1);
    } else if (kind === "24mo") {
      s = new Date(now.getFullYear(), now.getMonth() - 24, 1);
    } else {
      s = new Date(now.getFullYear(), now.getMonth() - 12, 1);
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

  // ── Bucketing ──────────────────────────────────────────────────────
  const { buckets, granularity } = useMemo(() => {
    const startMs = start ? new Date(start).getTime() : 0;
    const endMs = end
      ? new Date(end).getTime()
      : new Date().getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const spanDays = (endMs - startMs) / dayMs;
    const gran: "week" | "month" = spanDays <= 90 ? "week" : "month";

    const map = new Map<string, BucketRow>();

    function bucketKey(iso: string): { key: string; label: string } {
      const d = new Date(iso);
      if (gran === "month") {
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        const label = d.toLocaleDateString(undefined, {
          month: "short",
          year: "2-digit",
        });
        return { key: k, label };
      }
      // Weekly: anchor to Monday
      const day = d.getDay();
      const diff = (day + 6) % 7; // Mon=0
      const monday = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate() - diff,
      );
      const k = monday.toISOString().slice(0, 10);
      const label = monday.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      return { key: k, label };
    }

    // Pre-seed empty buckets across the range so the chart shows
    // periods with zero cash movement (otherwise gaps are missing).
    if (startMs && endMs > startMs) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (gran === "month") {
        const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        while (cursor <= endDate) {
          const { key, label } = bucketKey(cursor.toISOString());
          if (!map.has(key)) {
            map.set(key, {
              key,
              label,
              cashIn: 0,
              cashOut: 0,
              net: 0,
              running: 0,
              inCount: 0,
              outCount: 0,
            });
          }
          cursor.setMonth(cursor.getMonth() + 1);
        }
      } else {
        const day = startDate.getDay();
        const diff = (day + 6) % 7;
        const cursor = new Date(
          startDate.getFullYear(),
          startDate.getMonth(),
          startDate.getDate() - diff,
        );
        while (cursor <= endDate) {
          const { key, label } = bucketKey(cursor.toISOString());
          if (!map.has(key)) {
            map.set(key, {
              key,
              label,
              cashIn: 0,
              cashOut: 0,
              net: 0,
              running: 0,
              inCount: 0,
              outCount: 0,
            });
          }
          cursor.setDate(cursor.getDate() + 7);
        }
      }
    }

    for (const r of rows) {
      if (!r.paid_at) continue;
      const amount = r.paid_amount ?? 0;
      if (amount === 0) continue;
      const { key, label } = bucketKey(r.paid_at);
      let bucket = map.get(key);
      if (!bucket) {
        bucket = {
          key,
          label,
          cashIn: 0,
          cashOut: 0,
          net: 0,
          running: 0,
          inCount: 0,
          outCount: 0,
        };
        map.set(key, bucket);
      }
      if (r.cost_type === "revenue") {
        bucket.cashIn += amount;
        bucket.inCount += 1;
      } else if (r.cost_type === "expense") {
        bucket.cashOut += amount;
        bucket.outCount += 1;
      }
      // pass_through intentionally excluded from cash-flow signal
    }

    const sorted = [...map.values()].sort((a, b) =>
      a.key.localeCompare(b.key),
    );
    let running = 0;
    for (const b of sorted) {
      b.net = b.cashIn - b.cashOut;
      running += b.net;
      b.running = running;
    }
    return { buckets: sorted, granularity: gran };
  }, [rows, start, end]);

  const totals = useMemo(() => {
    let cashIn = 0;
    let cashOut = 0;
    let inCount = 0;
    let outCount = 0;
    for (const b of buckets) {
      cashIn += b.cashIn;
      cashOut += b.cashOut;
      inCount += b.inCount;
      outCount += b.outCount;
    }
    return { cashIn, cashOut, net: cashIn - cashOut, inCount, outCount };
  }, [buckets]);

  // ── CSV export ─────────────────────────────────────────────────────
  function exportCsv() {
    const lines: string[] = [];
    lines.push(`Cash Flow,${start || "—"} to ${end || "—"}`);
    lines.push(`Granularity,${granularity}`);
    lines.push("");
    lines.push(
      [
        granularity === "month" ? "Month" : "Week of",
        "Cash in",
        "Cash out",
        "Net",
        "Running",
        "In count",
        "Out count",
      ].join(","),
    );
    for (const b of buckets) {
      lines.push(
        [
          b.key,
          b.cashIn.toFixed(2),
          b.cashOut.toFixed(2),
          b.net.toFixed(2),
          b.running.toFixed(2),
          b.inCount.toString(),
          b.outCount.toString(),
        ].join(","),
      );
    }
    lines.push("");
    lines.push(
      [
        "TOTAL",
        totals.cashIn.toFixed(2),
        totals.cashOut.toFixed(2),
        totals.net.toFixed(2),
        "",
        totals.inCount.toString(),
        totals.outCount.toString(),
      ].join(","),
    );
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `barnbook-cash-flow-${start || "all"}-to-${end || "now"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const hasData = totals.cashIn > 0 || totals.cashOut > 0;

  return (
    <BusinessProChrome breadcrumb={breadcrumb}>
      <div className="bp-page-header">
        <h1 className="bp-display" style={{ fontSize: 32 }}>
          Cash Flow
        </h1>
        <p
          style={{
            color: "var(--bp-ink-secondary)",
            fontSize: 13,
            marginTop: 4,
          }}
        >
          When money actually moved. Each entry is bucketed by its
          payment date, using the amount that was paid (not the total
          cost). Pass-through items are excluded.
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
            <PresetButton label="Last 30 days" onClick={() => setPreset("30d")} />
            <PresetButton
              label="This month"
              onClick={() => setPreset("this_month")}
            />
            <PresetButton label="YTD" onClick={() => setPreset("ytd")} />
            <PresetButton
              label="Last 12 months"
              onClick={() => setPreset("12mo")}
            />
            <PresetButton
              label="Last 24 months"
              onClick={() => setPreset("24mo")}
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
            <span
              className="ml-auto text-[11px] text-barn-dark/55"
              title="Granularity auto-switches to weekly when range ≤ 90 days"
            >
              Bucketed by {granularity}
            </span>
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

        {/* ── Summary tiles ────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <SummaryTile
            label="Cash in"
            value={formatCurrency(totals.cashIn)}
            sub={`${totals.inCount} ${totals.inCount === 1 ? "payment" : "payments"}`}
            color="#2a4031"
          />
          <SummaryTile
            label="Cash out"
            value={formatCurrency(totals.cashOut)}
            sub={`${totals.outCount} ${totals.outCount === 1 ? "payment" : "payments"}`}
            color="#8b4a2b"
          />
          <SummaryTile
            label="Net cash flow"
            value={formatCurrency(totals.net)}
            sub={
              totals.net >= 0
                ? "Positive cash flow"
                : "Negative — more out than in"
            }
            color={totals.net >= 0 ? "#2a4031" : "#b32d2e"}
          />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-barn-dark/55">
          {truncated && (
            <span>
              Showing a partial result — narrow the date range to see
              everything.
            </span>
          )}
          <button
            type="button"
            onClick={exportCsv}
            disabled={!hasData}
            className="ml-auto rounded-md border px-3 py-1 text-xs font-medium text-barn-dark/80 hover:bg-parchment disabled:opacity-40"
            style={{ borderColor: "rgba(42,64,49,0.15)" }}
          >
            ⬇ Export CSV
          </button>
        </div>

        {/* ── Empty state ──────────────────────────────────────── */}
        {!hasData ? (
          <div
            className="rounded-2xl border bg-white p-8 text-center"
            style={{ borderColor: "rgba(42,64,49,0.1)" }}
          >
            <p className="font-serif text-lg text-barn-dark">
              No payments in this range
            </p>
            <p className="mt-2 text-sm text-barn-dark/60">
              Mark entries paid on the{" "}
              <Link
                href="/business-pro/receivables"
                className="underline hover:text-brass-gold"
              >
                Receivables
              </Link>{" "}
              or{" "}
              <Link
                href="/business-pro/expenses"
                className="underline hover:text-brass-gold"
              >
                Expenses
              </Link>{" "}
              pages, then widen the date range.
            </p>
          </div>
        ) : (
          <>
            {/* ── Chart ─────────────────────────────────────────── */}
            <div
              className="rounded-2xl border bg-white p-4 mb-4"
              style={{ borderColor: "rgba(42,64,49,0.1)" }}
            >
              <h2 className="font-serif text-base font-semibold text-barn-dark mb-3">
                Cash in vs cash out
              </h2>
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <ComposedChart
                    data={buckets}
                    margin={{ top: 10, right: 20, bottom: 0, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0e8d8" />
                    <XAxis
                      dataKey="label"
                      stroke="#8a7f70"
                      style={{ fontSize: 11 }}
                    />
                    <YAxis
                      stroke="#8a7f70"
                      style={{ fontSize: 11 }}
                      tickFormatter={(v: number) =>
                        Math.abs(v) >= 1000
                          ? `$${(v / 1000).toFixed(0)}k`
                          : `$${v}`
                      }
                    />
                    <Tooltip
                      formatter={(value: unknown, name: unknown) => {
                        const n = Number(value);
                        const label =
                          name === "cashIn"
                            ? "Cash in"
                            : name === "cashOut"
                              ? "Cash out"
                              : name === "running"
                                ? "Running net"
                                : String(name);
                        return [formatCurrency(n), label];
                      }}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e5d9c3",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={0} stroke="#8a7f70" />
                    <Bar
                      dataKey="cashIn"
                      name="Cash in"
                      fill="#2a4031"
                      barSize={20}
                    />
                    <Bar
                      dataKey="cashOut"
                      name="Cash out"
                      fill="#8b4a2b"
                      barSize={20}
                    />
                    <Line
                      type="monotone"
                      dataKey="running"
                      name="Running net"
                      stroke="#c9a84c"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Table ─────────────────────────────────────────── */}
            <div
              className="overflow-x-auto rounded-2xl border bg-white"
              style={{ borderColor: "rgba(42,64,49,0.1)" }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="border-b text-left text-xs font-semibold uppercase tracking-wide text-barn-dark/55"
                    style={{ borderColor: "rgba(42,64,49,0.08)" }}
                  >
                    <Th>{granularity === "month" ? "Month" : "Week of"}</Th>
                    <Th className="text-right">Cash in</Th>
                    <Th className="text-right">Cash out</Th>
                    <Th className="text-right">Net</Th>
                    <Th className="text-right">Running</Th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((b) => (
                    <tr
                      key={b.key}
                      className="border-b last:border-0 hover:bg-parchment/30"
                      style={{ borderColor: "rgba(42,64,49,0.05)" }}
                    >
                      <td className="px-4 py-2 text-barn-dark">{b.label}</td>
                      <td className="px-4 py-2 text-right font-mono text-barn-dark">
                        {b.cashIn === 0 ? "—" : formatCurrency(b.cashIn)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-barn-dark">
                        {b.cashOut === 0 ? "—" : formatCurrency(b.cashOut)}
                      </td>
                      <td
                        className="px-4 py-2 text-right font-mono"
                        style={{
                          color:
                            b.net > 0
                              ? "#2a4031"
                              : b.net < 0
                                ? "#8b4a2b"
                                : "#8a7f70",
                        }}
                      >
                        {b.net === 0 ? "—" : formatCurrency(b.net)}
                      </td>
                      <td
                        className="px-4 py-2 text-right font-mono"
                        style={{
                          color: b.running >= 0 ? "#2a4031" : "#b32d2e",
                        }}
                      >
                        {formatCurrency(b.running)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr
                    style={{
                      background: "rgba(42,64,49,0.04)",
                      borderTop: "1px solid rgba(42,64,49,0.12)",
                    }}
                  >
                    <td className="px-4 py-2 font-semibold text-barn-dark">
                      Total
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-semibold text-barn-dark">
                      {formatCurrency(totals.cashIn)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-semibold text-barn-dark">
                      {formatCurrency(totals.cashOut)}
                    </td>
                    <td
                      className="px-4 py-2 text-right font-mono font-semibold"
                      style={{
                        color: totals.net >= 0 ? "#2a4031" : "#8b4a2b",
                      }}
                    >
                      {formatCurrency(totals.net)}
                    </td>
                    <td className="px-4 py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </BusinessProChrome>
  );
}

// ────────────────────────────────────────────────────────────────────
// Subcomponents
// ────────────────────────────────────────────────────────────────────

function SummaryTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div
      className="rounded-2xl border bg-white p-4"
      style={{ borderColor: "rgba(42,64,49,0.1)" }}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-barn-dark/55">
        {label}
      </div>
      <div
        className="mt-1 font-mono text-2xl font-semibold"
        style={{ color }}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-barn-dark/55">{sub}</div>
    </div>
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

function Th({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-4 py-2 font-semibold ${className ?? ""}`}>
      {children}
    </th>
  );
}
