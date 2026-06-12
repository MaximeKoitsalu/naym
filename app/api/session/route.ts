import { NextResponse } from "next/server";
import { createSession } from "@/lib/session";

export async function POST() {
  const { creatorToken } = await createSession();
  return NextResponse.json({ creatorToken });
}
