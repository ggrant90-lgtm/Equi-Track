"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { BusinessProChrome } from "@/components/business-pro/BusinessProChrome";
import { formatCurrency } from "@/lib/currency";
import {
  formatCategoryLabel,
  type TransactionRow,
} from "@/lib/business-pro/transactions-query";

const breadcrumb = [
  { label: "Business Pro", href: "/business-pro" },
  { label: "P&L Report" },
];

interface BarnOption {
  id: string;
  name: string;
}

interface InitialFilters {
  start: string | null;
  end: string | null;
  barnIds: string[];
  compare: boolean;
}

interface CategoryRow {
  label: string;
  current: number;
  prior: number;
  delta: number;
  deltaPct: number | null;
  count: number;
}

/**
 * P&L Report client.
 *
 * Layout:
 *   - Filter bar: period presets (This month / Last month / This
 *     quarter / YTD / Last 12 months) + custom dates + barn picker +
 *     a "Compare to prior period" toggle.
 *   - Summary strip: Revenue, Expenses, Net Income (and Δ vs prior
 *     when comparison is on).
 *   - Revenue by category table.
 *   - Expenses by category table.
 *   - CSV export hands the whole P&L to an accountant.
 *
 * Pass-through rows are excluded from the headline P&L — they're
 * neither true revenue nor true expense; they wash through. We surface
 * the pass-through count separately so the user can confirm none were
 * miscategorized.
 */
