import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase-server";
import { getUserOperationalBarnIds } from "@/lib/barn-session";
import type { Embryo, Flush, Horse } from "@/lib/types";
import { StallionsListClient } from "./StallionsListClient";

/**
 * Breeders Pro — Stallions list.
 *
 * Presentation-layer route. Reads stallions from `horses` and aggregates
 * sired embryo/flush rollups client-side. No migrations, no mutations.
 */
export default async function StallionsListPage() {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const barnIds = await getUserOperationalBarnIds(supabase, user.id);
  if (barnIds.length === 0) redirect("/breeders-pro");

  const { data: stallionHorsesRaw } = await supabase
    .from("horses")
    .select(
      "id, name, barn_name, primary_name_pref, registration_number, breed, color, breeding_role, stallion_stud_fee, archived",
    )
    .in("barn_id", barnIds)
    .in("breeding_role", ["stallion", "multiple"])
    .order("name", { ascending: true });

  const stallions = (stallionHorsesRaw ?? []) as Pick<
    Horse,
    | "id"
    | "name"
    | "barn_name"
    | "primary_name_pref"
    | "registration_number"
    | "breed"
    | "color"
    | "breeding_role"
    | "stallion_stud_fee"
    | "archived"
  >[];

  const stallionIds = stallions.map((s) => s.id);

  // Embryos sired by any of these stallions — used for lifetime rollups.
  let embryos: Pick<
    Embryo,
    "stallion_horse_id" | "status" | "donor_horse_id"
  >[] = [];
  let flushes: Pick<
    Flush,
    "stallion_horse_id" | "flush_date" | "donor_horse_id"
  >[] = [];

  if (stallionIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: embryosRaw } = await (supabase as any)
      .from("embryos")
      .select("stallion_horse_id, status, donor_horse_id")
      .in("stallion_horse_id", stallionIds);
    embryos = (embryosRaw ?? []) as typeof embryos;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: flushesRaw } = await (supabase as any)
      .from("flushes")
      .select("stallion_horse_id, flush_date, donor_horse_id")
      .in("stallion_horse_id", stallionIds);
    flushes = (flushesRaw ?? []) as typeof flushes;
  }

  return (
    <StallionsListClient
      stallions={stallions}
      embryos={embryos}
      flushes={flushes}
    />
  );
}
