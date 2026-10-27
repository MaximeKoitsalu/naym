import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/session";
import { DECK_GENDERS, type DeckGender } from "@/lib/deck-manifest";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  // Accepts deckIds: string[] (one = verbatim, several = blended) or legacy deckId.
  const deckIds: string | string[] | undefined = Array.isArray(body?.deckIds)
    ? body.deckIds.filter((d: unknown) => typeof d === "string")
    : typeof body?.deckId === "string"
      ? body.deckId
      : undefined;
  const size = typeof body?.size === "number" ? body.size : undefined;
  // Omitted → "unsure" (pre-picker clients); anything else must be a known gender.
  const gender: DeckGender = body?.gender ?? "unsure";
  if (!DECK_GENDERS.includes(gender)) {
    return NextResponse.json({ error: "unknown gender" }, { status: 400 });
  }
  const session = await createSession(deckIds, size, gender);
  if (!session) return NextResponse.json({ error: "unknown deck" }, { status: 400 });
  return NextResponse.json({ creatorToken: session.creatorToken });
}
