import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase-server";
import { getUserOperationalBarnIds } from "@/lib/barn-session";
import { getTransactions } from "@/lib/business-pro/transactions-query";
import { PnLReportClient } from "./PnLReportClient";

/**
 * Business Pro — Profit & Loss Report.
 *
 * Classic P&L for a chosen period: revenue rolled up by category,
 * expenses rolled up by category, net income at the bottom. When the
 * user enables comparison, we also fetch the same-length prior period
 * so the client can render Δ columns (this month vs last month, YTD
 * vs prior YTD, etc.).
 *
 * Data substrate: the same `getTransactions` helper that powers
 * /business-pro/transactions. Categories come from each row's natural
 * label (activity_type / record_type / barn_expense category).
 *
 * Defaults: current calendar month, all operational barns, comparison
 * to the prior period off (it's a click to enable).
 */
export default async function PnLPage({
  searchParams,
}: {
  searchParams: Promise<{
    start?: string;
    end?: string;
    barns?: string;
    compare?: string;
  }>;
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
      <PnLReportClient
        barns={[]}
        currentRows={[]}
        priorRows={[]}
        initialFilters={{
          start: null,
          end: null,
          barnIds: [],
          compare: false,
        }}
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

  // Default range: current calendar month.
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const defaultEnd = now.toISOString().slice(0, 10);
  const start = sp.start ?? defaultStart;
  const end = sp.end ?? defaultEnd;
  const compare = sp.compare === "1";

  // Barn filter — intersect with the user's operational set.
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

  // Prior period: same length as the current range, immediately preceding.
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const spanMs = Math.max(0, endMs - startMs);
  const priorEnd = new Date(startMs - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const priorStart = new Date(startMs - 24 * 60 * 60 * 1000 - spanMs)
    .toISOString()
    .slice(0, 10);

  const [currentResult, priorResult] = await Promise.all([
    getTransactions(supabase, {
      barnIds: filteredBarnIds,
      startDate: start,
      endDate: end,
    }),
    compare
      ? getTransactions(supabase, {
          barnIds: filteredBarnIds,
          startDate: priorStart,
          endDate: priorEnd,
        })
      : Promise.resolve({ rows: [], truncated: false }),
  ]);

  return (
    <PnLReportClient
      barns={barns}
      currentRows={currentResult.rows}
      priorRows={priorResult.rows}
      initialFilters={{
        start,
        end,
        barnIds: requestedBarnIds.length > 0 ? filteredBarnIds : [],
        compare,
      }}
      truncated={currentResult.truncated || priorResult.truncated}
    />
  );
}
