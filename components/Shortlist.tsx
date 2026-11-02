"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DeckGender } from "@/lib/deck-manifest";
import type { DuelsView } from "@/lib/duels";
import { defaultFilter, visibleEntries, type ShortlistFilter } from "@/lib/shortlist-filter";
import { otherHolder, remember } from "@/lib/shortlist-device";
import type { DealView, Partner, ShortlistEntry } from "@/lib/types";
import { DuelsButton, OrderSummary, rankClass } from "./Duels";
import { CopyLinkButton } from "./Us";
import { Choice } from "./Choice";

/*
  The Shortlist page ("Our names" in the bottom nav) — variant C, "the list is
  the page" (#18): the names set like the keepsake and one floating next-step
  button. Settings and links live on the "Us" tab, new decks on "Swipe".
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

const FILTER_OPTIONS: { value: ShortlistFilter; label: string }[] = [
  { value: "girl", label: "girl" },
  { value: "boy", label: "boy" },
  { value: "both", label: "both" },
];

const forWhom: Record<DeckGender, string> = {
  girl: "daughter",
  boy: "son",
  unsure: "baby",
};

// Built by hand (no Intl/ICU), so server and client always render the same string.
// shortcut: UTC can show the day before for late-evening matches east of it; switch to the viewer's zone after hydration if that matters.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (ts: number) => {
  const d = new Date(ts);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

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
  expecting,
  entries,
  deal = null,
  duels,
}: {
  token: string;
  partner: Partner;
  expecting: DeckGender;
  entries: ShortlistEntry[];
  /** The live dealt deck as this Partner sees it (getDealView). */
  deal?: DealView | null;
  duels: DuelsView;
}) {
  const [filter, setFilter] = useState(() => defaultFilter(expecting));
  const shown = visibleEntries(entries, filter);
  useEffect(() => remember(token, partner), [token, partner]);

  return (
    <main className="flex flex-1 flex-col pb-[calc(var(--nav-h)+10rem)]">
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
            No {filter} names yet.
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
            <p className="mt-8 text-sm text-ink-soft">
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
      {entries.length > 0 && (
        <div className="mx-6 mt-6">
          <Choice legend="show" options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
        </div>
      )}

      <div className="fixed inset-x-0 bottom-[var(--nav-h)] mx-auto flex w-full max-w-[480px] flex-col gap-3 bg-paper px-6 pb-4 pt-4">
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
        {/* Priority: an incoming deck, then duels, waiting, our order. New decks live on "Swipe". */}
        {!deal?.href && <DuelsButton token={token} duels={duels} />}
      </div>
    </main>
  );
}
