import { getUserOperationalBarnIds } from "@/lib/barn-session";
import { getHorseDisplayName } from "@/lib/horse-name";
import { createServerComponentClient } from "@/lib/supabase-server";
import type { Pregnancy } from "@/lib/types";
import { redirect } from "next/navigation";
import { PregnancyListClient } from "./PregnancyListClient";

export default async function PregnanciesPage() {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const barnIds = await getUserOperationalBarnIds(supabase, user.id);
  if (barnIds.length === 0) redirect("/dashboard");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pregnanciesRaw, error } = await (supabase as any)
    .from("pregnancies")
    .select("*")
    .in("barn_id", barnIds)
    .order("expected_foaling_date", { ascending: true });

  if (error) {
    return (
      <div className="px-4 py-10 text-barn-red">
        Could not load pregnancies: {error.message}
      </div>
    );
  }

  const pregnancies = (pregnanciesRaw ?? []) as Pregnancy[];

  // Fetch horse names
  const horseIds = new Set<string>();
  for (const p of pregnancies) {
    if (p.surrogate_horse_id) horseIds.add(p.surrogate_horse_id);
    if (p.donor_horse_id) horseIds.add(p.donor_horse_id);
    if (p.stallion_horse_id) horseIds.add(p.stallion_horse_id);
  }

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

  return <PregnancyListClient pregnancies={pregnancies} horseNames={horseNames} />;
}
