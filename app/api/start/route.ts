import { NextRequest, NextResponse } from "next/server";
import { startB } from "@/lib/session";

/** B slot binds on this explicit human tap — a GET on the invite URL is passive. */
export async function POST(req: NextRequest) {
  const { token } = await req.json();
  if (typeof token !== "string") return NextResponse.json({ error: "missing token" }, { status: 400 });
  const ok = await startB(token);
  if (!ok) return NextResponse.json({ error: "expired" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
