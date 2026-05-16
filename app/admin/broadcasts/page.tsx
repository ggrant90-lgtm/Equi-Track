import { createAdminClient } from "@/lib/supabase-admin";
import { BroadcastForm } from "./BroadcastForm";

/**
 * Admin: send a one-off announcement to many users at once.
 *
 * The form on this page composes a broadcast, picks an audience,
 * and on submit fans out one notification row per recipient. The
 * existing bell + feed code surfaces the result with no UI change.
 *
 * Below the form: a table of past broadcasts so the admin can see
 * what they've sent and how many got it.
 */
export default async function BroadcastsPage() {
  const adminClient = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: bcastsRaw } = await (adminClient as any)
    .from("broadcasts")
    .select("id, title, body, icon, link, audience, sent_at, recipient_count")
    .order("sent_at", { ascending: false })
    .limit(50);

  interface BroadcastRow {
    id: string;
    title: string;
    body: string;
    icon: string | null;
    link: string | null;
    audience: { kind: string; feature?: string; user_id?: string; email?: string };
    sent_at: string;
    recipient_count: number;
  }
  const broadcasts = (bcastsRaw ?? []) as BroadcastRow[];

  // Headline metrics for the page banner.
  const [
    { count: profileCount },
    { count: bpCount },
    { count: brpCount },
  ] = await Promise.all([
    adminClient.from("profiles").select("id", { count: "exact", head: true }),
    adminClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("has_business_pro", true),
    adminClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("has_breeders_pro", true),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-barn-dark">
          Broadcasts
        </h1>
        <p className="mt-1 text-sm text-barn-dark/65">
          Send an announcement that lands in every selected user&apos;s
          notification bell. Use sparingly — broadcasts are for moments
          that genuinely deserve attention, not weekly newsletters.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="All users" value={profileCount ?? 0} />
        <Stat label="Business Pro" value={bpCount ?? 0} />
        <Stat label="Breeders Pro" value={brpCount ?? 0} />
      </div>

      <BroadcastForm />

      {/* History */}
      <div className="rounded-2xl border border-barn-dark/10 bg-white shadow-sm">
        <div className="border-b border-barn-dark/10 px-6 py-4">
          <h2 className="font-serif text-lg font-semibold text-barn-dark">
            Recent broadcasts
          </h2>
        </div>
        {broadcasts.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-barn-dark/55">
            Nothing sent yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-barn-dark/10 text-left">
                  <th className="px-6 py-3 font-medium text-barn-dark/60">
                    Sent
                  </th>
                  <th className="px-6 py-3 font-medium text-barn-dark/60">
                    Title
                  </th>
                  <th className="px-6 py-3 font-medium text-barn-dark/60">
                    Audience
                  </th>
                  <th className="px-6 py-3 font-medium text-barn-dark/60">
                    Recipients
                  </th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-barn-dark/5 hover:bg-parchment/30"
                  >
                    <td className="px-6 py-3 text-barn-dark/65 whitespace-nowrap">
                      {new Date(b.sent_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        {b.icon && <span>{b.icon}</span>}
                        <div>
                          <div className="font-medium text-barn-dark">
                            {b.title}
                          </div>
                          <div className="line-clamp-1 text-xs text-barn-dark/55">
                            {b.body}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-xs text-barn-dark/70">
                      {describeAudience(b.audience)}
                    </td>
                    <td className="px-6 py-3 text-barn-dark/70">
                      {b.recipient_count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-barn-dark/10 bg-white p-4 shadow-sm">
      <p className="text-xs text-barn-dark/50">{label}</p>
      <p className="mt-1 text-2xl font-bold text-barn-dark">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function describeAudience(
  audience: { kind: string; feature?: string; user_id?: string; email?: string },
): string {
  if (audience.kind === "all") return "All users";
  if (audience.kind === "feature") {
    if (audience.feature === "business_pro") return "Business Pro users";
    if (audience.feature === "breeders_pro") return "Breeders Pro users";
    if (audience.feature === "no_barnpilot") return "Haven't tried BarnPilot";
    return `Feature: ${audience.feature ?? "?"}`;
  }
  if (audience.kind === "user_by_email") return `Test → ${audience.email}`;
  if (audience.kind === "user") return `Test → user ${audience.user_id}`;
  return audience.kind;
}
