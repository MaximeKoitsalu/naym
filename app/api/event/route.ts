import { NextRequest, NextResponse } from "next/server";
import { logEvent, resolveToken } from "@/lib/session";
import { HANDOFF_MODES } from "@/lib/types";

const CLIENT_EVENTS = new Set(["reveal_shared", "keepsake_saved", "handoff_mode_selected"]);
const VALID_HANDOFF_MODES = new Set<string>(HANDOFF_MODES);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.token !== "string" || !CLIENT_EVENTS.has(body.event)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (body.event === "handoff_mode_selected" && !VALID_HANDOFF_MODES.has(body.mode)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const resolved = await resolveToken(body.token);
  if (!resolved) return NextResponse.json({ error: "expired" }, { status: 404 });
  const extra = body.event === "handoff_mode_selected" ? { mode: body.mode } : undefined;
  await logEvent(resolved.meta.id, body.event, resolved.role, extra);
  return NextResponse.json({ ok: true });
}
