"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DeckGender } from "@/lib/deck-manifest";
import { defaultFilter, visibleEntries } from "@/lib/shortlist-filter";
import type { ShortlistEntry } from "@/lib/types";
import ShortlistSheet, { CopyLinkButton } from "./ShortlistSheet";

/*
  The Shortlist page — variant C, "the list is the page" (#18): the names set
  like the keepsake, one floating next-step button, the links in a sheet.
*/

// shortcut: one remembered link per device, so on a shared phone the last
// partner to open theirs wins; split per partner with same-device mode (#26).
const LOCAL_KEY = "naym:shortlist";

function remember(token: string) {
  try {
    localStorage.setItem(LOCAL_KEY, `/shortlist/${token}`);
  } catch {
    /* private mode — the link still works, it just isn't remembered */
  }
}

/** On the reveal: this partner's OWN link only. */
export function KeepShortlist({ token }: { token: string }) {
  useEffect(() => remember(token), [token]);
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
    try {
      setHref(localStorage.getItem(LOCAL_KEY));
    } catch {
      /* private mode */
    }
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

export default function ShortlistPage({
  token,
  expecting: initialExpecting,
  entries,
}: {
  token: string;
  expecting: DeckGender;
  entries: ShortlistEntry[];
}) {
  const [sheet, setSheet] = useState(false);
  const [expecting, setExpecting] = useState(initialExpecting);
  const [filter, setFilter] = useState(() => defaultFilter(initialExpecting));
  const shown = visibleEntries(entries, filter);
  useEffect(() => remember(token), [token]);

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
                  className={`font-display ${i < 3 ? "text-4xl" : "text-2xl text-ink-soft"}`}
                >
                  {e.name}
                </li>
              ))}
            </ol>
            <p className="mt-8 text-sm text-ink-soft" suppressHydrationWarning>
              {shown.length} {shown.length === 1 ? "name" : "names"} you both love · since{" "}
              {day(shown[0].matchedAt)}
            </p>
          </>
        )}
      </section>
      <button
        onClick={() => setSheet(true)}
        className="mx-auto mt-4 min-h-11 text-sm text-ink-soft underline"
      >
        filter & links
      </button>

      {/* No next-step button until #21: a link to / would mint a second Shortlist. */}
      <p className="mt-8 text-center text-sm text-ink-soft">
        New decks from here are coming soon.
      </p>

      {sheet && (
        <ShortlistSheet
          token={token}
          expecting={expecting}
          onExpecting={changeExpecting}
          filter={filter}
          onFilter={setFilter}
          onClose={() => setSheet(false)}
        />
      )}
    </main>
  );
}
