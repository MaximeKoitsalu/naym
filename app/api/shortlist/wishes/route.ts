import { NextRequest, NextResponse } from "next/server";
import { addWish } from "@/lib/shortlist";
import { parseWish } from "@/lib/wishes";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const wish = parseWish({ name: body?.name, gender: body?.gender });
  if (typeof body?.token !== "string" || !wish) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const added = await addWish(body.token, wish);
  if (!added) return NextResponse.json({ error: "expired" }, { status: 404 });
  if ("full" in added) return NextResponse.json({ error: "queue full" }, { status: 409 });
  return NextResponse.json(added);
}
