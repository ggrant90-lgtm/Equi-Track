import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Unified transactions feed across the three tables that hold cost
 * data: activity_log, health_records, and barn_expenses.
 *
 * This is the shared substrate for the Transactions page and every
 * report that needs cost rollups (P&L, Cash Flow, Tax Prep). Each
 * downstream surface filters or aggregates the same shape.
 *
 * Rows always carry:
 *   - source: which table the row came from
 *   - id: row id within that table
 *   - barn_id: scoping
 *   - category-like label (activity_type / record_type / category)
 *   - performed_at, total_cost, payment_status, paid_at, paid_amount
 *   - cost_type (revenue / expense / pass_through)
 *   - vendor_name and horse_id when applicable
 *
 * Only completed entries are returned for activity_log + health_records
 * (status='completed' filter). barn_expenses has no status column so
 * every row is included.
 */

export type TransactionSource = "activity" | "health" | "barn_expense";

export type TransactionCostType =
  | "revenue"
  | "expense"
  | "pass_through";

export interface TransactionRow {
  id: string;
  source: TransactionSource;
  barn_id: string;
  performed_at: string;
  /** Display label — activity_type / record_type / category. */
  category: string;
  /** Horse-id when source is activity/health. Undefined for barn expenses. */
  horse_id?: string | null;
  vendor_name?: string | null;
  description?: string | null;
  notes?: string | null;
  total_cost: number;
  cost_type: TransactionCostType | null;
  payment_status: "unpaid" | "paid" | "partial" | "waived" | null;
  paid_amount: number | null;
  paid_at: string | null;
  client_id?: string | null;
  billable_to_user_id?: string | null;
  billable_to_name?: string | null;
}

export interface GetTransactionsArgs {
  barnIds: string[];
  /** ISO date (inclusive). When omitted, no lower bound. */
  startDate?: string;
  /** ISO date (inclusive). When omitted, no upper bound. */
  endDate?: string;
  /** Cap per source — `null` skips the cap. Defaults to 5000 per source
   *  (15k total worst case) which is fine for any single year of records. */
  limitPerSource?: number | null;
  /**
   * Which timestamp column to apply the date range to. Defaults to
   * `performed_at` (when the activity happened). Cash Flow uses
   * `paid_at` (when the money actually moved). For paid_at, rows
   * without a paid_at are also dropped from the result.
   */
  dateField?: "performed_at" | "paid_at";
}

export interface TransactionsResult {
  rows: TransactionRow[];
  /** True if any of the three source queries hit the limit — caller can
   *  surface a "showing N of many" notice and narrow the date range. */
  truncated: boolean;
}

/**
 * Fetch and merge transactions from all three sources. RLS scopes
 * naturally via the supabase client — no extra auth here.
 */
