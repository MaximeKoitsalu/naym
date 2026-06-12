import { NextRequest, NextResponse } from "next/server";
import { putSwipes } from "@/lib/session";

/**
 * Idempotent full-array PUT. The client sends its ENTIRE swipe array every
 * time — any one successful request heals all previously dropped ones.
 * The server's monotonic guard means an empty webview localStorage can
 * never wipe real progress.
 */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.token !== "string" || !Array.isArray(body.swipes)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const round = body.round === 2 ? 2 : 1;
  const result = await putSwipes(body.token, body.swipes, round);
  if (!result) return NextResponse.json({ error: "expired" }, { status: 404 });
  return NextResponse.json(result);
}
