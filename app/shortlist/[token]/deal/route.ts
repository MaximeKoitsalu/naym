import { NextRequest, NextResponse } from "next/server";
import { getSeen, getShortlistView, getWishes, resolvePartner } from "@/lib/shortlist";
import { unseenCounts, unseenSamples } from "@/lib/decks";
import { getDealView } from "@/lib/session";
import { dealHref } from "@/lib/deck-manifest";

/**
 * The bottom nav's "New deck": a passive GET (writes nothing) that forwards to
 * the builder's deal link, or back to the Shortlist while a deck can't be dealt.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [view, partner, deal] = await Promise.all([
    getShortlistView(token),
    resolvePartner(token),
    getDealView(token),
  ]);
  if (!view || !partner || (deal && !deal.canDeal)) {
    return NextResponse.redirect(new URL(`/shortlist/${token}`, req.url));
  }
  const [seen, wishes] = await Promise.all([getSeen(partner.shortlistId), getWishes(partner.shortlistId)]);
  const href = dealHref({
    token,
    expecting: view.expecting,
    unseen: unseenCounts(seen),
    samples: unseenSamples(seen),
    wishes: wishes.length,
  });
  return NextResponse.redirect(new URL(href, req.url));
}
