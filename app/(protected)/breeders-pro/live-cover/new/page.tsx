import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase-server";
import { getUserOperationalBarnIds } from "@/lib/barn-session";
import { NewLiveCoverClient } from "./NewLiveCoverClient";

/**
 * Breeders Pro — Record Live Cover.
 *
 * Parallel to the Record Flush route. Fetches existing mares and
 * stallions for the pickers, then hands off to the client form.
 * The form posts through `recordLiveCoverAction`.
 */
export default async function NewLiveCoverPage() {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const barnIds = await getUserOperationalBarnIds(supabase, user.id);
  if (barnIds.length === 0) redirect("/breeders-pro");
  // Anchor barn for the new live-cover row. The action validates
  // per-horse access, so the actual barn assignment can be derived
  // from the picked mare downstream if needed.
  const barnId = barnIds[0];

  // Existing mares — donor, recipient, or multiple breeding roles.
  const { data: mares } = await supabase
    .from("horses")
    .select("id, name, registration_number, breeding_role")
    .in("barn_id", barnIds)
    .eq("archived", false)
    .in("breeding_role", ["donor", "recipient", "multiple"])
    .order("name", { ascending: true });

  // Existing barn stallions.
  const { data: stallions } = await supabase
    .from("horses")
    .select("id, name, registration_number, breeding_role")
    .in("barn_id", barnIds)
    .eq("archived", false)
    .in("breeding_role", ["stallion", "multiple"])
    .order("name", { ascending: true });

  return (
    <NewLiveCoverClient
      mares={
        (mares ?? []) as {
          id: string;
          name: string;
          registration_number: string | null;
        }[]
      }
      stallions={
        (stallions ?? []) as {
          id: string;
          name: string;
          registration_number: string | null;
        }[]
      }
      barnId={barnId}
    />
  );
}
