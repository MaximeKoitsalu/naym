"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DECK_MANIFEST, type DeckChoice } from "@/lib/deck-manifest";

export default function Landing() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [deckId, setDeckId] = useState<DeckChoice>("nordic-v1");

  async function start() {
    setBusy(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deckId }),
      });
      const { creatorToken } = await res.json();
      localStorage.setItem(`naym:role:${creatorToken}`, "A");
      router.push(`/s/${creatorToken}`);
    } catch {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col justify-center gap-7 px-8 py-14">
      <h1 className="font-display text-5xl font-semibold lowercase tracking-tight">
        naym
      </h1>
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-3xl leading-snug">
          Find a name you <em className="text-terra not-italic">both</em> love —
          without saying one out loud.
        </h2>
        <p className="text-base leading-relaxed text-ink-soft">
          Swipe 50 names in secret. Send your partner one link. Neither of you
          sees anything until you&apos;ve both finished — then one reveal shows
          only the names you both chose.
        </p>
      </div>

      {/* Origin picker — the deck is the couple's first shared choice. */}
      <fieldset className="flex flex-col gap-2.5">
        <legend className="pb-1 text-sm text-ink-soft">pick your deck</legend>
        {DECK_MANIFEST.map((d) => {
          const active = d.id === deckId;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setDeckId(d.id)}
              aria-pressed={active}
              className={`flex min-h-12 items-baseline justify-between rounded-2xl border px-4 py-2.5 text-left transition-colors ${
                active
                  ? "border-terra bg-paper-dim"
                  : "border-ink-soft/25"
              }`}
            >
              <span
                className={`font-display text-lg ${active ? "text-terra-deep" : ""}`}
              >
                {d.label}
              </span>
              <span className="text-sm text-ink-soft">{d.sample}</span>
            </button>
          );
        })}
      </fieldset>

      <button
        onClick={start}
        disabled={busy}
        className="min-h-14 rounded-full bg-ink px-8 text-lg font-medium text-paper disabled:opacity-60"
      >
        {busy ? "Shuffling the deck…" : "Start swiping"}
      </button>
      <p className="text-sm text-ink-soft">
        No account. No download. About 5 minutes each.
      </p>
    </main>
  );
}
