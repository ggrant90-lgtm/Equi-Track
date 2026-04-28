import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/lib/supabase-server";
import { getUserOperationalBarnIds } from "@/lib/barn-session";
import { NewOPUClient } from "./NewOPUClient";

/**
 * Breeders Pro — Record OPU Session.
 *
 * Event-first entry point for the ICSI pipeline. User selects
 * (or creates) a donor mare, enters aspiration details and
 * oocyte count, and submits. The RPC atomically creates the
 * OPU session + N individual oocyte rows with auto-generated
 * codes (OC-YYYY-NNNN).
 */
export default async function NewOPUPage() {
  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/signin");

  const barnIds = await getUserOperationalBarnIds(supabase, user.id);
  if (barnIds.length === 0) redirect("/breeders-pro");
  // Anchor barn for the new OPU session. Per-horse access is checked
  // by the action when the donor is finalized.
  const barnId = barnIds[0];

  // Fetch donor mares for the donor picker — donor and multiple roles.
  const { data: mares } = await supabase
    .from("horses")
    .select("id, name, registration_number, breeding_role")
    .in("barn_id", barnIds)
    .eq("archived", false)
    .in("breeding_role", ["donor", "multiple"])
    .order("name", { ascending: true });

  return (
    <NewOPUClient
      barnId={barnId}
      mares={
        (mares ?? []) as {
          id: string;
          name: string;
          registration_number: string | null;
        }[]
      }
    />
  );
}
