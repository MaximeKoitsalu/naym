import { NextRequest, NextResponse } from "next/server";
import { getStateView } from "@/lib/session";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 400 });
  const view = await getStateView(token);
  if (!view) return NextResponse.json({ error: "expired" }, { status: 404 });
  return NextResponse.json(view);
}
