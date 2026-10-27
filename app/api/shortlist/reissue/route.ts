import { NextRequest, NextResponse } from "next/server";
import { reissuePartnerLink } from "@/lib/shortlist";

/** Answers with the OTHER partner's fresh token, to the requester only. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (typeof body?.token !== "string") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const token = await reissuePartnerLink(body.token);
  if (!token) return NextResponse.json({ error: "no partner link" }, { status: 404 });
  return NextResponse.json({ token });
}
