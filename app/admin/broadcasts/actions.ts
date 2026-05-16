"use server";

import { isUserAdmin } from "@/lib/admin";
import { createServerComponentClient } from "@/lib/supabase-server";
import {
  createBroadcast,
  type BroadcastAudience,
} from "@/lib/engagement/broadcasts";
import { revalidatePath } from "next/cache";

export type SendBroadcastState = {
  ok?: boolean;
  error?: string;
  recipientCount?: number;
};

/**
 * Admin server action — composes a broadcast announcement and fans
 * it out into per-user notification rows. Caller must be a platform
 * admin (gate enforced here as belt + suspenders alongside the
 * /admin layout's auth check).
 */
export async function sendBroadcastAction(
  _prev: SendBroadcastState | null,
  formData: FormData,
): Promise<SendBroadcastState> {
  const admin = await isUserAdmin();
  if (!admin) return { error: "Not authorized." };

  const supabase = await createServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const icon = String(formData.get("icon") ?? "").trim() || undefined;
  const link = String(formData.get("link") ?? "").trim() || undefined;
  const audienceKind = String(formData.get("audience_kind") ?? "all");
  const featureSegment = String(formData.get("feature_segment") ?? "");
  const userEmail = String(formData.get("user_email") ?? "").trim();

  let audience: BroadcastAudience;
  if (audienceKind === "feature") {
    if (
      featureSegment !== "business_pro" &&
      featureSegment !== "breeders_pro" &&
      featureSegment !== "no_barnpilot"
    ) {
      return { error: "Pick a feature segment." };
    }
    audience = { kind: "feature", feature: featureSegment };
  } else if (audienceKind === "user_by_email") {
    if (!userEmail) return { error: "Email is required for test send." };
    audience = { kind: "user_by_email", email: userEmail };
  } else {
    audience = { kind: "all" };
  }

  const result = await createBroadcast({
    sentBy: user.id,
    title,
    body,
    icon,
    link,
    audience,
  });

  if (!result.ok) {
    return { error: result.error ?? "Could not send the broadcast." };
  }

  revalidatePath("/admin/broadcasts");
  return { ok: true, recipientCount: result.recipientCount };
}
