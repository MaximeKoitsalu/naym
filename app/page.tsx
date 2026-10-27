"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  DECK_GENDERS,
  DECK_MANIFEST,
  DECK_SIZE_PRESETS,
  DEFAULT_DECK_SIZE,
  poolSize,
  type DeckChoice,
  type DeckGender,
  type GenderCounts,
} from "@/lib/deck-manifest";
import { BackToShortlist } from "@/components/Shortlist";
import { MAX_WISHES } from "@/lib/wishes";

const GENDER_OPTIONS: { value: DeckGender; label: string }[] = [
  { value: "girl", label: "a girl" },
  { value: "boy", label: "a boy" },
  { value: "unsure", label: "not sure yet" }, // "unsure" is the code name for "not sure yet"
];

export default function Landing() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<DeckChoice[]>(["nordic-v1"]);
  const [size, setSize] = useState<number>(DEFAULT_DECK_SIZE);
  const [gender, setGender] = useState<DeckGender>("unsure");
  // Dealing from a Shortlist (?deal=<own Shortlist token>): attach to it, Seen names excluded.
  const [deal, setDeal] = useState<string | null>(null);
  // The couple's unseen names per deck, carried on the deal link — sizes they can't fill are disabled.
  const [unseen, setUnseen] = useState<Record<string, GenderCounts> | undefined>();
  // Their sample names with Seen ones left out, carried on the same link.
  const [samples, setSamples] = useState<Record<string, Record<DeckGender, string>> | undefined>();
  // Queued wishes join the dealt deck whatever the decks or gender, so they count toward the pool.
  const [wishes, setWishes] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setDeal(q.get("deal"));
    setWishes(Math.max(0, Math.min(MAX_WISHES, Number(q.get("wishes")) || 0)));
    try {
      setUnseen(JSON.parse(q.get("pool") ?? "null") ?? undefined);
      setSamples(JSON.parse(q.get("samples") ?? "null") ?? undefined);
    } catch {
      /* malformed link — fall back to the full manifest; the server still refuses Seen names */
    }
    const g = DECK_GENDERS.find((x) => x === q.get("gender"));
    if (g) setGender(g);
  }, []);
  useEffect(() => setNotice(null), [picked, size, gender]);
  // shortcut: a wish borrowing an unseen curated card is counted twice, so the pool can
  // run up to MAX_WISHES high; the server then deals a slightly smaller deck. Fine at that cap.
  const pool = picked.length ? poolSize(picked, gender, unseen) + wishes : 0;
  // Never deal a deck the pool can't fill: fall back to the largest size that fits.
  const fits = DECK_SIZE_PRESETS.filter((n) => n <= pool);
  const dealt = size <= pool ? size : (fits.at(-1) ?? size);

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
        body: JSON.stringify({ deckIds: picked, size: dealt, gender, shortlistToken: deal ?? undefined }),
      });
      const json = await res.json();
      if (res.status === 409) {
        setNotice(
          json.left === undefined
            ? "Finish your current deck first."
            : `Only ${json.left} names here you haven't seen together — add a deck for more.`,
        );
        setBusy(false);
        return;
      }
      router.push(`/s/${json.creatorToken}`);
    } catch {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col justify-center gap-7 px-8 py-14">
      <BackToShortlist />
      <h1 className="font-display text-5xl font-semibold lowercase tracking-tight">
        naym
      </h1>
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-3xl leading-snug">
          Find a name you <em className="text-terra not-italic">both</em> love —
          without saying one out loud.
        </h2>
        <p className="text-base leading-relaxed text-ink-soft">
          Swipe {dealt} names in secret.{" "}
          {deal ? "The deck shows up on your partner's Shortlist." : "Send your partner one link."} Neither of
          you sees anything until you&apos;ve both finished — then one reveal
          shows only the names you both chose.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="pb-1 text-sm text-ink-soft">who are we naming?</legend>
        <div className="flex gap-2">
          {GENDER_OPTIONS.map((g) => {
            const active = g.value === gender;
            return (
              <button
                key={g.value}
                type="button"
                onClick={() => setGender(g.value)}
                aria-pressed={active}
                className={`min-h-12 flex-1 rounded-2xl border px-2 font-display text-lg transition-colors ${
                  active
                    ? "border-terra bg-paper-dim text-terra-deep"
                    : "border-ink-soft/25"
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Origin picker — pick one deck, or mix a few into one blended deck. */}
      <fieldset className="flex flex-col gap-2.5">
        <legend className="pb-1 text-sm text-ink-soft">
          pick your decks — one, or mix a few
        </legend>
        {DECK_MANIFEST.map((d) => {
          const active = picked.includes(d.id);
          // Dealing: Seen sample names are left out; none left → no label.
          const sample = samples?.[d.id]?.[gender] ?? d.sample[gender];
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
              {sample && <span className="text-sm text-ink-soft">{sample}</span>}
            </button>
          );
        })}
        <p className="min-h-5 text-sm text-ink-soft" aria-live="polite">
          {picked.length > 1
            ? `one deck, ${dealt} names — dealt evenly across ${picked.length} origins`
            : picked.length === 0
              ? "pick at least one deck"
              : ""}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="pb-1 text-sm text-ink-soft">how many names</legend>
        <div className="flex gap-2">
          {DECK_SIZE_PRESETS.map((n) => {
            const active = n === dealt;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setSize(n)}
                disabled={n > pool}
                aria-pressed={active}
                className={`min-h-12 flex-1 rounded-2xl border font-display text-lg transition-colors ${
                  active
                    ? "border-terra bg-paper-dim text-terra-deep"
                    : "border-ink-soft/25"
                } disabled:opacity-40`}
              >
                {n}
              </button>
            );
          })}
        </div>
        <p className="min-h-5 text-sm text-ink-soft" aria-live="polite">
          {picked.length > 0 && DECK_SIZE_PRESETS.some((n) => n > pool)
            ? deal
              ? `${pool} names here you haven't seen together — add a deck for more`
              : "add a deck for more"
            : ""}
        </p>
      </fieldset>

      {notice && (
        <p className="text-sm text-terra-deep" role="status">
          {notice}
        </p>
      )}
      <button
        onClick={start}
        disabled={busy || fits.length === 0}
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
