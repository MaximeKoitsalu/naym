import Link from "next/link";
import ShortlistPage from "@/components/Shortlist";
import { getSeen, getShortlistView, getWishes, resolvePartner } from "@/lib/shortlist";
import { unseenCounts, unseenSamples } from "@/lib/decks";
import { getDealView } from "@/lib/session";
import { getDuelsView, inCombinedOrder } from "@/lib/duels";

export default async function ShortlistRoute({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // A read only — the view carries this partner's matches, never the other's token.
  const view = await getShortlistView(token);
  if (!view) {
    return (
      <main className="flex flex-1 flex-col justify-center gap-5 px-8 text-center">
        <h1 className="font-display text-3xl">This Shortlist link doesn&apos;t open.</h1>
        <p className="text-base leading-relaxed text-ink-soft">
          Check that you copied the whole link, or start a new deck.
        </p>
        <Link
          href="/"
          className="mx-auto min-h-14 rounded-full bg-ink px-8 py-4 text-lg font-medium text-paper"
        >
          Start a fresh deck
        </Link>
      </main>
    );
  }
  const duels = (await getDuelsView(token))!;
  const { shortlistId } = (await resolvePartner(token))!;
  const seen = await getSeen(shortlistId);
  // Keyed by token: passing a shared phone over remounts, carrying no state across.
  return (
    <ShortlistPage
      key={token}
      token={token}
      partner={view.partner}
      expecting={view.expecting}
      entries={inCombinedOrder(view.entries, duels.order)}
      deal={await getDealView(token)}
      unseen={unseenCounts(seen)}
      samples={unseenSamples(seen)}
      wishes={await getWishes(shortlistId)}
      duels={duels}
    />
  );
}
