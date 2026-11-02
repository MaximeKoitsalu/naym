import { NextRequest, NextResponse } from "next/server";
import { curatedTag } from "@/lib/decks";
import { cleanWish } from "@/lib/wishes";

/**
 * The curated tag of a typed name (Saga → girl), so the girl · boy · either
 * picker can preset to it before the wish is added. A passive read; curated
 * decks are public, so this says nothing about any couple. null when unknown.
 */
export async function GET(req: NextRequest) {
  const name = cleanWish(req.nextUrl.searchParams.get("name"));
  return NextResponse.json({ gender: name ? curatedTag(name) : null });
}
