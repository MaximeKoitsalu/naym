import { NextRequest, NextResponse } from "next/server";
import { recordPick } from "@/lib/duels";

/** One duel pick. The response is the picker's own duel view — never the other partner's picks. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { token, a, b, winner } = body ?? {};
  if (![token, a, b, winner].every((v) => typeof v === "string"))
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  const view = await recordPick(token, a, b, winner);
  if (view === null) return NextResponse.json({ error: "unknown link" }, { status: 404 });
  if (view === "invalid") return NextResponse.json({ error: "not a current duel" }, { status: 400 });
  return NextResponse.json(view);
}
