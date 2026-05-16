import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase-server";
import { getUserOperationalBarnIds } from "@/lib/barn-session";
import { getTransactions } from "@/lib/business-pro/transactions-query";
import { CashFlowReportClient } from "./CashFlowReportClient";

/**
 * Business Pro — Cash Flow.
 *
 * Cash Flow differs from P&L on two axes:
 *   1. It's keyed on when money MOVED (`paid_at`), not when the
 *      activity happened (`performed_at`).
 *   2. The amount that counts is `paid_amount`, not `total_cost` —
 *      a partial-paid entry only contributes the paid portion.
 *
 * Rows without a `paid_at` are skipped entirely (the data layer drops
 * them via the `dateField: "paid_at"` option on `getTransactions`).
 *
 * Defaults: last 12 months, all operational barns. The client buckets
 * the rows by month (or week, when the range is short) and renders
 * cash-in / cash-out bars + a running balance line.
 */
export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string; end?: string; barns?: string }>;
}) {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const sp = await searchParams;

  const allBarnIds = await getUserOperationalBarnIds(supabase, user.id);
  if (allBarnIds.length === 0) {
    return (
      <CashFlowReportClient
        barns={[]}
        rows={[]}
        initialFilters={{ start: null, end: null, barnIds: [] }}
        truncated={false}
      />
    );
  }

  const { data: barnRows } = await supabase
    .from("barns")
    .select("id, name")
    .in("id", allBarnIds)
    .order("name", { ascending: true });
  const barns = (barnRows ?? []) as Array<{ id: string; name: string }>;

  // Default range: trailing 12 months.
  const now = new Date();
  const twelveMonthsAgo = new Date(
    now.getFullYear(),
    now.getMonth() - 12,
    1,
  );
  const defaultStart = twelveMonthsAgo.toISOString().slice(0, 10);
  const defaultEnd = now.toISOString().slice(0, 10);
  const start = sp.start ?? defaultStart;
  const end = sp.end ?? defaultEnd;

  const requestedBarnIds = sp.barns
    ? sp.barns
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const filteredBarnIds =
    requestedBarnIds.length > 0
      ? requestedBarnIds.filter((id) => allBarnIds.includes(id))
      : allBarnIds;

  const result = await getTransactions(supabase, {
    barnIds: filteredBarnIds,
    startDate: start,
    endDate: end,
    dateField: "paid_at",
  });

  return (
    <CashFlowReportClient
      barns={barns}
      rows={result.rows}
      initialFilters={{
        start,
        end,
        barnIds: requestedBarnIds.length > 0 ? filteredBarnIds : [],
      }}
      truncated={result.truncated}
    />
  );
}
