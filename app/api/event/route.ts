import { NextRequest, NextResponse } from "next/server";
import { logEvent, resolveToken } from "@/lib/session";

const CLIENT_EVENTS = new Set(["reveal_shared", "keepsake_saved"]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.token !== "string" || !CLIENT_EVENTS.has(body.event)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const resolved = await resolveToken(body.token);
  if (!resolved) return NextResponse.json({ error: "expired" }, { status: 404 });
  await logEvent(resolved.meta.id, body.event, resolved.role);
  return NextResponse.json({ ok: true });
}
