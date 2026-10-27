"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DeckGender, GenderCounts } from "@/lib/deck-manifest";
import type { DuelsView } from "@/lib/duels";
import { defaultFilter, visibleEntries } from "@/lib/shortlist-filter";
import { lastShortlist, otherHolder, remember } from "@/lib/shortlist-device";
import type { DealView, Partner, ShortlistEntry } from "@/lib/types";
import { DuelsButton, OrderSummary, duelsStep, rankClass } from "./Duels";
import ShortlistSheet, { CopyLinkButton } from "./ShortlistSheet";

/*
  The Shortlist page — variant C, "the list is the page" (#18): the names set
  like the keepsake, one floating next-step button, the links in a sheet.
*/

/** On the reveal: this partner's OWN link only. */
export function KeepShortlist({ token, partner }: { token: string; partner?: Partner }) {
  useEffect(() => remember(token, partner), [token, partner]);
  return (
    <section className="flex flex-col gap-3 rounded-[20px] bg-paper-dim p-5 text-left">
      <p className="font-display text-xl">Keep your Shortlist</p>
      <p className="text-sm leading-relaxed text-ink-soft">
        Every name you both love lands there — this deck and the next. The
        link is yours alone: open it and add it to your home screen.
      </p>
      <CopyLinkButton token={token} />
      <Link
        href={`/shortlist/${token}`}
        className="min-h-12 rounded-full bg-terra px-6 py-3 text-center font-medium text-paper"
      >
        Open our Shortlist
      </Link>
    </section>
  );
}

/** On the landing page, when this device remembers a Shortlist link. */
export function BackToShortlist() {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    setHref(lastShortlist());
  }, []);
  if (!href) return null;
  return (
    <Link
      href={href}
      className="self-start rounded-full bg-paper-dim px-4 py-2 text-sm font-medium text-terra-deep"
    >
      Back to our Shortlist →
    </Link>
  );
}

const forWhom: Record<DeckGender, string> = {
  girl: "daughter",
  boy: "son",
  unsure: "baby",
};

const day = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * Same-device mode: when this phone holds both Partners' links. Passing it
 * over swaps the URL — the route keys the page by token, so nothing of the
 * holder's state survives into the other partner's view.
 */
function HolderStrip({ partner }: { partner: Partner }) {
  const [other, setOther] = useState<string | null>(null);
  useEffect(() => setOther(otherHolder(partner)), [partner]);
  if (!other) return null;
  return (
    <p className="mx-6 mt-4 text-center text-sm text-ink-soft">
      Holding the phone: <b className="text-ink">Partner {partner}</b> ·{" "}
      <Link replace href={`/shortlist/${other}`} className="underline">
        pass it over
      </Link>
    </p>
  );
}

