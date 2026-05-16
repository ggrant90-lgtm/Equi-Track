import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase-server";
import { AgingReportClient } from "./AgingReportClient";

/**
 * Business Pro — Aging Report.
 *
 * Classic accounts-receivable aging schedule: one row per client,
 * columns for Current (0-30), 31-60, 61-90, and 90+ day buckets,
 * with totals at the bottom.
 *
 * The data fetch mirrors /business-pro/receivables — unpaid /
 * partial entries (not already on an invoice) + unpaid invoices —
 * but rolls everything up by client + age bucket for the report
 * view. Drill-downs link back to Receivables with the appropriate
 * filter applied so the user can take action.
 */
export default async function AgingReportPage() {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  // Owned barns only — matches Receivables scope.
  const { data: ownedBarns } = await supabase
    .from("barns")
    .select("id, name")
    .eq("owner_id", user.id);
  const barns = (ownedBarns ?? []) as { id: string; name: string }[];
  const barnIds = barns.map((b) => b.id);

  if (barnIds.length === 0) {
    return (
      <AgingReportClient
        rows={[]}
        barns={[]}
        bucketTotals={{ current: 0, b31_60: 0, b61_90: 0, b90_plus: 0 }}
        grandTotal={0}
      />
    );
  }

  // Horses → barn_id map (activity_log / health_records don't carry
  // barn_id directly).
  const { data: horseRows } = await supabase
    .from("horses")
    .select("id, name, barn_id")
    .in("barn_id", barnIds)
    .eq("archived", false);
  const horses = (horseRows ?? []) as {
    id: string;
    name: string;
    barn_id: string;
  }[];
  const horseIds = horses.map((h) => h.id);
  const horseToBarn: Record<string, string> = {};
  for (const h of horses) horseToBarn[h.id] = h.barn_id;

  // Pull the three streams of unpaid items + open invoices, exactly
  // like Receivables does.
  const [
    { data: actUnpaid },
    { data: healthUnpaid },
    { data: barnUnpaid },
    { data: invoicesRaw },
  ] = await Promise.all([
    horseIds.length > 0
      ? supabase
          .from("activity_log")
          .select(
            "id, horse_id, performed_at, created_at, total_cost, paid_amount, client_id, billable_to_user_id, billable_to_name",
          )
          .in("horse_id", horseIds)
          .in("payment_status", ["unpaid", "partial"])
          .in("cost_type", ["revenue", "pass_through"])
          .is("invoice_id", null)
          .eq("status", "completed")
          .limit(5000)
      : Promise.resolve({ data: [] }),
    horseIds.length > 0
      ? supabase
          .from("health_records")
          .select(
            "id, horse_id, performed_at, created_at, total_cost, paid_amount, client_id, billable_to_user_id, billable_to_name",
          )
          .in("horse_id", horseIds)
          .in("payment_status", ["unpaid", "partial"])
          .in("cost_type", ["revenue", "pass_through"])
          .is("invoice_id", null)
          .eq("status", "completed")
          .limit(5000)
      : Promise.resolve({ data: [] }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("barn_expenses")
      .select(
        "id, barn_id, performed_at, created_at, total_cost, paid_amount, client_id, billable_to_user_id, billable_to_name",
      )
      .in("barn_id", barnIds)
      .in("payment_status", ["unpaid", "partial"])
      .in("cost_type", ["revenue", "pass_through"])
      .is("invoice_id", null)
      .limit(5000),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("invoices")
      .select(
        "id, barn_id, invoice_number, client_id, billable_to_user_id, billable_to_name, issue_date, due_date, status, subtotal, paid_amount, created_at",
      )
      .in("barn_id", barnIds)
      .in("status", ["sent", "partial"])
      .limit(2000),
  ]);

  // Resolve client + member names for display.
  const billableUserIds = new Set<string>();
  const clientIds = new Set<string>();
  type AnyAR = {
    client_id: string | null;
    billable_to_user_id: string | null;
  };
  const collect = (rows: unknown[]) => {
    for (const r of rows as AnyAR[]) {
      if (r.client_id) clientIds.add(r.client_id);
      if (r.billable_to_user_id) billableUserIds.add(r.billable_to_user_id);
    }
  };
  collect((actUnpaid ?? []) as unknown[]);
  collect((healthUnpaid ?? []) as unknown[]);
  collect((barnUnpaid ?? []) as unknown[]);
  collect((invoicesRaw ?? []) as unknown[]);

  const profileNames: Record<string, string> = {};
  if (billableUserIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", [...billableUserIds]);
    for (const p of (profiles ?? []) as Array<{
      id: string;
      full_name: string | null;
    }>) {
      profileNames[p.id] = p.full_name?.trim() || "Member";
    }
  }
  const clientNames: Record<string, string> = {};
  if (clientIds.size > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: clientRows } = await (supabase as any)
      .from("barn_clients")
      .select("id, display_name")
      .in("id", [...clientIds]);
    for (const c of (clientRows ?? []) as Array<{
      id: string;
      display_name: string | null;
    }>) {
      clientNames[c.id] = c.display_name?.trim() || "Client";
    }
  }

  // ── Bucket aging ───────────────────────────────────────────────
  const now = new Date();
  const todayMs = now.getTime();
  function bucketFor(ageDays: number): "current" | "b31_60" | "b61_90" | "b90_plus" {
    if (ageDays <= 30) return "current";
    if (ageDays <= 60) return "b31_60";
    if (ageDays <= 90) return "b61_90";
    return "b90_plus";
  }
  function daysAgo(iso: string): number {
    const t = new Date(iso).getTime();
    return Math.max(
      0,
      Math.floor((todayMs - t) / (1000 * 60 * 60 * 24)),
    );
  }
  function clientKey(r: {
    client_id?: string | null;
    billable_to_user_id?: string | null;
    billable_to_name?: string | null;
  }): string {
    if (r.client_id) return `c:${r.client_id}`;
    if (r.billable_to_user_id) return `u:${r.billable_to_user_id}`;
    const n = r.billable_to_name?.trim().toLowerCase();
    if (n) return `n:${n}`;
    return "unassigned";
  }
  function clientLabel(r: {
    client_id?: string | null;
    billable_to_user_id?: string | null;
    billable_to_name?: string | null;
  }): string {
    if (r.client_id && clientNames[r.client_id]) return clientNames[r.client_id];
    if (r.billable_to_user_id && profileNames[r.billable_to_user_id])
      return profileNames[r.billable_to_user_id];
    if (r.billable_to_name) return r.billable_to_name.trim();
    return "Unassigned";
  }

  type Row = {
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
  };
  const map = new Map<string, Row>();
  const ensureRow = (key: string, label: string): Row => {
    let r = map.get(key);
    if (!r) {
      r = {
        key,
        label,
        current: 0,
        b31_60: 0,
        b61_90: 0,
        b90_plus: 0,
        total: 0,
        entryCount: 0,
        invoiceCount: 0,
        oldestAgeDays: 0,
      };
      map.set(key, r);
    }
    return r;
  };

  // Helper: process a non-invoice row. "Age" is from performed_at.
  type EntryRow = {
    performed_at: string | null;
    created_at: string;
    total_cost: number | null;
    paid_amount: number | null;
    client_id: string | null;
    billable_to_user_id: string | null;
    billable_to_name: string | null;
  };
  const processEntry = (e: EntryRow) => {
    const remaining = (e.total_cost ?? 0) - (e.paid_amount ?? 0);
    if (remaining <= 0) return;
    const at = e.performed_at ?? e.created_at;
    const age = daysAgo(at);
    const key = clientKey(e);
    const row = ensureRow(key, clientLabel(e));
    const b = bucketFor(age);
    row[b] += remaining;
    row.total += remaining;
    row.entryCount += 1;
    if (age > row.oldestAgeDays) row.oldestAgeDays = age;
  };

  for (const e of (actUnpaid ?? []) as EntryRow[]) processEntry(e);
  for (const e of (healthUnpaid ?? []) as EntryRow[]) processEntry(e);
  for (const e of (barnUnpaid ?? []) as EntryRow[]) processEntry(e);

  // Invoices — age from due_date when present, otherwise issue_date.
  type InvoiceRow = {
    id: string;
    client_id: string | null;
    billable_to_user_id: string | null;
    billable_to_name: string | null;
    issue_date: string | null;
    due_date: string | null;
    subtotal: number | null;
    paid_amount: number | null;
    status: string | null;
  };
  for (const inv of (invoicesRaw ?? []) as InvoiceRow[]) {
    const remaining = (inv.subtotal ?? 0) - (inv.paid_amount ?? 0);
    if (remaining <= 0) continue;
    const at = inv.due_date ?? inv.issue_date;
    if (!at) continue;
    const age = daysAgo(at);
    const key = clientKey(inv);
    const row = ensureRow(key, clientLabel(inv));
    const b = bucketFor(age);
    row[b] += remaining;
    row.total += remaining;
    row.invoiceCount += 1;
    if (age > row.oldestAgeDays) row.oldestAgeDays = age;
  }

  const rows = [...map.values()].sort((a, b) => b.total - a.total);
  const bucketTotals = rows.reduce(
    (acc, r) => ({
      current: acc.current + r.current,
      b31_60: acc.b31_60 + r.b31_60,
      b61_90: acc.b61_90 + r.b61_90,
      b90_plus: acc.b90_plus + r.b90_plus,
    }),
    { current: 0, b31_60: 0, b61_90: 0, b90_plus: 0 },
  );
  const grandTotal =
    bucketTotals.current +
    bucketTotals.b31_60 +
    bucketTotals.b61_90 +
    bucketTotals.b90_plus;

  return (
    <AgingReportClient
      rows={rows}
      barns={barns}
      bucketTotals={bucketTotals}
      grandTotal={grandTotal}
    />
  );
}
