import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase-server";
import { getUserOperationalBarnIds } from "@/lib/barn-session";
import { BreedingHubClient } from "./BreedingHubClient";

/**
 * Breeders Pro — New Breeding Event hub.
 *
 * Universal entry point for all breeding methods: Flush (ET),
 * Traditional Carry (Live Cover + AI), and ICSI/OPU. Routes the
 * user to the appropriate form based on their selection.
 */
export default async function BreedingHubPage() {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const barnIds = await getUserOperationalBarnIds(supabase, user.id);
  if (barnIds.length === 0) redirect("/breeders-pro");

  return <BreedingHubClient />;
}