export default function ShortlistPage({
  token,
  partner,
  expecting: initialExpecting,
  entries,
  deal = null,
  unseen,
  duels,
  wishes: initialWishes = [],
}: {
  token: string;
  partner: Partner;
  expecting: DeckGender;
  entries: ShortlistEntry[];
  /** The live dealt deck as this Partner sees it (getDealView). */
  deal?: DealView | null;
  /** Unseen names per deck — the builder's size picker counts only these. */
  unseen?: Record<string, GenderCounts>;
  duels: DuelsView;
  /** Wishes queued for the next deck — open to both partners. */
  wishes?: string[];
}) {
  const [sheet, setSheet] = useState(false);
  const [wishes, setWishes] = useState(initialWishes);
  const [expecting, setExpecting] = useState(initialExpecting);
  const [filter, setFilter] = useState(() => defaultFilter(initialExpecting));
  const shown = visibleEntries(entries, filter);
  useEffect(() => remember(token, partner), [token, partner]);

  function changeExpecting(g: DeckGender) {
    // Optimistic: the filter jumps to the new gender; a failed save reverts both.
    const before = expecting;
    setExpecting(g);
    setFilter(defaultFilter(g));
    fetch("/api/shortlist/expecting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, expecting: g }),
    })
      .then((r) => {
        if (!r.ok) throw new Error();
      })
      .catch(() => {
        setExpecting(before);
        setFilter(defaultFilter(before));
      });
  }

  return (
    <main className="flex flex-1 flex-col pb-40">
      <HolderStrip partner={partner} />
      <section className="mx-6 mt-6 flex flex-col items-center rounded-[20px] bg-paper-dim px-6 py-10 text-center">
        <h1 className="text-xs uppercase tracking-widest text-ink-soft">
          for our {forWhom[expecting]}
        </h1>
        {entries.length === 0 ? (
          <p className="mt-6 font-display text-2xl text-ink-soft">
            No names yet — your matches will land here.
          </p>
        ) : shown.length === 0 ? (
          <p className="mt-6 font-display text-2xl text-ink-soft">
            No {filter} names yet — the filter is in the sheet.
          </p>
        ) : (
          <>
            <ol className="mt-6 space-y-3">
              {shown.map((e, i) => (
                <li
                  key={e.id}
                  className={`font-display ${rankClass(i, !!duels.order)}`}
                >
                  {e.wish ? (
                    <>
                      <i>{e.name}</i>
                      <span className="ml-2 align-middle font-sans text-xs not-italic text-terra">✎ a wish</span>
                    </>
                  ) : (
                    e.name
                  )}
                </li>
              ))}
            </ol>
            <p className="mt-8 text-sm text-ink-soft" suppressHydrationWarning>
              {shown.length === entries.length ? shown.length : `${shown.length} of ${entries.length}`}{" "}
              {entries.length === 1 ? "name" : "names"} you both love · since{" "}
              {day(Math.min(...entries.map((e) => e.matchedAt)))}
            </p>
          </>
        )}
      </section>
      {duels.order && (
        <div className="mx-6 mt-6">
          <OrderSummary order={duels.order} entries={entries} />
        </div>
      )}
      <button
        onClick={() => setSheet(true)}
        className="mx-auto mt-4 min-h-11 text-sm text-ink-soft underline"
      >
        filter & links
      </button>

      <div className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-[480px] flex-col gap-3 bg-paper px-6 pb-8 pt-4">
        {deal?.href && (
          <Link
            href={deal.href}
            className="min-h-14 rounded-full bg-terra px-8 py-4 text-center text-lg font-medium text-paper"
          >
            {deal.mine
              ? `Back to your ${deal.size} new names →`
              : `Your partner dealt ${deal.size} new names →`}
          </Link>
        )}
        {deal && !deal.href && (
          <p className="text-center text-sm text-ink-soft">
            Your partner is dealing {deal.size} new names.
          </p>
        )}
        {/* Priority: an incoming deck, then duels, waiting, our order — then Deal. */}
        {!deal?.href && <DuelsButton token={token} duels={duels} />}
        {!deal || deal.canDeal ? (
          // ?deal= makes the builder attach to THIS Shortlist instead of minting one.
          <Link
            href={`/?deal=${token}&gender=${expecting}${
              unseen ? `&pool=${encodeURIComponent(JSON.stringify(unseen))}` : ""
            }`}
            className={`min-h-14 rounded-full px-8 py-4 text-center text-lg font-medium ${
              deal || duelsStep(duels) ? "border border-ink-soft/25" : "bg-ink text-paper"
            }`}
          >
            Deal a new deck →
          </Link>
        ) : (
          deal.mine && (
            <p className="text-center text-sm text-ink-soft">Finish your current deck first.</p>
          )
        )}
      </div>

      {sheet && (
        <ShortlistSheet
          token={token}
          partner={partner}
          expecting={expecting}
          onExpecting={changeExpecting}
          filter={filter}
          onFilter={setFilter}
          wishes={wishes}
          onWishes={setWishes}
          onClose={() => setSheet(false)}
        />
      )}
    </main>
  );
}
