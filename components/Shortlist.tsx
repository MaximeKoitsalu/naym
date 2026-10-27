"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Shortlist, ShortlistEntry } from "@/lib/types";
import { deckGenderFor } from "@/lib/deck-manifest";

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

function CopyLinkButton({ token, autoFocus }: { token: string; autoFocus?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard
      .writeText(`${window.location.origin}/shortlist/${token}`)
      .then(() => setCopied(true))
      .catch(() => null);
  }
  return (
    <button
      onClick={copy}
      autoFocus={autoFocus}
      className="min-h-12 w-full rounded-full border border-ink-soft/25 px-6 font-medium"
    >
      {copied ? "Link copied" : "Copy my Shortlist link"}
    </button>
  );
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

const forWhom: Record<Shortlist["expecting"], string> = {
  girl: "daughter",
  boy: "son",
  "not sure yet": "baby",
};

const day = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function ShortlistPage({
  token,
  expecting,
  entries,
  deal = null,
}: {
  token: string;
  expecting: Shortlist["expecting"];
  entries: ShortlistEntry[];
  /** The latest dealt deck as this Partner sees it (getDealView). */
  deal?: { mine: boolean; size: number; href: string } | null;
}) {
  const [sheet, setSheet] = useState(false);
  useEffect(() => remember(token), [token]);
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheet(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

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
        ) : (
          <>
            <ol className="mt-6 space-y-3">
              {entries.map((e, i) => (
                <li
                  key={e.id}
                  className={`font-display ${i < 3 ? "text-4xl" : "text-2xl text-ink-soft"}`}
                >
                  {e.name}
                </li>
              ))}
            </ol>
            <p className="mt-8 text-sm text-ink-soft" suppressHydrationWarning>
              {entries.length} {entries.length === 1 ? "name" : "names"} you both love · since{" "}
              {day(entries[0].matchedAt)}
            </p>
          </>
        )}
      </section>
      <button
        onClick={() => setSheet(true)}
        className="mx-auto mt-4 min-h-11 text-sm text-ink-soft underline"
      >
        links
      </button>

      <div className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-[480px] flex-col gap-3 bg-paper px-6 pb-8 pt-4">
        {deal && (
          <Link
            href={deal.href}
            className="min-h-14 rounded-full bg-terra px-8 py-4 text-center text-lg font-medium text-paper"
          >
            {deal.mine
              ? `Back to your ${deal.size} new names →`
              : `Your partner dealt ${deal.size} new names →`}
          </Link>
        )}
        {/* ?deal= makes the builder attach to THIS Shortlist instead of minting one. */}
        <Link
          href={`/?deal=${token}&gender=${deckGenderFor(expecting)}`}
          className={`min-h-14 rounded-full px-8 py-4 text-center text-lg font-medium ${
            deal ? "border border-ink-soft/25" : "bg-ink text-paper"
          }`}
        >
          Deal a new deck →
        </Link>
      </div>

      {sheet && (
        <div
          className="fixed inset-0 z-10 flex items-end bg-ink/30"
          onClick={() => setSheet(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Shortlist links"
            className="mx-auto w-full max-w-[480px] space-y-4 rounded-t-[20px] bg-paper p-6 pb-24"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-ink-soft">
              naming a: <b>{expecting}</b>
            </p>
            <p className="text-sm leading-relaxed text-ink-soft">
              This link is yours alone. Your partner has their own.
            </p>
            <CopyLinkButton token={token} autoFocus />
            <button
              onClick={() => setSheet(false)}
              className="min-h-11 w-full text-sm text-ink-soft underline"
            >
              close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
