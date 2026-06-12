import { NextRequest, NextResponse } from "next/server";
import { armRound2 } from "@/lib/session";

/** Either partner's single tap arms round 2 for both. Idempotent. */
export async function POST(req: NextRequest) {
  const { token } = await req.json();
  if (typeof token !== "string") return NextResponse.json({ error: "missing token" }, { status: 400 });
  const ok = await armRound2(token);
  if (!ok) return NextResponse.json({ error: "not available" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
