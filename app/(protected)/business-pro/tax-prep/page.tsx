import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase-server";
import { getUserOperationalBarnIds } from "@/lib/barn-session";
import { getTransactions } from "@/lib/business-pro/transactions-query";
import { TaxPrepReportClient } from "./TaxPrepReportClient";

/**
 * Business Pro — Tax Prep.
 *
 * Schedule-F-flavored year-in-review for handing to an accountant:
 *
 *   1. Revenue + Expenses for the calendar year, grouped by the
 *      user's own categories (we don't try to auto-map to IRS lines —
 *      the accountant does that, but the totals are sound).
 *   2. 1099-NEC candidates: payees paid more than $600 in the year.
 *   3. CSVs sized for accountants: one summary file, one 1099 file.
 *
 * Default basis is **cash** (paid_at + paid_amount): when money moved
 * and how much. The user can toggle to accrual (performed_at +
 * total_cost) if they elect that method. Default year is the most
 * recently completed calendar year — i.e. while you're still working
 * on last year's taxes.
 */
export default async function TaxPrepPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    barns?: string;
    basis?: "cash" | "accrual";
  }>;
}) {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const sp = await searchParams;

  const allBarnIds = await getUserOperationalBarnIds(supabase, user.id);
  const now = new Date();
  // Default to last completed year (e.g., in May 2026 → 2025).
  const defaultYear = now.getFullYear() - 1;
  const year = Math.max(2000, Math.min(2100, Number(sp.year) || defaultYear));
  const basis: "cash" | "accrual" = sp.basis === "accrual" ? "accrual" : "cash";
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  if (allBarnIds.length === 0) {
    return (
      <TaxPrepReportClient
        barns={[]}
        rows={[]}
        initialFilters={{ year, barnIds: [], basis }}
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
    startDate,
    endDate,
    dateField: basis === "cash" ? "paid_at" : "performed_at",
  });

  return (
    <TaxPrepReportClient
      barns={barns}
      rows={result.rows}
      initialFilters={{
        year,
        barnIds: requestedBarnIds.length > 0 ? filteredBarnIds : [],
        basis,
      }}
      truncated={result.truncated}
    />
  );
}