export async function getTransactions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  args: GetTransactionsArgs,
): Promise<TransactionsResult> {
  if (args.barnIds.length === 0) return { rows: [], truncated: false };
  const limit = args.limitPerSource === null ? null : (args.limitPerSource ?? 5000);
  const dateField = args.dateField ?? "performed_at";

  // Helper to apply the optional date range to a query builder. All
  // three tables share the same column names so this is uniform.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyDate(q: any) {
    if (args.startDate) q = q.gte(dateField, args.startDate);
    if (args.endDate)
      q = q.lte(dateField, `${args.endDate.slice(0, 10)}T23:59:59.999Z`);
    // When filtering on paid_at, exclude rows that haven't been paid
    // yet — they're noise for any cash-movement view.
    if (dateField === "paid_at") q = q.not("paid_at", "is", null);
    return q;
  }

  // Horses referenced by activity/health rows so we can join in
  // barn_id (those tables don't have it directly).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const horsesQ = (supabase as any)
    .from("horses")
    .select("id, barn_id")
    .in("barn_id", args.barnIds);
  const horsesRes = await horsesQ;
  const horseRows = ((horsesRes.data ?? []) as Array<{ id: string; barn_id: string }>);
  const horseToBarn = new Map<string, string>();
  for (const h of horseRows) horseToBarn.set(h.id, h.barn_id);
  const horseIds = horseRows.map((h) => h.id);

  const buildActivity = () => {
    if (horseIds.length === 0) return Promise.resolve({ data: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from("activity_log")
      .select(
        "id, horse_id, activity_type, notes, performed_at, created_at, total_cost, cost_type, payment_status, paid_amount, paid_at, client_id, billable_to_user_id, billable_to_name",
      )
      .in("horse_id", horseIds)
      .not("cost_type", "is", null)
      .eq("status", "completed");
    q = applyDate(q);
    q = q.order(dateField, { ascending: false });
    if (limit !== null) q = q.limit(limit);
    return q;
  };

  const buildHealth = () => {
    if (horseIds.length === 0) return Promise.resolve({ data: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from("health_records")
      .select(
        "id, horse_id, record_type, notes, performed_at, created_at, total_cost, cost_type, payment_status, paid_amount, paid_at, client_id, billable_to_user_id, billable_to_name",
      )
      .in("horse_id", horseIds)
      .not("cost_type", "is", null)
      .eq("status", "completed");
    q = applyDate(q);
    q = q.order(dateField, { ascending: false });
    if (limit !== null) q = q.limit(limit);
    return q;
  };

  const buildBarn = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from("barn_expenses")
      .select(
        "id, barn_id, category, vendor_name, description, notes, performed_at, created_at, total_cost, cost_type, payment_status, paid_amount, paid_at, client_id, billable_to_user_id, billable_to_name",
      )
      .in("barn_id", args.barnIds)
      .not("cost_type", "is", null);
    q = applyDate(q);
    q = q.order(dateField, { ascending: false });
    if (limit !== null) q = q.limit(limit);
    return q;
  };

  const [actRes, healthRes, barnRes] = await Promise.all([
    buildActivity(),
    buildHealth(),
    buildBarn(),
  ]);

  const out: TransactionRow[] = [];
  type ActRow = {
    id: string;
    horse_id: string;
    activity_type: string;
    notes: string | null;
    performed_at: string | null;
    created_at: string;
    total_cost: number | null;
    cost_type: TransactionCostType | null;
    payment_status: TransactionRow["payment_status"];
    paid_amount: number | null;
    paid_at: string | null;
    client_id: string | null;
    billable_to_user_id: string | null;
    billable_to_name: string | null;
  };
  for (const r of ((actRes.data ?? []) as ActRow[])) {
    out.push({
      id: r.id,
      source: "activity",
      barn_id: horseToBarn.get(r.horse_id) ?? "",
      performed_at: r.performed_at ?? r.created_at,
      category: r.activity_type,
      horse_id: r.horse_id,
      vendor_name: null,
      description: null,
      notes: r.notes,
      total_cost: r.total_cost ?? 0,
      cost_type: r.cost_type,
      payment_status: r.payment_status,
      paid_amount: r.paid_amount,
      paid_at: r.paid_at,
      client_id: r.client_id,
      billable_to_user_id: r.billable_to_user_id,
      billable_to_name: r.billable_to_name,
    });
  }
  type HealthRow = {
    id: string;
    horse_id: string;
    record_type: string;
    notes: string | null;
    performed_at: string | null;
    created_at: string;
    total_cost: number | null;
    cost_type: TransactionCostType | null;
    payment_status: TransactionRow["payment_status"];
    paid_amount: number | null;
    paid_at: string | null;
    client_id: string | null;
    billable_to_user_id: string | null;
    billable_to_name: string | null;
  };
  for (const r of ((healthRes.data ?? []) as HealthRow[])) {
    out.push({
      id: r.id,
      source: "health",
      barn_id: horseToBarn.get(r.horse_id) ?? "",
      performed_at: r.performed_at ?? r.created_at,
      category: r.record_type,
      horse_id: r.horse_id,
      vendor_name: null,
      description: null,
      notes: r.notes,
      total_cost: r.total_cost ?? 0,
      cost_type: r.cost_type,
      payment_status: r.payment_status,
      paid_amount: r.paid_amount,
      paid_at: r.paid_at,
      client_id: r.client_id,
      billable_to_user_id: r.billable_to_user_id,
      billable_to_name: r.billable_to_name,
    });
  }
  type BarnRow = {
    id: string;
    barn_id: string;
    category: string;
    vendor_name: string | null;
    description: string | null;
    notes: string | null;
    performed_at: string | null;
    created_at: string;
    total_cost: number | null;
    cost_type: TransactionCostType | null;
    payment_status: TransactionRow["payment_status"];
    paid_amount: number | null;
    paid_at: string | null;
    client_id: string | null;
    billable_to_user_id: string | null;
    billable_to_name: string | null;
  };
  for (const r of ((barnRes.data ?? []) as BarnRow[])) {
    out.push({
      id: r.id,
      source: "barn_expense",
      barn_id: r.barn_id,
      performed_at: r.performed_at ?? r.created_at,
      category: r.category,
      horse_id: null,
      vendor_name: r.vendor_name,
      description: r.description,
      notes: r.notes,
      total_cost: r.total_cost ?? 0,
      cost_type: r.cost_type,
      payment_status: r.payment_status,
      paid_amount: r.paid_amount,
      paid_at: r.paid_at,
      client_id: r.client_id,
      billable_to_user_id: r.billable_to_user_id,
      billable_to_name: r.billable_to_name,
    });
  }

  // Drop rows whose barn_id we couldn't resolve (horse missing /
  // archived horse). Cheap defensive filter.
  const filtered = out.filter((r) => r.barn_id);

  // Merge-sort newest first.
  filtered.sort((a, b) => b.performed_at.localeCompare(a.performed_at));

  const truncated =
    limit !== null &&
    (((actRes.data ?? []) as unknown[]).length === limit ||
      ((healthRes.data ?? []) as unknown[]).length === limit ||
      ((barnRes.data ?? []) as unknown[]).length === limit);

  return { rows: filtered, truncated };
}

/** Pretty-print category strings consistently — barn_expenses
 *  categories arrive title-cased already; activity_type and
 *  record_type can come through as snake_case or with mixed case. */
export function formatCategoryLabel(raw: string): string {
  if (!raw) return "—";
  // If the string already has a space and a capital letter, leave it
  // alone (barn_expenses categories like "Hay" / "Rent/Mortgage").
  if (/\s/.test(raw) && /^[A-Z]/.test(raw)) return raw;
  if (/^[A-Z]/.test(raw) && raw === raw.replace(/_/g, " ")) return raw;
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
