import { NextRequest, NextResponse } from "next/server";
import { getReveal } from "@/lib/session";

/**
 * THE BLINDNESS BOUNDARY. This endpoint returns the server-computed
 * intersection only. Raw per-role swipe arrays never serialize off the
 * server, here or anywhere — a devtools tab can only see what the
 * product means to show. (Enforced by e2e/blindness.spec.ts.)
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 400 });
  const reveal = await getReveal(token);
  if (!reveal) return NextResponse.json({ error: "not ready" }, { status: 409 });
  return NextResponse.json(reveal);
}
