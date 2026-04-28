import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase-server";
import { getUserOperationalBarnIds } from "@/lib/barn-session";
import type { Horse, Pregnancy } from "@/lib/types";
import { SurrogatesListClient } from "./SurrogatesListClient";

/**
 * Breeders Pro — Surrogates list.
 *
 * Presentation-layer route. Reads recipient mares from `horses` and
 * aggregates carrier history from `pregnancies` client-side.
 */
export default async function SurrogatesListPage() {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const barnIds = await getUserOperationalBarnIds(supabase, user.id);
  if (barnIds.length === 0) redirect("/breeders-pro");

  const { data: recipientHorsesRaw } = await supabase
    .from("horses")
    .select(
      "id, name, registration_number, breed, color, breeding_role, reproductive_status, recipient_herd_id, archived",
    )
    .in("barn_id", barnIds)
    .in("breeding_role", ["recipient", "multiple"])
    .order("name", { ascending: true });

  const surrogates = (recipientHorsesRaw ?? []) as Pick<
    Horse,
    | "id"
    | "name"
    | "registration_number"
    | "breed"
    | "color"
    | "breeding_role"
    | "reproductive_status"
    | "recipient_herd_id"
    | "archived"
  >[];

  const surrogateIds = surrogates.map((s) => s.id);

  let pregnancies: Pick<
    Pregnancy,
    "surrogate_horse_id" | "status" | "transfer_date" | "expected_foaling_date"
  >[] = [];

  if (surrogateIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pregRaw } = await (supabase as any)
      .from("pregnancies")
      .select(
        "surrogate_horse_id, status, transfer_date, expected_foaling_date",
      )
      .in("surrogate_horse_id", surrogateIds);
    pregnancies = (pregRaw ?? []) as typeof pregnancies;
  }

  return (
    <SurrogatesListClient
      surrogates={surrogates}
      pregnancies={pregnancies}
    />
  );
}
