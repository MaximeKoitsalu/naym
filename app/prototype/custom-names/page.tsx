"use client";

/*
  PROTOTYPE — throwaway, lives on branch prototype/custom-names only.
  Question (#14): how does a custom name get typed in, and what does a
  card with no meaning/pronunciation look like next to curated cards?
  /prototype/custom-names?variant=A|B|C — in-memory, fake data.
  Top half: where you type it. Bottom half: how it lands in the deck.
*/

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Card = { name: string; say: string; origin: string; meaning: string; custom?: boolean };

// A typed name that already exists in a curated deck borrows that card.
const CURATED: Record<string, Card> = {
  saga: { name: "Saga", say: "SAH-gah", origin: "Old Norse", meaning: "the seeing one — goddess of poetry and stories" },
  greta: { name: "Greta", say: "GREH-tah", origin: "German", meaning: "pearl" },
  aurora: { name: "Aurora", say: "ow-ROH-rah", origin: "Latin", meaning: "dawn" },
};
const NEIGHBOUR = CURATED.saga;
const MAX = 3;

function DeckCard({ c, tone = "plain" }: { c: Card; tone?: "plain" | "quiet" | "wish" }) {
  const wish = tone === "wish";
  return (
    <article
      className={`flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 rounded-[20px] px-6 text-center ${
        wish ? "border-2 border-terra bg-paper" : "bg-paper-dim"
      }`}
    >
      {wish && <p className="text-xs uppercase tracking-widest text-terra">✎ a wish from one of you</p>}
      <h2 className={`font-display font-semibold leading-none ${c.name.length > 8 ? "text-4xl" : "text-5xl"} ${wish ? "italic" : ""}`}>
        {c.name || "…"}
      </h2>
      {c.say && <p className="text-sm italic text-ink-soft">{c.say}</p>}
      {c.origin && (
        <p className="rounded-full border border-ink-soft/40 px-3 py-0.5 text-xs uppercase tracking-wider text-ink-soft">
          {c.origin}
        </p>
      )}
      {c.meaning ? (
        <p className="max-w-[240px] text-sm leading-relaxed text-ink-soft">{c.meaning}</p>
      ) : (
        wish && <p className="max-w-[220px] text-sm text-ink-soft">No meaning yet — that part is yours.</p>
      )}
    </article>
  );
}

function DeckPreview({ cards, tone }: { cards: Card[]; tone: "plain" | "quiet" | "wish" }) {
  return (
    <section className="space-y-2">
      <p className="text-sm text-ink-soft">in the deck, next to a curated card →</p>
      <div className="grid grid-cols-2 gap-3">
        <DeckCard c={NEIGHBOUR} />
        {cards.length ? <DeckCard c={cards[cards.length - 1]} tone={cards[cards.length - 1].custom ? tone : "plain"} /> : (
          <div className="flex aspect-[3/4] items-center justify-center rounded-[20px] border border-dashed border-ink-soft/30 text-sm text-ink-soft">
            add a name
          </div>
        )}
      </div>
    </section>
  );
}

const asCard = (raw: string): Card => {
  const name = raw.trim().replace(/^\p{L}/u, (m) => m.toUpperCase());
  return CURATED[name.toLowerCase()] ?? { name, say: "", origin: "", meaning: "", custom: true };
};

/* A — Quiet chips on the deck builder: type, Enter, done. Card goes bare with a "your names" pill. */
function VariantA() {
  const [text, setText] = useState("");
  const [names, setNames] = useState<Card[]>([]);
  const add = () => {
    if (!text.trim() || names.length >= MAX) return;
    setNames([...names, asCard(text)]);
    setText("");
  };
  return (
    <Shell where="Landing deck builder + Shortlist, as a third field under the origins">
      <fieldset className="flex flex-col gap-2.5">
        <legend className="pb-1 text-sm text-ink-soft">your own names — optional, up to {MAX}</legend>
        <div className="flex flex-wrap gap-2">
          {names.map((n, i) => (
            <button
              key={i}
              onClick={() => setNames(names.filter((_, j) => j !== i))}
              className="rounded-full border border-terra bg-paper-dim px-3 py-1.5 font-display text-lg text-terra-deep"
            >
              {n.name} <span className="text-sm">×</span>
            </button>
          ))}
        </div>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          disabled={names.length >= MAX}
          placeholder={names.length >= MAX ? "that's three" : "type a name, press enter"}
          className="min-h-12 rounded-2xl border border-ink-soft/25 bg-paper px-4 font-display text-lg outline-none focus:border-terra"
        />
        <p className="text-sm text-ink-soft">Shuffled into the deck. Your partner won&apos;t know which of you added it.</p>
      </fieldset>
      <DeckPreview cards={names.map((n) => (n.custom ? { ...n, origin: "your names" } : n))} tone="quiet" />
      <State s={names} />
    </Shell>
  );
}