export function PnLReportClient({
  barns,
  currentRows,
  priorRows,
  initialFilters,
  truncated,
}: {
  barns: BarnOption[];
  currentRows: TransactionRow[];
  priorRows: TransactionRow[];
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
  const compare = initialFilters.compare;

  function applyFilters(next: {
    start?: string;
    end?: string;
    barnIds?: string[];
    compare?: boolean;
  }) {
    const params = new URLSearchParams(sp.toString());
    const s = next.start ?? start;
    const e = next.end ?? end;
    const b = next.barnIds ?? selectedBarns;
    const c = next.compare ?? compare;
    if (s) params.set("start", s);
    else params.delete("start");
    if (e) params.set("end", e);
    else params.delete("end");
    if (b.length > 0) params.set("barns", b.join(","));
    else params.delete("barns");
    if (c) params.set("compare", "1");
    else params.delete("compare");
    startTransition(() => {
      router.push(`/business-pro/pnl?${params.toString()}`);
    });
  }

  function setPreset(
    kind:
      | "this_month"
      | "last_month"
      | "this_quarter"
      | "ytd"
      | "12mo",
  ) {
    const now = new Date();
    let s: Date;
    let e: Date = now;
    if (kind === "this_month") {
      s = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (kind === "last_month") {
      s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      e = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (kind === "this_quarter") {
      const q = Math.floor(now.getMonth() / 3);
      s = new Date(now.getFullYear(), q * 3, 1);
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

  // ── Aggregates ────────────────────────────────────────────────────
  function rollupByCategory(
    rows: TransactionRow[],
    kind: "revenue" | "expense",
  ): Map<string, { total: number; count: number }> {
    const map = new Map<string, { total: number; count: number }>();
    for (const r of rows) {
      if (r.cost_type !== kind) continue;
      const label = formatCategoryLabel(r.category);
      const existing = map.get(label);
      if (existing) {
        existing.total += r.total_cost ?? 0;
        existing.count += 1;
      } else {
        map.set(label, { total: r.total_cost ?? 0, count: 1 });
      }
    }
    return map;
  }

  function merge(
    cur: Map<string, { total: number; count: number }>,
    prior: Map<string, { total: number; count: number }>,
  ): CategoryRow[] {
    const labels = new Set<string>([...cur.keys(), ...prior.keys()]);
    const out: CategoryRow[] = [];
    for (const label of labels) {
      const c = cur.get(label)?.total ?? 0;
      const p = prior.get(label)?.total ?? 0;
      const delta = c - p;
      const deltaPct = p === 0 ? null : (delta / Math.abs(p)) * 100;
      out.push({
        label,
        current: c,
        prior: p,
        delta,
        deltaPct,
        count: cur.get(label)?.count ?? 0,
      });
    }
    return out.sort((a, b) => b.current - a.current);
  }

  const revenueRows = useMemo(
    () =>
      merge(
        rollupByCategory(currentRows, "revenue"),
        rollupByCategory(priorRows, "revenue"),
      ),
    [currentRows, priorRows],
  );

  const expenseRows = useMemo(
    () =>
      merge(
        rollupByCategory(currentRows, "expense"),
        rollupByCategory(priorRows, "expense"),
      ),
    [currentRows, priorRows],
  );

  const totals = useMemo(() => {
    const reduce = (rows: TransactionRow[]) => {
      let revenue = 0;
      let expense = 0;
      let passThrough = 0;
      let passCount = 0;
      for (const r of rows) {
        if (r.cost_type === "revenue") revenue += r.total_cost ?? 0;
        else if (r.cost_type === "expense") expense += r.total_cost ?? 0;
        else if (r.cost_type === "pass_through") {
          passThrough += r.total_cost ?? 0;
          passCount += 1;
        }
      }
      return { revenue, expense, passThrough, passCount };
    };
    const cur = reduce(currentRows);
    const prior = reduce(priorRows);
    return {
      revenue: cur.revenue,
      expense: cur.expense,
      net: cur.revenue - cur.expense,
      passThrough: cur.passThrough,
      passCount: cur.passCount,
      priorRevenue: prior.revenue,
      priorExpense: prior.expense,
      priorNet: prior.revenue - prior.expense,
    };
  }, [currentRows, priorRows]);

  // ── CSV export ────────────────────────────────────────────────────
  function exportCsv() {
    const lines: string[] = [];
    const periodLabel = `${start || "—"} to ${end || "—"}`;
    lines.push(`Profit & Loss,${periodLabel}`);
    lines.push("");

    lines.push("Revenue");
    const revHeader = compare
      ? ["Category", "Current", "Prior", "Δ", "Δ %", "Entries"]
      : ["Category", "Total", "Entries"];
    lines.push(revHeader.join(","));
    for (const r of revenueRows) {
      const cells = compare
        ? [
            csvCell(r.label),
            r.current.toFixed(2),
            r.prior.toFixed(2),
            r.delta.toFixed(2),
            r.deltaPct === null ? "" : r.deltaPct.toFixed(1),
            r.count.toString(),
          ]
        : [csvCell(r.label), r.current.toFixed(2), r.count.toString()];
      lines.push(cells.join(","));
    }
    lines.push(
      compare
        ? [
            "TOTAL REVENUE",
            totals.revenue.toFixed(2),
            totals.priorRevenue.toFixed(2),
            (totals.revenue - totals.priorRevenue).toFixed(2),
            "",
            "",
          ].join(",")
        : ["TOTAL REVENUE", totals.revenue.toFixed(2), ""].join(","),
    );
    lines.push("");

    lines.push("Expenses");
    lines.push(revHeader.join(","));
    for (const r of expenseRows) {
      const cells = compare
        ? [
            csvCell(r.label),
            r.current.toFixed(2),
            r.prior.toFixed(2),
            r.delta.toFixed(2),
            r.deltaPct === null ? "" : r.deltaPct.toFixed(1),
            r.count.toString(),
          ]
        : [csvCell(r.label), r.current.toFixed(2), r.count.toString()];
      lines.push(cells.join(","));
    }
    lines.push(
      compare
        ? [
            "TOTAL EXPENSES",
            totals.expense.toFixed(2),
            totals.priorExpense.toFixed(2),
            (totals.expense - totals.priorExpense).toFixed(2),
            "",
            "",
          ].join(",")
        : ["TOTAL EXPENSES", totals.expense.toFixed(2), ""].join(","),
    );
    lines.push("");
    lines.push(
      compare
        ? [
            "NET INCOME",
            totals.net.toFixed(2),
            totals.priorNet.toFixed(2),
            (totals.net - totals.priorNet).toFixed(2),
            "",
            "",
          ].join(",")
        : ["NET INCOME", totals.net.toFixed(2), ""].join(","),
    );

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `barnbook-pnl-${start || "all"}-to-${end || "now"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const hasData = currentRows.length > 0;

  return (
    <BusinessProChrome breadcrumb={breadcrumb}>
      <div className="bp-page-header">
        <h1 className="bp-display" style={{ fontSize: 32 }}>
          Profit &amp; Loss
        </h1>
        <p
          style={{
            color: "var(--bp-ink-secondary)",
            fontSize: 13,
            marginTop: 4,
          }}
        >
          Revenue and expenses by category for the period you choose.
          Toggle on comparison to see how each line moved against the
          prior period.
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
              Period
            </span>
            <PresetButton
              label="This month"
              onClick={() => setPreset("this_month")}
            />
            <PresetButton
              label="Last month"
              onClick={() => setPreset("last_month")}
            />
            <PresetButton
              label="This quarter"
              onClick={() => setPreset("this_quarter")}
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
            <label
              className="ml-auto flex items-center gap-2 text-xs font-medium text-barn-dark/75"
              style={{ cursor: "pointer" }}
            >
              <input
                type="checkbox"
                checked={compare}
                onChange={(e) =>
                  applyFilters({ compare: e.target.checked })
                }
              />
              Compare to prior period
            </label>
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
            label="Revenue"
            value={formatCurrency(totals.revenue)}
            tone="ok"
            sub={
              compare ? (
                <DeltaBadge
                  current={totals.revenue}
                  prior={totals.priorRevenue}
                  higherIsBetter={true}
                />
              ) : null
            }
          />
          <SummaryTile
            label="Expenses"
            value={formatCurrency(totals.expense)}
            tone="warn"
            sub={
              compare ? (
                <DeltaBadge
                  current={totals.expense}
                  prior={totals.priorExpense}
                  higherIsBetter={false}
                />
              ) : null
            }
          />
          <SummaryTile
            label="Net Income"
            value={formatCurrency(totals.net)}
            tone={totals.net >= 0 ? "ok" : "hot"}
            sub={
              compare ? (
                <DeltaBadge
                  current={totals.net}
                  prior={totals.priorNet}
                  higherIsBetter={true}
                />
              ) : null
            }
          />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-barn-dark/55">
          {totals.passCount > 0 && (
            <span>
              {totals.passCount} pass-through{" "}
              {totals.passCount === 1 ? "entry" : "entries"} excluded from net
              ({formatCurrency(totals.passThrough)})
            </span>
          )}
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
              No revenue or expenses in this period
            </p>
            <p className="mt-2 text-sm text-barn-dark/60">
              Widen the date range, or start logging priced entries on the{" "}
              <Link href="/logs" className="underline hover:text-brass-gold">
                Barn Logs
              </Link>{" "}
              page or in horse health records.
            </p>
          </div>
        ) : (
          <>
            {/* ── Revenue section ──────────────────────────────── */}
            <CategorySection
              title="Revenue"
              rows={revenueRows}
              total={totals.revenue}
              priorTotal={totals.priorRevenue}
              compare={compare}
              tone="ok"
              higherIsBetter
            />

            {/* ── Expenses section ─────────────────────────────── */}
            <CategorySection
              title="Expenses"
              rows={expenseRows}
              total={totals.expense}
              priorTotal={totals.priorExpense}
              compare={compare}
              tone="warn"
              higherIsBetter={false}
            />

            {/* ── Net income footer ────────────────────────────── */}
            <div
              className="rounded-2xl border bg-white p-4 mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2"
              style={{
                borderColor: "rgba(42,64,49,0.1)",
                background:
                  totals.net >= 0
                    ? "rgba(42,64,49,0.04)"
                    : "rgba(139,74,43,0.05)",
              }}
            >
              <div className="font-serif text-lg text-barn-dark">
                Net Income
              </div>
              <div
                className="font-mono text-xl font-semibold"
                style={{
                  color: totals.net >= 0 ? "#2a4031" : "#8b4a2b",
                }}
              >
                {formatCurrency(totals.net)}
              </div>
              {compare && (
                <div className="text-xs text-barn-dark/60">
                  vs prior {formatCurrency(totals.priorNet)} →{" "}
                  <DeltaBadge
                    current={totals.net}
                    prior={totals.priorNet}
                    higherIsBetter={true}
                  />
                </div>
              )}
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

function CategorySection({
  title,
  rows,
  total,
  priorTotal,
  compare,
  tone,
  higherIsBetter,
}: {
  title: string;
  rows: CategoryRow[];
  total: number;
  priorTotal: number;
  compare: boolean;
  tone: "ok" | "warn";
  higherIsBetter: boolean;
}) {
  const accent = tone === "ok" ? "#2a4031" : "#8b4a2b";
  return (
    <div
      className="overflow-x-auto rounded-2xl border bg-white mb-4"
      style={{ borderColor: "rgba(42,64,49,0.1)" }}
    >
      <div
        className="px-4 py-3 border-b flex items-baseline justify-between"
        style={{ borderColor: "rgba(42,64,49,0.08)" }}
      >
        <h2
          className="font-serif text-base font-semibold"
          style={{ color: accent }}
        >
          {title}
        </h2>
        <div className="text-xs text-barn-dark/55">
          {rows.length} {rows.length === 1 ? "category" : "categories"}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-barn-dark/55">
          No {title.toLowerCase()} in this period.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr
              className="border-b text-left text-xs font-semibold uppercase tracking-wide text-barn-dark/55"
              style={{ borderColor: "rgba(42,64,49,0.08)" }}
            >
              <Th>Category</Th>
              <Th className="text-right">Amount</Th>
              {compare && <Th className="text-right">Prior</Th>}
              {compare && <Th className="text-right">Δ</Th>}
              <Th className="text-right" small>
                Entries
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.label}
                className="border-b last:border-0 hover:bg-parchment/30"
                style={{ borderColor: "rgba(42,64,49,0.05)" }}
              >
                <td className="px-4 py-2 text-barn-dark">{r.label}</td>
                <td className="px-4 py-2 text-right font-mono text-barn-dark">
                  {formatCurrency(r.current)}
                </td>
                {compare && (
                  <td className="px-4 py-2 text-right font-mono text-barn-dark/65">
                    {r.prior === 0 ? "—" : formatCurrency(r.prior)}
                  </td>
                )}
                {compare && (
                  <td className="px-4 py-2 text-right">
                    <DeltaBadge
                      current={r.current}
                      prior={r.prior}
                      higherIsBetter={higherIsBetter}
                      compact
                    />
                  </td>
                )}
                <td className="px-4 py-2 text-right text-xs text-barn-dark/55">
                  {r.count}
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
                Total {title}
              </td>
              <td
                className="px-4 py-2 text-right font-mono font-semibold"
                style={{ color: accent }}
              >
                {formatCurrency(total)}
              </td>
              {compare && (
                <td className="px-4 py-2 text-right font-mono text-barn-dark/65">
                  {priorTotal === 0 ? "—" : formatCurrency(priorTotal)}
                </td>
              )}
              {compare && (
                <td className="px-4 py-2 text-right">
                  <DeltaBadge
                    current={total}
                    prior={priorTotal}
                    higherIsBetter={higherIsBetter}
                    compact
                  />
                </td>
              )}
              <td className="px-4 py-2" />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "hot";
  sub?: ReactNode;
}) {
  const color =
    tone === "ok" ? "#2a4031" : tone === "warn" ? "#8b4a2b" : "#b32d2e";
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
      {sub && <div className="mt-1 text-xs">{sub}</div>}
    </div>
  );
}

function DeltaBadge({
  current,
  prior,
  higherIsBetter,
  compact = false,
}: {
  current: number;
  prior: number;
  higherIsBetter: boolean;
  compact?: boolean;
}) {
  const delta = current - prior;
  if (prior === 0 && current === 0) {
    return <span className="text-barn-dark/45">—</span>;
  }
  const pct = prior === 0 ? null : (delta / Math.abs(prior)) * 100;
  const isUp = delta > 0;
  const isFlat = delta === 0;
  const good = isFlat ? null : higherIsBetter ? isUp : !isUp;
  const color =
    good === null
      ? "#4b6479"
      : good
        ? "#2a4031"
        : "#8b4a2b";
  const arrow = isFlat ? "→" : isUp ? "▲" : "▼";
  const sign = delta > 0 ? "+" : "";
  const amount = `${sign}${formatCurrency(delta)}`;
  const pctText = pct === null ? "new" : `${sign}${pct.toFixed(0)}%`;
  return (
    <span
      className="inline-flex items-center gap-1 font-medium"
      style={{ color, fontSize: compact ? 11 : 12 }}
    >
      <span>{arrow}</span>
      <span className="font-mono">{amount}</span>
      <span className="text-barn-dark/55">({pctText})</span>
    </span>
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
  small,
}: {
  children: ReactNode;
  className?: string;
  small?: boolean;
}) {
  return (
    <th
      className={`px-4 py-2 font-semibold ${className ?? ""}`}
      style={small ? { fontSize: 10 } : undefined}
    >
      {children}
    </th>
  );
}

function csvCell(s: string): string {
  const sanitized = s.replace(/\n/g, " ");
  return sanitized.includes(",") ? `"${sanitized.replace(/"/g, '""')}"` : sanitized;
}
