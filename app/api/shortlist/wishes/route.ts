import { NextRequest, NextResponse } from "next/server";
import { addWish } from "@/lib/shortlist";
import { cleanWish } from "@/lib/wishes";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = cleanWish(body?.name);
  if (typeof body?.token !== "string" || !name) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const added = await addWish(body.token, name);
  if (!added) return NextResponse.json({ error: "expired" }, { status: 404 });
  if ("full" in added) return NextResponse.json({ error: "queue full" }, { status: 409 });
  return NextResponse.json(added);
}
