import { cookies } from "next/headers";
import type { CelebrationFire } from "./celebrations";

/**
 * Bridge between server-action celebrations and the client overlay.
 *
 * Many of our actions use `redirect()` after success (the log form,
 * the horse-create flow). Server actions can't write to client state
 * or sessionStorage, and they don't have a returnable path when they
 * redirect. The cleanest cross-redirect channel we have is a short-
 * lived cookie.
 *
 * On the server action: after a successful mutation, call
 * `stashPendingCelebrations(fires)` BEFORE `redirect()`. On the next
 * page load, the CelebrationProvider hits `/api/engagement/celebrations`
 * (which calls `consumePendingCelebrations()`) and gets the fires.
 *
 * The cookie is httpOnly, scoped to /, and lives for 60 seconds —
 * long enough for the redirect to settle but not so long that a stale
 * celebration shows up tomorrow.
 */

const COOKIE_NAME = "bb_pending_celebrations";

export async function stashPendingCelebrations(
  fires: CelebrationFire[],
): Promise<void> {
  if (fires.length === 0) return;
  try {
    const cookieStore = await cookies();
    // Append to whatever's already pending so multiple actions in a
    // session don't clobber each other.
    const existing = cookieStore.get(COOKIE_NAME)?.value;
    let merged: CelebrationFire[] = fires;
    if (existing) {
      try {
        const prior = JSON.parse(existing) as CelebrationFire[];
        if (Array.isArray(prior)) merged = [...prior, ...fires];
      } catch {
        // ignore malformed prior payload
      }
    }
    cookieStore.set(COOKIE_NAME, JSON.stringify(merged), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60,
    });
  } catch (err) {
    // cookies() may throw in render contexts — swallow.
    console.warn(
      "[engagement.celebrations] stash failed",
      (err as Error).message,
    );
  }
}

export async function consumePendingCelebrations(): Promise<CelebrationFire[]> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(COOKIE_NAME)?.value;
    if (!raw) return [];
    cookieStore.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
    const parsed = JSON.parse(raw) as CelebrationFire[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