/* B — Fill in the card: name required, pronunciation + meaning optional, live preview. */
function VariantB() {
  const [draft, setDraft] = useState<Card>({ name: "", say: "", origin: "", meaning: "", custom: true });
  const [queued, setQueued] = useState<Card[]>([]);
  const known = CURATED[draft.name.trim().toLowerCase()];
  const preview = known ?? { ...draft, origin: draft.origin || "your pick" };
  const field = (k: keyof Card, label: string, ph: string) => (
    <label className="flex flex-col gap-1 text-sm text-ink-soft">
      {label}
      <input
        value={draft[k] as string}
        onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
        placeholder={ph}
        disabled={!!known && k !== "name"}
        className="min-h-11 rounded-2xl border border-ink-soft/25 bg-paper px-4 text-base text-ink outline-none focus:border-terra disabled:opacity-40"
      />
    </label>
  );
  return (
    <Shell where="Shortlist page → 'Add a name' opens a card editor">
      <div className="space-y-3">
        {field("name", "name", "e.g. Mirja")}
        {known && <p className="text-sm text-terra">We know {known.name} — using our card.</p>}
        {field("say", "say it like (optional)", "MEER-yah")}
        {field("meaning", "what it means to you (optional)", "after grandma")}
        <button
          disabled={!draft.name.trim() || queued.length >= MAX}
          onClick={() => {
            setQueued([...queued, preview]);
            setDraft({ name: "", say: "", origin: "", meaning: "", custom: true });
          }}
          className="w-full rounded-full bg-ink py-3 text-paper disabled:opacity-40"
        >
          Add to the next deck ({queued.length}/{MAX})
        </button>
      </div>
      <DeckPreview cards={draft.name ? [preview] : queued} tone="plain" />
      <State s={{ draft, queued: queued.map((q) => q.name) }} />
    </Shell>
  );
}

/* C — A wish: one slip at a time, and the card wears it openly in the deck. */
function VariantC() {
  const [text, setText] = useState("");
  const [wishes, setWishes] = useState<Card[]>([]);
  return (
    <Shell where="Shortlist page → a paper slip: 'Slip a name into the next deck'">
      <div className="rounded-[20px] bg-paper-dim p-5">
        <p className="font-display text-xl">Slip a name into the next deck</p>
        <p className="mt-1 text-sm text-ink-soft">
          It&apos;ll show up as a wish. You both swipe it — it only joins the Shortlist if you both love it.
        </p>
        <div className="mt-4 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="a name"
            className="min-h-12 flex-1 rounded-2xl border border-ink-soft/25 bg-paper px-4 font-display text-lg italic outline-none focus:border-terra"
          />
          <button
            disabled={!text.trim() || wishes.length >= MAX}
            onClick={() => {
              setWishes([...wishes, asCard(text)]);
              setText("");
            }}
            className="rounded-2xl bg-terra px-5 text-paper disabled:opacity-40"
          >
            Slip
          </button>
        </div>
        {wishes.length > 0 && (
          <p className="mt-3 text-sm text-ink-soft">
            Waiting for the next deck: {wishes.map((w) => w.name).join(", ")} ({wishes.length}/{MAX})
          </p>
        )}
      </div>
      <DeckPreview cards={wishes} tone="wish" />
      <State s={wishes.map((w) => w.name)} />
    </Shell>
  );
}

function Shell({ where, children }: { where: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col gap-6 px-6 pt-10 pb-40">
      <header>
        <p className="text-xs uppercase tracking-widest text-ink-soft">prototype · custom names</p>
        <p className="mt-1 text-sm text-ink-soft">lives on: {where}</p>
      </header>
      {children}
    </main>
  );
}

function State({ s }: { s: unknown }) {
  return <pre className="overflow-x-auto rounded bg-paper-dim p-2 text-[10px] text-ink-soft">{JSON.stringify(s)}</pre>;
}

const VARIANTS = { A: ["Quiet chips", VariantA], B: ["Fill in the card", VariantB], C: ["A wish", VariantC] } as const;
type Key = keyof typeof VARIANTS;
const KEYS = Object.keys(VARIANTS) as Key[];

function Switcher() {
  const router = useRouter();
  const v = (useSearchParams().get("variant") ?? "A") as Key;
  const cur = KEYS.includes(v) ? v : "A";
  const go = (d: number) => router.replace(`?variant=${KEYS[(KEYS.indexOf(cur) + d + KEYS.length) % KEYS.length]}`);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,[contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const [label, V] = VARIANTS[cur];
  return (
    <>
      <V key={cur} />
      {process.env.NODE_ENV !== "production" && (
        <div className="fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black px-4 py-2 text-sm text-white shadow-lg">
          <button onClick={() => go(-1)}>←</button>
          <span>
            {cur} ({label})
          </span>
          <button onClick={() => go(1)}>→</button>
        </div>
      )}
    </>
  );
}

export default function CustomNamesPrototype() {
  return (
    <Suspense>
      <Switcher />
    </Suspense>
  );
}
