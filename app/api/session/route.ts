import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const deckId = typeof body?.deckId === "string" ? body.deckId : undefined;
  const session = await createSession(deckId);
  if (!session) return NextResponse.json({ error: "unknown deck" }, { status: 400 });
  return NextResponse.json({ creatorToken: session.creatorToken });
}
