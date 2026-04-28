import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase-server";
import { getUserOperationalBarnIds } from "@/lib/barn-session";
import { getHorseDisplayName } from "@/lib/horse-name";
import { FoalingRecordsClient } from "./FoalingRecordsClient";

export default async function FoalingRecordsPage() {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const barnIds = await getUserOperationalBarnIds(supabase, user.id);
  if (barnIds.length === 0) redirect("/breeders-pro");

  // Fetch all foalings across the user's operational barns.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: foalings } = await (supabase as any)
    .from("foalings")
    .select("*")
    .in("barn_id", barnIds)
    .order("foaling_date", { ascending: false });

  // Collect horse IDs for name lookups
  const horseIds = new Set<string>();
  for (const f of foalings ?? []) {
    if (f.surrogate_horse_id) horseIds.add(f.surrogate_horse_id);
    if (f.foal_horse_id) horseIds.add(f.foal_horse_id);
  }

  // Collect pregnancy IDs to get donor/stallion info
  const pregIds = (foalings ?? [])
    .map((f: { pregnancy_id: string }) => f.pregnancy_id)
    .filter(Boolean);

  let pregnancyMap: Record<string, { donor_horse_id: string; stallion_horse_id: string | null }> = {};
  if (pregIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pregnancies } = await (supabase as any)
      .from("pregnancies")
      .select("id, donor_horse_id, stallion_horse_id")
      .in("id", pregIds);
    for (const p of pregnancies ?? []) {
      pregnancyMap[p.id] = { donor_horse_id: p.donor_horse_id, stallion_horse_id: p.stallion_horse_id };
      if (p.donor_horse_id) horseIds.add(p.donor_horse_id);
      if (p.stallion_horse_id) horseIds.add(p.stallion_horse_id);
    }
  }

  // Fetch horse names
  const horseNames: Record<string, string> = {};
  if (horseIds.size > 0) {
    const { data: horses } = await supabase
      .from("horses")
      .select("id, name, barn_name, primary_name_pref")
      .in("id", [...horseIds]);
    for (const h of horses ?? []) {
      horseNames[h.id] = getHorseDisplayName(h);
    }
  }

  return (
    <FoalingRecordsClient
      foalings={(foalings ?? []) as any[]}
      pregnancyMap={pregnancyMap}
      horseNames={horseNames}
    />
  );
}
