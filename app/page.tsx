"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DECK_MANIFEST, type DeckChoice } from "@/lib/deck-manifest";

export default function Landing() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<DeckChoice[]>(["nordic-v1"]);

  function toggle(id: DeckChoice) {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  }

  async function start() {
    if (picked.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deckIds: picked }),
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

      {/* Origin picker — pick one deck, or mix a few into one 50-card blend. */}
      <fieldset className="flex flex-col gap-2.5">
        <legend className="pb-1 text-sm text-ink-soft">
          pick your decks — one, or mix a few
        </legend>
        {DECK_MANIFEST.map((d) => {
          const active = picked.includes(d.id);
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => toggle(d.id)}
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
        <p className="min-h-5 text-sm text-ink-soft" aria-live="polite">
          {picked.length > 1
            ? `one deck, 50 names — dealt evenly across ${picked.length} origins`
            : picked.length === 0
              ? "pick at least one deck"
              : ""}
        </p>
      </fieldset>

      <button
        onClick={start}
        disabled={busy || picked.length === 0}
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
