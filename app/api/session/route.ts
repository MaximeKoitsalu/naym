import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  // Accepts deckIds: string[] (one = verbatim, several = blended) or legacy deckId.
  const deckIds: string | string[] | undefined = Array.isArray(body?.deckIds)
    ? body.deckIds.filter((d: unknown) => typeof d === "string")
    : typeof body?.deckId === "string"
      ? body.deckId
      : undefined;
  const session = await createSession(deckIds);
  if (!session) return NextResponse.json({ error: "unknown deck" }, { status: 400 });
  return NextResponse.json({ creatorToken: session.creatorToken });
}
