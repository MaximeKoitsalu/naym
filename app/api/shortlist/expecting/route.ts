import { NextRequest, NextResponse } from "next/server";
import { DECK_GENDERS } from "@/lib/deck-manifest";
import { setExpecting } from "@/lib/shortlist";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const expecting = DECK_GENDERS.find((g) => g === body?.expecting);
  if (typeof body?.token !== "string" || !expecting) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!(await setExpecting(body.token, expecting))) {
    return NextResponse.json({ error: "expired" }, { status: 404 });
  }
  return NextResponse.json({ expecting });
}
