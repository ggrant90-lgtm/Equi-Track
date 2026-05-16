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
  { label: "Tax Prep" },
];

interface BarnOption {
  id: string;
  name: string;
}

interface InitialFilters {
  year: number;
  barnIds: string[];
  basis: "cash" | "accrual";
}

interface CategoryTotal {
  label: string;
  total: number;
  count: number;
}

interface PayeeTotal {
  name: string;
  amount: number;
  count: number;
}

/**
 * Tax Prep client. Layout:
 *   - Filter bar: year picker, cash/accrual toggle, barn picker.
 *   - Three summary tiles: gross revenue, total expenses, net.
 *   - Revenue + Expenses tables grouped by category.
 *   - 1099 candidates table (payees > $600 in year).
 *   - Two CSV exports: full summary, 1099 list.
 *
 * Honest about its limits: we can't tell if a payee is incorporated,
 * so we surface "candidates" rather than "must-file" claims.
 */
export function TaxPrepReportClient({
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
  const [selectedBarns, setSelectedBarns] = useState<string[]>(
    initialFilters.barnIds,
  );

  const { year, basis } = initialFilters;

  function applyFilters(next: {
    year?: number;
    barnIds?: string[];
    basis?: "cash" | "accrual";
  }) {
    const params = new URLSearchParams(sp.toString());
    if (next.year !== undefined) params.set("year", String(next.year));
    const b = next.barnIds ?? selectedBarns;
    if (b.length > 0) params.set("barns", b.join(","));
    else params.delete("barns");
    if (next.basis !== undefined) {
      if (next.basis === "accrual") params.set("basis", "accrual");
      else params.delete("basis");
    }
    startTransition(() => {
      router.push(`/business-pro/tax-prep?${params.toString()}`);
    });
  }

  function toggleBarn(barnId: string) {
    const next = selectedBarns.includes(barnId)
      ? selectedBarns.filter((id) => id !== barnId)
      : [...selectedBarns, barnId];
    setSelectedBarns(next);
    applyFilters({ barnIds: next });
  }

  // Year picker — offer the current year and the last 5 prior years.
  // Computed once on mount (fine for a tax-prep view).
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const ys: number[] = [];
    for (let y = current; y >= current - 5; y--) ys.push(y);
    return ys;
  }, []);

  // Amount accessor depends on basis. In cash mode, only the paid
  // amount counts and only for rows that have actually been paid;
  // accrual mode uses total_cost regardless of payment.
  const amountOf = useMemo(() => {
    return basis === "cash"
      ? (r: TransactionRow) => r.paid_amount ?? 0
      : (r: TransactionRow) => r.total_cost ?? 0;
  }, [basis]);

  // ── Category rollups ───────────────────────────────────────────────
  const { revenueRows, expenseRows, passThroughCount, passThroughTotal } =
    useMemo(() => {
      const rev = new Map<string, CategoryTotal>();
      const exp = new Map<string, CategoryTotal>();
      let passCount = 0;
      let passTotal = 0;
      for (const r of rows) {
        const amt = amountOf(r);
        if (amt === 0) continue;
        if (r.cost_type === "revenue") {
          const label = formatCategoryLabel(r.category);
          const e = rev.get(label);
          if (e) {
            e.total += amt;
            e.count += 1;
          } else {
            rev.set(label, { label, total: amt, count: 1 });
          }
        } else if (r.cost_type === "expense") {
          const label = formatCategoryLabel(r.category);
          const e = exp.get(label);
          if (e) {
            e.total += amt;
            e.count += 1;
          } else {
            exp.set(label, { label, total: amt, count: 1 });
          }
        } else if (r.cost_type === "pass_through") {
          passCount += 1;
          passTotal += amt;
        }
      }
      return {
        revenueRows: [...rev.values()].sort((a, b) => b.total - a.total),
        expenseRows: [...exp.values()].sort((a, b) => b.total - a.total),
        passThroughCount: passCount,
        passThroughTotal: passTotal,
      };
    }, [rows, amountOf]);

  const totals = useMemo(() => {
    const revenue = revenueRows.reduce((s, r) => s + r.total, 0);
    const expense = expenseRows.reduce((s, r) => s + r.total, 0);
    return { revenue, expense, net: revenue - expense };
  }, [revenueRows, expenseRows]);

  // ── 1099 candidates ────────────────────────────────────────────────
  // Group expense rows by a best-effort payee key: vendor_name first,
  // then billable_to_name (for member/client outflows). Filter to
  // payees with > $600 in cumulative cash paid over the year.
  // Always uses paid_amount regardless of basis — 1099 rules are
  // cash-basis by IRS definition.
  const payeeCandidates = useMemo(() => {
    const m = new Map<string, PayeeTotal>();
    for (const r of rows) {
      if (r.cost_type !== "expense") continue;
      const paid = r.paid_amount ?? 0;
      if (paid <= 0) continue;
      const name =
        r.vendor_name?.trim() ||
        r.billable_to_name?.trim() ||
        null;
      if (!name) continue;
      const key = name.toLowerCase();
      const e = m.get(key);
      if (e) {
        e.amount += paid;
        e.count += 1;
      } else {
        m.set(key, { name, amount: paid, count: 1 });
      }
    }
    return [...m.values()]
      .filter((p) => p.amount >= 600)
      .sort((a, b) => b.amount - a.amount);
  }, [rows]);

  // ── CSV exports ────────────────────────────────────────────────────
  function exportSummaryCsv() {
    const lines: string[] = [];
    lines.push(
      `Tax Prep Summary,Year ${year},Basis ${basis === "cash" ? "Cash" : "Accrual"}`,
    );
    lines.push("");
    lines.push("Revenue");
    lines.push(["Category", "Amount", "Entries"].join(","));
    for (const r of revenueRows) {
      lines.push(
        [csvCell(r.label), r.total.toFixed(2), r.count.toString()].join(","),
      );
    }
    lines.push(["TOTAL REVENUE", totals.revenue.toFixed(2), ""].join(","));
    lines.push("");
    lines.push("Expenses");
    lines.push(["Category", "Amount", "Entries"].join(","));
    for (const r of expenseRows) {
      lines.push(
        [csvCell(r.label), r.total.toFixed(2), r.count.toString()].join(","),
      );
    }
    lines.push(["TOTAL EXPENSES", totals.expense.toFixed(2), ""].join(","));
    lines.push("");
    lines.push(["NET PROFIT (LOSS)", totals.net.toFixed(2), ""].join(","));
    if (passThroughCount > 0) {
      lines.push("");
      lines.push(
        [
          "Pass-through (excluded)",
          passThroughTotal.toFixed(2),
          passThroughCount.toString(),
        ].join(","),
      );
    }
    download(lines.join("\n"), `barnbook-tax-summary-${year}.csv`);
  }

  function export1099Csv() {
    const lines: string[] = [];
    lines.push(`1099-NEC Candidates,Year ${year} (cash-basis)`);
    lines.push("");
    lines.push(["Payee", "Total paid", "Payments"].join(","));
    for (const p of payeeCandidates) {
      lines.push(
        [csvCell(p.name), p.amount.toFixed(2), p.count.toString()].join(","),
      );
    }
    if (payeeCandidates.length === 0) {
      lines.push("(no payees exceeded $600 this year)");
    }
    download(lines.join("\n"), `barnbook-1099-candidates-${year}.csv`);
  }

  function download(content: string, filename: string) {
    const blob = new Blob([content], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const hasData = revenueRows.length > 0 || expenseRows.length > 0;

  return (
    <BusinessProChrome breadcrumb={breadcrumb}>
      <div className="bp-page-header">
        <h1 className="bp-display" style={{ fontSize: 32 }}>
          Tax Prep
        </h1>
        <p
          style={{
            color: "var(--bp-ink-secondary)",
            fontSize: 13,
            marginTop: 4,
          }}
        >
          Year-in-review for your accountant. Revenue and expenses
          grouped by category, plus a list of payees who crossed the
          $600 1099-NEC threshold. Export the CSVs and hand them off.
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
              Year
            </span>
            {yearOptions.map((y) => {
              const active = y === year;
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => applyFilters({ year: y })}
                  className="rounded-md border px-2.5 py-1 text-xs font-medium"
                  style={{
                    background: active ? "rgba(201,168,76,0.2)" : "white",
                    borderColor: active ? "#c9a84c" : "rgba(42,64,49,0.15)",
                    color: active ? "#7a5c13" : "#2a4031",
                  }}
                >
                  {y}
                </button>
              );
            })}
            <span
              className="ml-3 text-xs font-semibold uppercase tracking-wide text-barn-dark/55"
              style={{ marginLeft: 16 }}
            >
              Basis
            </span>
            <div className="inline-flex rounded-md overflow-hidden border" style={{ borderColor: "rgba(42,64,49,0.15)" }}>
              <button
                type="button"
                onClick={() => applyFilters({ basis: "cash" })}
                className="px-2.5 py-1 text-xs font-medium"
                style={{
                  background:
                    basis === "cash" ? "rgba(201,168,76,0.2)" : "white",
                  color: basis === "cash" ? "#7a5c13" : "#2a4031",
                }}
              >
                Cash
              </button>
              <button
                type="button"
                onClick={() => applyFilters({ basis: "accrual" })}
                className="px-2.5 py-1 text-xs font-medium border-l"
                style={{
                  background:
                    basis === "accrual" ? "rgba(201,168,76,0.2)" : "white",
                  borderColor: "rgba(42,64,49,0.15)",
                  color: basis === "accrual" ? "#7a5c13" : "#2a4031",
                }}
              >
                Accrual
              </button>
            </div>
            <span className="ml-auto text-[11px] text-barn-dark/55">
              {basis === "cash"
                ? "Counts what was actually paid this year."
                : "Counts what was billed this year, paid or not."}
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
            label="Gross Revenue"
            value={formatCurrency(totals.revenue)}
            color="#2a4031"
          />
          <SummaryTile
            label="Total Expenses"
            value={formatCurrency(totals.expense)}
            color="#8b4a2b"
          />
          <SummaryTile
            label={totals.net >= 0 ? "Net Profit" : "Net Loss"}
            value={formatCurrency(totals.net)}
            color={totals.net >= 0 ? "#2a4031" : "#b32d2e"}
          />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-barn-dark/55">
          {passThroughCount > 0 && (
            <span>
              {passThroughCount} pass-through{" "}
              {passThroughCount === 1 ? "entry" : "entries"} excluded
              ({formatCurrency(passThroughTotal)})
            </span>
          )}
          {truncated && (
            <span>
              Showing a partial result — split by barn or narrow the
              year to see everything.
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={exportSummaryCsv}
              disabled={!hasData}
              className="rounded-md border px-3 py-1 text-xs font-medium text-barn-dark/80 hover:bg-parchment disabled:opacity-40"
              style={{ borderColor: "rgba(42,64,49,0.15)" }}
            >
              ⬇ Summary CSV
            </button>
            <button
              type="button"
              onClick={export1099Csv}
              disabled={payeeCandidates.length === 0}
              className="rounded-md border px-3 py-1 text-xs font-medium text-barn-dark/80 hover:bg-parchment disabled:opacity-40"
              style={{ borderColor: "rgba(42,64,49,0.15)" }}
            >
              ⬇ 1099 CSV
            </button>
          </div>
        </div>

        {/* ── Empty state ──────────────────────────────────────── */}
        {!hasData ? (
          <div
            className="rounded-2xl border bg-white p-8 text-center"
            style={{ borderColor: "rgba(42,64,49,0.1)" }}
          >
            <p className="font-serif text-lg text-barn-dark">
              Nothing recorded for {year}
            </p>
            <p className="mt-2 text-sm text-barn-dark/60">
              {basis === "cash"
                ? "Switch to accrual basis if you bill ahead of payment, or pick a different year."
                : "Pick a different year."}{" "}
              You can review what&apos;s there on the{" "}
              <Link
                href="/business-pro/transactions"
                className="underline hover:text-brass-gold"
              >
                Transactions
              </Link>{" "}
              page.
            </p>
          </div>
        ) : (
          <>
            {/* ── Revenue / Expense sections ────────────────────── */}
            <CategorySection
              title="Revenue"
              rows={revenueRows}
              total={totals.revenue}
              accent="#2a4031"
            />
            <CategorySection
              title="Expenses"
              rows={expenseRows}
              total={totals.expense}
              accent="#8b4a2b"
            />

            {/* ── Net profit footer ─────────────────────────────── */}
            <div
              className="rounded-2xl border bg-white p-4 mb-6 flex flex-wrap items-baseline gap-x-6 gap-y-2"
              style={{
                borderColor: "rgba(42,64,49,0.1)",
                background:
                  totals.net >= 0
                    ? "rgba(42,64,49,0.04)"
                    : "rgba(139,74,43,0.05)",
              }}
            >
              <div className="font-serif text-lg text-barn-dark">
                {totals.net >= 0 ? "Net Profit" : "Net Loss"} for {year}
              </div>
              <div
                className="font-mono text-xl font-semibold"
                style={{
                  color: totals.net >= 0 ? "#2a4031" : "#8b4a2b",
                }}
              >
                {formatCurrency(totals.net)}
              </div>
              <div className="text-xs text-barn-dark/55">
                {basis === "cash" ? "Cash basis" : "Accrual basis"}
              </div>
            </div>

            {/* ── 1099 candidates ───────────────────────────────── */}
            <div
              className="overflow-x-auto rounded-2xl border bg-white"
              style={{ borderColor: "rgba(42,64,49,0.1)" }}
            >
              <div
                className="px-4 py-3 border-b flex items-baseline justify-between"
                style={{ borderColor: "rgba(42,64,49,0.08)" }}
              >
                <h2 className="font-serif text-base font-semibold text-barn-dark">
                  1099-NEC candidates
                </h2>
                <div className="text-xs text-barn-dark/55">
                  Payees you paid &gt; $600 in {year} · cash basis
                </div>
              </div>
              <div
                className="px-4 py-2 text-xs text-barn-dark/55"
                style={{ background: "rgba(201,168,76,0.06)" }}
              >
                ⚠ Heads-up: corporations are generally exempt from 1099-NEC
                reporting. Confirm each payee&apos;s entity status with your
                accountant before filing.
              </div>
              {payeeCandidates.length === 0 ? (
                <div className="px-4 py-6 text-sm text-barn-dark/55">
                  No payees crossed the $600 threshold this year.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      className="border-b text-left text-xs font-semibold uppercase tracking-wide text-barn-dark/55"
                      style={{ borderColor: "rgba(42,64,49,0.08)" }}
                    >
                      <Th>Payee</Th>
                      <Th className="text-right">Total paid</Th>
                      <Th className="text-right">Payments</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {payeeCandidates.map((p) => (
                      <tr
                        key={p.name}
                        className="border-b last:border-0 hover:bg-parchment/30"
                        style={{ borderColor: "rgba(42,64,49,0.05)" }}
                      >
                        <td className="px-4 py-2 text-barn-dark">{p.name}</td>
                        <td className="px-4 py-2 text-right font-mono text-barn-dark">
                          {formatCurrency(p.amount)}
                        </td>
                        <td className="px-4 py-2 text-right text-xs text-barn-dark/55">
                          {p.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
  accent,
}: {
  title: string;
  rows: CategoryTotal[];
  total: number;
  accent: string;
}) {
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
          No {title.toLowerCase()} recorded.
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
              <Th className="text-right">Entries</Th>
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
                  {formatCurrency(r.total)}
                </td>
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
  color,
}: {
  label: string;
  value: string;
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
    </div>
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

function csvCell(s: string): string {
  const sanitized = s.replace(/\n/g, " ");
  return sanitized.includes(",")
    ? `"${sanitized.replace(/"/g, '""')}"`
    : sanitized;
}
