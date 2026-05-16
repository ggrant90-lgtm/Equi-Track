import { createAdminClient } from "@/lib/supabase-admin";
import { PlanBadge } from "@/components/PlanBadge";
import Link from "next/link";
import { UsersTable } from "./UsersTable";

export default async function AdminPage() {
  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch {
    return (
      <div className="rounded-xl bg-red-50 p-6 text-red-700">
        <h2 className="font-semibold">Admin client not configured</h2>
        <p className="mt-2 text-sm">
          Set SUPABASE_SERVICE_ROLE_KEY in your environment variables to enable
          the admin panel.
        </p>
      </div>
    );
  }

  // Fetch metrics
  const [barnsRes, horsesRes, paidRes, compedRes, interestRes] =
    await Promise.all([
      adminClient.from("barns").select("id", { count: "exact", head: true }),
      adminClient.from("horses").select("id", { count: "exact", head: true }).eq("archived", false),
      adminClient
        .from("barns")
        .select("id", { count: "exact", head: true })
        .eq("plan_tier", "paid"),
      adminClient
        .from("barns")
        .select("id", { count: "exact", head: true })
        .eq("plan_tier", "comped"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (adminClient as any)
        .from("paywall_interest")
        .select("id", { count: "exact", head: true })
        .is("contacted_at", null),
    ]);

  const totalBarns = barnsRes.count ?? 0;
  const totalHorses = horsesRes.count ?? 0;
  const paidBarns = paidRes.count ?? 0;
  const compedBarns = compedRes.count ?? 0;
  const pendingInterest = interestRes.count ?? 0;

  // Fetch all barns with owner info
  const { data: barns } = await adminClient
    .from("barns")
    .select("id, name, owner_id, plan_tier, base_stalls, grace_period_ends_at, created_at")
    .order("created_at", { ascending: false });

  // Get horse counts per barn
  const barnIds = (barns ?? []).map((b) => b.id);
  let horseCounts: Record<string, number> = {};
  if (barnIds.length > 0) {
    const { data: counts } = await adminClient
      .from("horses")
      .select("barn_id")
      .in("barn_id", barnIds)
      .eq("archived", false);

    horseCounts = (counts ?? []).reduce(
      (acc, h) => {
        acc[h.barn_id] = (acc[h.barn_id] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  // Fetch all profiles for owner emails + Users table (feature toggles)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allProfiles } = await (adminClient as any)
    .from("profiles")
    .select(
      "id, email, full_name, has_breeders_pro, has_business_pro, has_document_scanner",
    );

  // Fall back to auth.users.email for any user whose profiles.email is empty
  // (e.g., OAuth signups where email landed after the on_auth_user_created
  // trigger fired). listUsers paginates — walk every page.
  const authEmails: Record<string, string> = {};
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (u.email) authEmails[u.id] = u.email;
    }
    if (data.users.length < perPage) break;
  }

  const ownerEmails: Record<string, string> = { ...authEmails };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (allProfiles ?? []) as any[]) {
    if (p.email) ownerEmails[p.id] = p.email;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userRows = ((allProfiles ?? []) as any[]).map((p) => ({
    id: p.id as string,
    email: ownerEmails[p.id as string] ?? "—",
    full_name: p.full_name as string | null,
    has_breeders_pro: !!p.has_breeders_pro,
    has_business_pro: !!p.has_business_pro,
    has_document_scanner: !!p.has_document_scanner,
  }));

  const businessProCount = userRows.filter((u) => u.has_business_pro).length;
  const breedersProCount = userRows.filter((u) => u.has_breeders_pro).length;

  // Document scans this month — from api_call_log.
  const monthStartIso = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1,
  ).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: docScansMonth } = await (adminClient as any)
    .from("api_call_log")
    .select("id", { count: "exact", head: true })
    .eq("endpoint", "documents/extract")
    .gte("called_at", monthStartIso);

  return (
    <div className="space-y-8">
      {/* Quick admin actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/broadcasts"
          className="inline-flex items-center gap-2 rounded-xl border border-barn-dark/15 bg-white px-4 py-2 text-sm font-medium text-barn-dark shadow-sm hover:border-brass-gold hover:bg-parchment"
        >
          📣 Send a broadcast
        </Link>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8">
        {[
          { label: "Total Barns", value: totalBarns },
          { label: "Total Horses", value: totalHorses },
          { label: "Paid Barns", value: paidBarns },
          { label: "Comped Barns", value: compedBarns },
          { label: "Breeders Pro", value: breedersProCount },
          { label: "Business Pro", value: businessProCount },
          { label: "Scans This Month", value: docScansMonth ?? 0 },
          {
            label: "Pending Interest",
            value: pendingInterest,
            href: "/admin/interest",
          },
        ].map((m) => (
          <div
            key={m.label}
            className="rounded-xl border border-barn-dark/10 bg-white p-4 shadow-sm"
          >
            <p className="text-xs text-barn-dark/50">{m.label}</p>
            <p className="mt-1 text-2xl font-bold text-barn-dark">
              {m.value}
            </p>
            {m.href && m.value > 0 ? (
              <Link
                href={m.href}
                className="mt-1 text-xs text-brass-gold hover:underline"
              >
                View →
              </Link>
            ) : null}
          </div>
        ))}
      </div>

      {/* Barns table */}
      <div className="rounded-xl border border-barn-dark/10 bg-white shadow-sm">
        <div className="border-b border-barn-dark/10 px-6 py-4">
          <h2 className="font-serif text-lg font-semibold text-barn-dark">
            All Barns
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-barn-dark/10 text-left">
                <th className="px-6 py-3 font-medium text-barn-dark/60">
                  Barn
                </th>
                <th className="px-6 py-3 font-medium text-barn-dark/60">
                  Owner
                </th>
                <th className="px-6 py-3 font-medium text-barn-dark/60">
                  Plan
                </th>
                <th className="px-6 py-3 font-medium text-barn-dark/60">
                  Base stalls
                </th>
                <th className="px-6 py-3 font-medium text-barn-dark/60">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {(barns ?? []).map((barn) => {
                const hc = horseCounts[barn.id] ?? 0;
                const isOver = hc > barn.base_stalls;
                const inGrace =
                  barn.grace_period_ends_at &&
                  new Date(barn.grace_period_ends_at) > new Date();

                return (
                  <tr
                    key={barn.id}
                    className="border-b border-barn-dark/5 hover:bg-parchment/30"
                  >
                    <td className="px-6 py-3 font-medium text-barn-dark">
                      {barn.name}
                    </td>
                    <td className="px-6 py-3 text-barn-dark/60">
                      {barn.owner_id
                        ? ownerEmails[barn.owner_id] ?? "—"
                        : "—"}
                    </td>
                    <td className="px-6 py-3">
                      <PlanBadge tier={barn.plan_tier} />
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={
                          isOver
                            ? "font-medium text-red-600"
                            : "text-barn-dark/70"
                        }
                      >
                        {hc}/{barn.base_stalls}+blocks
                      </span>
                      {inGrace && (
                        <span className="ml-2 text-xs text-red-500">
                          Grace
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-barn-dark/50">
                      {new Date(barn.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Users table with Breeders Pro / Business Pro toggles */}
      <UsersTable users={userRows} />
    </div>
  );
}
