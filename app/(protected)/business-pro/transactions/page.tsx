import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase-server";
import { getUserOperationalBarnIds } from "@/lib/barn-session";
import { getTransactions } from "@/lib/business-pro/transactions-query";
import { TransactionsClient } from "./TransactionsClient";

/**
 * Business Pro — Transactions. Unified, filterable view of every
 * priced entry (activity logs with cost, health records with cost,
 * barn expenses). The shared `getTransactions` helper drives this
 * page as well as future P&L / Cash Flow / Tax Prep reports.
 *
 * Defaults: last 12 months, all of the user's operational barns.
 * The client component owns the rest of the filtering + the
 * category totals strip + the CSV export.
 */
export default async function TransactionsPage({
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
      <TransactionsClient
        barns={[]}
        initialRows={[]}
        initialFilters={{ start: null, end: null, barnIds: [] }}
        truncated={false}
      />
    );
  }

  // Pull the user's barn names for the picker chip row.
  const { data: barnRows } = await supabase
    .from("barns")
    .select("id, name")
    .in("id", allBarnIds)
    .order("name", { ascending: true });
  const barns = (barnRows ?? []) as Array<{ id: string; name: string }>;

  // Read URL state — falls back to "last 12 months" when no range
  // is supplied. Date strings are ISO YYYY-MM-DD.
  // eslint-disable-next-line react-hooks/purity
  const now = new Date();
  const twelveMonthsAgo = new Date(
    now.getFullYear(),
    now.getMonth() - 12,
    now.getDate(),
  );
  const defaultStart = twelveMonthsAgo.toISOString().slice(0, 10);
  const defaultEnd = now.toISOString().slice(0, 10);

  const start = sp.start ?? defaultStart;
  const end = sp.end ?? defaultEnd;

  // URL barn filter: comma-separated UUIDs. Intersect with the user's
  // allowed set so a stale or malicious URL can't pull from a barn
  // they don't own.
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
  });

  return (
    <TransactionsClient
      barns={barns}
      initialRows={result.rows}
      initialFilters={{
        start,
        end,
        barnIds: requestedBarnIds.length > 0 ? filteredBarnIds : [],
      }}
      truncated={result.truncated}
    />
  );
}
