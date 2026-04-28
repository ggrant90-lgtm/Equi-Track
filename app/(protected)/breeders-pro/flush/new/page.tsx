import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase-server";
import { getUserOperationalBarnIds } from "@/lib/barn-session";
import { NewFlushClient } from "./NewFlushClient";

/**
 * Breeders Pro — Record Flush (event-first).
 *
 * Presentation-layer route. All data fetching uses the exact same auth
 * and barn-context helpers already used elsewhere in the app. Reads only:
 *   - Active barn
 *   - Existing donor-eligible mares for the picker
 *   - Existing barn stallions for the picker
 * No mutations happen here — the form submits through the
 * `createFlushEventFirstAction` server action, which calls the new
 * transactional RPC.
 */
export default async function NewFlushPage() {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const barnIds = await getUserOperationalBarnIds(supabase, user.id);
  if (barnIds.length === 0) redirect("/breeders-pro");
  // Anchor barn for the new flush — first owned, falls back to the
  // first operational barn. The action validates per-horse access.
  const barnId = barnIds[0];

  // Existing donor-eligible mares (donor or multiple)
  const { data: donorHorses } = await supabase
    .from("horses")
    .select("id, name, registration_number, breeding_role")
    .in("barn_id", barnIds)
    .eq("archived", false)
    .in("breeding_role", ["donor", "multiple", "none"])
    .order("name", { ascending: true });

  // Existing barn stallions (stallion or multiple). `none` is excluded for
  // stallion picker because any horse with no breeding_role is just as
  // likely to be a gelding, a foal, etc. Users can still create a new
  // stallion inline if theirs isn't listed.
  const { data: stallionHorses } = await supabase
    .from("horses")
    .select("id, name, registration_number, breeding_role")
    .in("barn_id", barnIds)
    .eq("archived", false)
    .in("breeding_role", ["stallion", "multiple"])
    .order("name", { ascending: true });

  return (
    <NewFlushClient
      donors={(donorHorses ?? []) as {
        id: string;
        name: string;
        registration_number: string | null;
      }[]}
      stallions={(stallionHorses ?? []) as {
        id: string;
        name: string;
        registration_number: string | null;
      }[]}
    />
  );
}
