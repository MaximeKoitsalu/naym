import { NextRequest, NextResponse } from "next/server";
import { createSession, dealSession } from "@/lib/session";
import { DECK_GENDERS } from "@/lib/deck-manifest";

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
  const gender = DECK_GENDERS.find((g) => g === (body?.gender ?? "unsure"));
  if (!gender) return NextResponse.json({ error: "unknown gender" }, { status: 400 });
  // Dealt from a Shortlist: same couple, Seen names excluded.
  if (typeof body?.shortlistToken === "string") {
    // deckIds may be one id, a list, or absent — dealSession wants a list.
    const dealt = await dealSession(body.shortlistToken, [deckIds ?? []].flat(), size, gender);
    if (!dealt) return NextResponse.json({ error: "unknown deck or shortlist" }, { status: 400 });
    if ("dry" in dealt) return NextResponse.json({ error: "pool dry", left: dealt.dry }, { status: 409 });
    if ("busy" in dealt) return NextResponse.json({ error: "deck in progress" }, { status: 409 });
    return NextResponse.json(dealt);
  }
  const session = await createSession(deckIds, size, gender);
  if (!session) return NextResponse.json({ error: "unknown deck" }, { status: 400 });
  return NextResponse.json({ creatorToken: session.creatorToken });
}
