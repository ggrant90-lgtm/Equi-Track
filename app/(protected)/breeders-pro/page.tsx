import { redirect } from "next/navigation";

/**
 * Breeders Pro entry — redirects to the Overview dashboard. The old
 * Embryo Bank that used to live here moved to /breeders-pro/embryos
 * so the BP nav has a coherent default landing.
 */
export default function BreedersProRoot() {
  redirect("/breeders-pro/overview");
}
