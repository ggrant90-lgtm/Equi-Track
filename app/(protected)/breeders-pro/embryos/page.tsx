import { getUserOperationalBarnIds } from "@/lib/barn-session";
import {
  computeEmbryoLocation,
  type EmbryoLocation,
} from "@/lib/embryo-location";
import { createServerComponentClient } from "@/lib/supabase-server";
import type { Embryo } from "@/lib/types";
import { redirect } from "next/navigation";
import { EmbryoBankClient } from "./EmbryoBankClient";
import { BreedersProWelcome } from "@/components/breeders-pro/BreedersProWelcome";

export default async function EmbryoBankPage() {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const barnIds = await getUserOperationalBarnIds(supabase, user.id);

  // New user with no program? Show the Breeders Pro onboarding screen
  // instead of redirecting to BarnBook's dashboard.
  if (barnIds.length === 0) return <BreedersProWelcome />;

  // Edit rights: any operational barn membership grants embryo edit
  // rights here, since the Embryo Bank now spans every barn the user
  // can write to. The page-level check just gates whether the New
  // Embryo button shows up; row-level RLS still enforces per-barn
  // permission on writes.
  const canEdit = true;

  // Fetch all embryos across the user's operational barns.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: embryosRaw, error } = await (supabase as any)
    .from("embryos")
    .select("*")
    .in("barn_id", barnIds)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="px-4 py-10 text-barn-red">
        Could not load embryos: {error.message}
      </div>
    );
  }

  const embryos = (embryosRaw ?? []) as Embryo[];

  // ----- Pregnancies for these embryos (for Current Location compute) -----
  // The Embryo Bank list lives at the top of the Breeders Pro nav and has
  // to know each embryo's current location at-a-glance — including the
  // surrogate name for transferred embryos. We fetch the linked pregnancy
  // and foaling rows in bulk so the location helper can render them.
  const embryoIds = embryos.map((e) => e.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pregRaw } = embryoIds.length > 0
    ? await (supabase as any)
        .from("pregnancies")
        .select(
          "id, embryo_id, surrogate_horse_id, transfer_date, expected_foaling_date, status",
        )
        .in("embryo_id", embryoIds)
    : { data: [] };
  const pregByEmbryoId = new Map<
    string,
    {
      id: string;
      surrogate_horse_id: string | null;
      transfer_date: string | null;
      expected_foaling_date: string | null;
      status: string;
    }
  >();
  for (const p of (pregRaw ?? []) as Array<{
    id: string;
    embryo_id: string;
    surrogate_horse_id: string | null;
    transfer_date: string | null;
    expected_foaling_date: string | null;
    status: string;
  }>) {
    pregByEmbryoId.set(p.embryo_id, {
      id: p.id,
      surrogate_horse_id: p.surrogate_horse_id,
      transfer_date: p.transfer_date,
      expected_foaling_date: p.expected_foaling_date,
      status: p.status,
    });
  }

  // ----- Foalings for those pregnancies -----
  const pregIds = [...pregByEmbryoId.values()].map((p) => p.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: foalingsRaw } = pregIds.length > 0
    ? await (supabase as any)
        .from("foalings")
        .select("id, pregnancy_id, foal_horse_id, foaling_date")
        .in("pregnancy_id", pregIds)
    : { data: [] };
  const foalingByPregId = new Map<
    string,
    { id: string; foal_horse_id: string | null; foaling_date: string | null }
  >();
  for (const f of (foalingsRaw ?? []) as Array<{
    id: string;
    pregnancy_id: string;
    foal_horse_id: string | null;
    foaling_date: string | null;
  }>) {
    foalingByPregId.set(f.pregnancy_id, {
      id: f.id,
      foal_horse_id: f.foal_horse_id,
      foaling_date: f.foaling_date,
    });
  }

  // ----- Horse name lookup: donors, stallions, surrogates, foals -----
  const horseIds = new Set<string>();
  for (const e of embryos) {
    horseIds.add(e.donor_horse_id);
    if (e.stallion_horse_id) horseIds.add(e.stallion_horse_id);
  }
  for (const p of pregByEmbryoId.values()) {
    if (p.surrogate_horse_id) horseIds.add(p.surrogate_horse_id);
  }
  for (const f of foalingByPregId.values()) {
    if (f.foal_horse_id) horseIds.add(f.foal_horse_id);
  }

  const horseNames: Record<string, string> = {};
  if (horseIds.size > 0) {
    const { data: horses } = await supabase
      .from("horses")
      .select("id, name")
      .in("id", [...horseIds]);
    for (const h of horses ?? []) {
      horseNames[h.id] = h.name;
    }
  }

  // ----- Compute locations server-side (same shape as donor/stallion) -----
  const embryoLocations: Record<string, EmbryoLocation> = {};
  for (const e of embryos) {
    const preg = pregByEmbryoId.get(e.id) ?? null;
    const foal = preg ? (foalingByPregId.get(preg.id) ?? null) : null;
    embryoLocations[e.id] = computeEmbryoLocation({
      embryo: e as unknown as Parameters<
        typeof computeEmbryoLocation
      >[0]["embryo"],
      pregnancy: preg,
      foaling: foal,
      horseNames,
    });
  }

  return (
    <EmbryoBankClient
      embryos={embryos}
      embryoLocations={embryoLocations}
      horseNames={horseNames}
      canEdit={canEdit}
    />
  );
}
