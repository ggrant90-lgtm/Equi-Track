"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BusinessProChrome } from "@/components/business-pro/BusinessProChrome";
import { formatCurrency } from "@/lib/currency";

const breadcrumb = [
  { label: "Business Pro", href: "/business-pro" },
  { label: "Aging Report" },
];

interface AgingRow {
  key: string;
  label: string;
  current: number;
  b31_60: number;
  b61_90: number;
  b90_plus: number;
  total: number;
  entryCount: number;
  invoiceCount: number;
  oldestAgeDays: number;
}

/**
 * Aging Report — A/R schedule by client + age bucket.
 *
 * Standard accounting view: rows are clients, columns are the four
 * age buckets (Current / 31-60 / 61-90 / 90+). Bottom row totals
 * each bucket so the user sees portfolio-level health at a glance.
 *
 * Sorted by total descending so the biggest exposures are first.
 * Search filters by client name. CSV export hands the table to an
 * accountant. Each row links into Receivables filtered by the
 * relevant aging bucket (when one of the older buckets is the
 * majority of the row's total).
 */
export function AgingReportClient({
  rows,
  barns,
  bucketTotals,
  grandTotal,
}: {
  rows: AgingRow[];
  barns: Array<{ id: string; name: string }>;
  bucketTotals: {
    current: number;
    b31_60: number;
    b61_90: number;
    b90_plus: number;
  };
  grandTotal: number;
}) {
  // barns is unused for now — Receivables already supports its own
  // barn filter. Kept on the props signature so we can add a barn
  // filter to the report later without changing the page shape.
  void barns;

  const [search, setSearch] = useState("");

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.label.toLowerCase().includes(q));
  }, [rows, search]);

  const filteredTotals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => ({
        current: acc.current + r.current,
        b31_60: acc.b31_60 + r.b31_60,
        b61_90: acc.b61_90 + r.b61_90,
        b90_plus: acc.b90_plus + r.b90_plus,
        total: acc.total + r.total,
      }),
      { current: 0, b31_60: 0, b61_90: 0, b90_plus: 0, total: 0 },
    );
  }, [filteredRows]);

  function exportCsv() {
    const header = [
      "Client",
      "Current (0-30)",
      "31-60",
      "61-90",
      "90+",
      "Total",
      "Oldest (days)",
    ];
    const lines = [header.join(",")];
    for (const r of filteredRows) {
      const cells = [
        r.label.replace(/,/g, ";"),
        r.current.toFixed(2),
        r.b31_60.toFixed(2),
        r.b61_90.toFixed(2),
        r.b90_plus.toFixed(2),
        r.total.toFixed(2),
        r.oldestAgeDays.toString(),
      ];
      lines.push(cells.join(","));
    }
    lines.push(
      [
        "TOTAL",
        filteredTotals.current.toFixed(2),
        filteredTotals.b31_60.toFixed(2),
        filteredTotals.b61_90.toFixed(2),
        filteredTotals.b90_plus.toFixed(2),
        filteredTotals.total.toFixed(2),
        "",
      ].join(","),
    );
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const today = new Date().toISOString().slice(0, 10);
    a.download = `barnbook-aging-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <BusinessProChrome breadcrumb={breadcrumb}>
      <div className="bp-page-header">
        <h1 className="bp-display" style={{ fontSize: 32 }}>
          Aging Report
        </h1>
        <p
          style={{
            color: "var(--bp-ink-secondary)",
            fontSize: 13,
            marginTop: 4,
          }}
        >
          Outstanding receivables grouped by client and age. Use it to
          spot stale invoices and prioritize collections — anything in
          the 60+ or 90+ columns is worth a phone call.
        </p>
      </div>

      <div style={{ padding: "0 32px 48px" }}>
        {/* ── Bucket summary cards ─────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <BucketCard
            label="Current (0-30)"
            value={bucketTotals.current}
            tone="ok"
          />
          <BucketCard
            label="31-60 days"
            value={bucketTotals.b31_60}
            tone="warn"
          />
          <BucketCard
            label="61-90 days"
            value={bucketTotals.b61_90}
            tone="hot"
          />
          <BucketCard
            label="90+ days"
            value={bucketTotals.b90_plus}
            tone="critical"
          />
        </div>

        <div
          className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border bg-white px-3 py-2 text-sm"
          style={{ borderColor: "rgba(42,64,49,0.1)" }}
        >
          <InlineStat
            label="Clients"
            value={filteredRows.length.toString()}
          />
          <InlineStat
            label="Total outstanding"
            value={formatCurrency(filteredTotals.total)}
          />
          {filteredRows.length !== rows.length && (
            <span className="text-[11px] text-barn-dark/55">
              Filtered from {rows.length} total
              {" "}({formatCurrency(grandTotal)})
            </span>
          )}
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client…"
            className="ml-auto min-w-[200px] rounded-md border px-3 py-1.5 text-sm outline-none"
            style={{ borderColor: "rgba(42,64,49,0.15)" }}
          />
          <button
            type="button"
            onClick={exportCsv}
            disabled={filteredRows.length === 0}
            className="rounded-md border px-3 py-1 text-xs font-medium text-barn-dark/80 hover:bg-parchment disabled:opacity-40"
            style={{ borderColor: "rgba(42,64,49,0.15)" }}
          >
            ⬇ Export CSV
          </button>
        </div>

        {filteredRows.length === 0 ? (
          <div
            className="rounded-2xl border bg-white p-8 text-center"
            style={{ borderColor: "rgba(42,64,49,0.1)" }}
          >
            <p className="font-serif text-lg text-barn-dark">
              No outstanding receivables
            </p>
            <p className="mt-2 text-sm text-barn-dark/60">
              Everything is paid up. When clients owe you money, this
              report will show what&apos;s outstanding by age.
            </p>
            <Link
              href="/business-pro/receivables"
              className="mt-4 inline-block text-sm text-brass-gold hover:underline"
            >
              View Receivables →
            </Link>
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
                  <Th>Client</Th>
                  <Th className="text-right">Current (0-30)</Th>
                  <Th className="text-right">31-60</Th>
                  <Th className="text-right">61-90</Th>
                  <Th className="text-right">90+</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr
                    key={r.key}
                    className="border-b last:border-0 hover:bg-parchment/30"
                    style={{ borderColor: "rgba(42,64,49,0.05)" }}
                  >
                    <td className="px-4 py-2.5 font-medium text-barn-dark">
                      <Link
                        href="/business-pro/receivables"
                        className="hover:text-brass-gold"
                      >
                        {r.label}
                      </Link>
                      <div className="text-[10px] text-barn-dark/45 mt-0.5">
                        {r.entryCount > 0 && (
                          <>
                            {r.entryCount} entr{r.entryCount === 1 ? "y" : "ies"}
                          </>
                        )}
                        {r.entryCount > 0 && r.invoiceCount > 0 && " · "}
                        {r.invoiceCount > 0 && (
                          <>
                            {r.invoiceCount} invoice
                            {r.invoiceCount === 1 ? "" : "s"}
                          </>
                        )}
                      </div>
                    </td>
                    <BucketTd value={r.current} tone="ok" />
                    <BucketTd value={r.b31_60} tone="warn" />
                    <BucketTd value={r.b61_90} tone="hot" />
                    <BucketTd value={r.b90_plus} tone="critical" />
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-barn-dark">
                      {formatCurrency(r.total)}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <AgeChip days={r.oldestAgeDays} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr
                  className="border-t-2 bg-parchment/30"
                  style={{ borderColor: "rgba(42,64,49,0.2)" }}
                >
                  <td className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-barn-dark/55">
                    Total
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">
                    {formatCurrency(filteredTotals.current)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">
                    {formatCurrency(filteredTotals.b31_60)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">
                    {formatCurrency(filteredTotals.b61_90)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">
                    {formatCurrency(filteredTotals.b90_plus)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-barn-dark">
                    {formatCurrency(filteredTotals.total)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </BusinessProChrome>
  );
}

type Tone = "ok" | "warn" | "hot" | "critical";

const TONE_COLORS: Record<Tone, { bg: string; fg: string; cell: string }> = {
  ok: { bg: "rgba(42,64,49,0.06)", fg: "#2a4031", cell: "#2a4031" },
  warn: { bg: "rgba(245,158,11,0.1)", fg: "#a16207", cell: "#a16207" },
  hot: { bg: "rgba(239,114,68,0.1)", fg: "#c2410c", cell: "#c2410c" },
  critical: { bg: "rgba(239,68,68,0.12)", fg: "#b91c1c", cell: "#b91c1c" },
};

function BucketCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: Tone;
}) {
  const cfg = TONE_COLORS[tone];
  return (
    <div
      className="rounded-lg border bg-white p-3"
      style={{ borderColor: "rgba(42,64,49,0.1)" }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: cfg.fg }}
      >
        {label}
      </div>
      <div
        className="mt-1 font-mono text-xl font-semibold"
        style={{ color: cfg.cell }}
      >
        {formatCurrency(value)}
      </div>
    </div>
  );
}

function BucketTd({ value, tone }: { value: number; tone: Tone }) {
  const cfg = TONE_COLORS[tone];
  return (
    <td
      className="px-4 py-2.5 text-right font-mono"
      style={{ color: value > 0 ? cfg.cell : "rgba(42,64,49,0.35)" }}
    >
      {value > 0 ? formatCurrency(value) : "—"}
    </td>
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

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className="text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: "rgba(42,64,49,0.55)" }}
      >
        {label}
      </span>
      <span className="font-semibold text-barn-dark">{value}</span>
    </div>
  );
}

function AgeChip({ days }: { days: number }) {
  let tone: Tone;
  let label: string;
  if (days <= 30) {
    tone = "ok";
    label = `${days}d`;
  } else if (days <= 60) {
    tone = "warn";
    label = `${days}d`;
  } else if (days <= 90) {
    tone = "hot";
    label = `${days}d`;
  } else {
    tone = "critical";
    label = `${days}d`;
  }
  const cfg = TONE_COLORS[tone];
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: cfg.bg, color: cfg.fg }}
      title="Age of the oldest open item for this client"
    >
      {label}
    </span>
  );
}
