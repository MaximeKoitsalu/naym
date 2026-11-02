import { NextRequest, NextResponse } from "next/server";
import { getSeen, getShortlistView, getWishes, resolvePartner } from "@/lib/shortlist";
import { unseenCounts, unseenSamples } from "@/lib/decks";
import { getDealView } from "@/lib/session";
import { dealHref, type GenderCounts } from "@/lib/deck-manifest";
import { WISH_GENDERS } from "@/lib/wishes";

/**
 * The bottom nav's "Swipe": a passive GET (writes nothing) that forwards to
 * whatever is next — the live deck this partner can swipe, the Shortlist while
 * the partner is still dealing, or the builder's deal link for a new deck.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [view, partner, deal] = await Promise.all([
    getShortlistView(token),
    resolvePartner(token),
    getDealView(token),
  ]);
  if (deal?.href) return NextResponse.redirect(new URL(deal.href, req.url));
  if (!view || !partner || (deal && !deal.canDeal)) {
    return NextResponse.redirect(new URL(`/shortlist/${token}`, req.url));
  }
  const [seen, wishes] = await Promise.all([getSeen(partner.shortlistId), getWishes(partner.shortlistId)]);
  const href = dealHref({
    token,
    expecting: view.expecting,
    unseen: unseenCounts(seen),
    samples: unseenSamples(seen),
    wishes: Object.fromEntries(
      WISH_GENDERS.map((g) => [g, wishes.filter((w) => w.gender === g).length]),
    ) as GenderCounts,
  });
  return NextResponse.redirect(new URL(href, req.url));
}
