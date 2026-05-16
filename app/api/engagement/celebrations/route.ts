import { NextResponse } from "next/server";
import { consumePendingCelebrations } from "@/lib/engagement/pending-celebrations";

/**
 * Drain endpoint for server-action celebrations. The CelebrationProvider
 * on the client hits this on mount; the route reads the
 * `bb_pending_celebrations` cookie set during the most-recent server
 * action, clears it, and returns the queue.
 *
 * Authenticated via the standard session cookie — no extra check
 * here; the cookie carrying the celebrations is httpOnly and
 * scoped to the requesting browser session.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const fires = await consumePendingCelebrations();
  return NextResponse.json({ celebrations: fires });
}
