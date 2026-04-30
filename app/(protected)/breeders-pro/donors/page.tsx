import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase-server";
import { getUserOperationalBarnIds } from "@/lib/barn-session";
import type { Flush, Horse } from "@/lib/types";
import { DonorsListClient } from "./DonorsListClient";

/**
 * Breeders Pro — Donor Mares list.
 *
 * Presentation-layer route. Reads donors from the existing `horses`
 * table plus a rollup query against `flushes`. No migrations, no
 * mutations, no new columns.
 */
export default async function DonorsListPage() {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const barnIds = await getUserOperationalBarnIds(supabase, user.id);
  if (barnIds.length === 0) redirect("/breeders-pro");

  const { data: donorHorsesRaw } = await supabase
    .from("horses")
    .select(
      "id, name, barn_name, primary_name_pref, registration_number, breed, color, breeding_role, reproductive_status, lifetime_embryo_count, lifetime_live_foal_count, lifetime_loss_count, archived",
    )
    .in("barn_id", barnIds)
    .in("breeding_role", ["donor", "multiple"])
    .order("name", { ascending: true });

  const donors = (donorHorsesRaw ?? []) as Pick<
    Horse,
    | "id"
    | "name"
    | "barn_name"
    | "primary_name_pref"
    | "registration_number"
    | "breed"
    | "color"
    | "breeding_role"
    | "reproductive_status"
    | "lifetime_embryo_count"
    | "lifetime_live_foal_count"
    | "lifetime_loss_count"
    | "archived"
  >[];

  // Rollup: last-flush date and flush count per donor.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: flushesRaw } = await (supabase as any)
    .from("flushes")
    .select("donor_horse_id, flush_date, embryo_count")
    .in("barn_id", barnIds);

  const flushes = (flushesRaw ?? []) as Pick<
    Flush,
    "donor_horse_id" | "flush_date" | "embryo_count"
  >[];

  return <DonorsListClient donors={donors} flushes={flushes} />;
}
