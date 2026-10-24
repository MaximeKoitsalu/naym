"use client";

/*
  PROTOTYPE — throwaway, lives on branch prototype/shortlist-page only.
  Question (#18): what does the Shortlist page hold, in what order, and how
  does it read on both partners' phones (incl. one shared phone)?
  /prototype/shortlist?variant=A|B|C — in-memory, fake data.
  The grey "scenario" panel at the top fakes the state; it isn't the design.
*/

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type G = "girl" | "boy" | "both";
type Entry = { id: string; name: string; meaning: string; g: G; wish?: boolean; matched: string };
type Phase = "incoming" | "duels" | "waiting" | "ranked" | "quiet";
type Expecting = "girl" | "boy" | "not sure yet";
type S = { phase: Phase; expecting: Expecting; samePhone: boolean; holder: "Maxime" | "Partner" };

const LIST: Entry[] = [
  { id: "saga", name: "Saga", meaning: "the seeing one", g: "girl", matched: "Oct 12" },
  { id: "alva", name: "Alva", meaning: "elf, sprite", g: "girl", matched: "Oct 12" },
  { id: "aurora", name: "Aurora", meaning: "dawn", g: "girl", matched: "Oct 19" },
  { id: "nils", name: "Nils", meaning: "victory of the people", g: "boy", matched: "Oct 12" },
  { id: "iris", name: "Iris", meaning: "rainbow", g: "girl", matched: "Oct 19" },
  { id: "mirja", name: "Mirja", meaning: "", g: "both", wish: true, matched: "Oct 22" },
  { id: "leo", name: "Léo", meaning: "lion", g: "boy", matched: "Oct 19" },
];
// Combined least-misery order, once both partners have duelled.
const RANKED = ["alva", "saga", "iris", "mirja", "aurora", "nils", "leo"];
const byId = Object.fromEntries(LIST.map((e) => [e.id, e]));

function visible(s: S, filter: G | "all") {
  const f = filter === "all" ? null : filter;
  const order = s.phase === "ranked" ? RANKED.map((id) => byId[id]) : LIST;
  return order.filter((e) => !f || e.g === f || e.g === "both");
}

/* ——— shared small pieces (layout is NOT shared) ——— */

function NextStep({ s, compact }: { s: S; compact?: boolean }) {
  const copy: Record<Phase, [string, string, string | null]> = {
    incoming: ["Your partner dealt 20 new names", "Swipe them in secret — nothing shows until you're both done.", "Start swiping"],
    duels: ["3 new matches since last time", "12 quick duels — this or that — and your order builds itself.", "Start duels"],
    waiting: ["Your duels are sealed", "Waiting for your partner to finish theirs.", null],
    ranked: ["You both put Alva in your top 2", "Biggest split: Aurora — worth a conversation.", "See the order"],
    quiet: ["Nothing waiting", "Deal a fresh deck when you're ready — names you've both seen won't come back.", "Deal a new deck"],
  };
  const [title, sub, cta] = copy[s.phase];
  return (
    <section className={`rounded-[20px] bg-paper-dim ${compact ? "p-4" : "p-5"}`}>
      <p className="font-display text-xl">{title}</p>
      <p className="mt-1 text-sm text-ink-soft">{sub}</p>
      {cta && <button className="mt-4 w-full rounded-full bg-terra py-3 text-paper">{cta}</button>}
    </section>
  );
}

function FilterBar({ value, set }: { value: G | "all"; set: (g: G | "all") => void }) {
  return (
    <div className="flex gap-1 text-sm">
      {(["girl", "boy", "all"] as const).map((g) => (
        <button
          key={g}
          onClick={() => set(g)}
          className={`rounded-full px-3 py-1 ${value === g ? "bg-ink text-paper" : "text-ink-soft"}`}
        >
          {g === "all" ? "both" : g}
        </button>
      ))}
    </div>
  );
}

function NameRow({ e, i, ranked }: { e: Entry; i: number; ranked: boolean }) {
  return (
    <li className="flex items-baseline gap-3 py-3">
      {ranked && <span className="w-5 text-right text-sm tabular-nums text-ink-soft">{i + 1}</span>}
      <span className={`font-display text-2xl ${e.wish ? "italic" : ""}`}>{e.name}</span>
      <span className="truncate text-sm text-ink-soft">{e.wish ? "✎ a wish" : e.meaning}</span>
      <span className="ml-auto shrink-0 text-xs text-ink-soft">{e.matched}</span>
    </li>
  );
}

function WishSlip() {
  return (
    <section className="rounded-[20px] border border-dashed border-ink-soft/30 p-4">
      <p className="font-display text-lg">Slip a name into the next deck</p>
      <div className="mt-3 flex gap-2">
        <input placeholder="a name" className="min-h-11 flex-1 rounded-2xl border border-ink-soft/25 bg-paper px-4 font-display italic outline-none" />
        <button className="rounded-2xl bg-terra px-4 text-paper">Slip</button>
      </div>
    </section>
  );
}

function Holder({ s }: { s: S }) {
  if (!s.samePhone) return null;
  return (
    <p className="rounded-full bg-paper-dim px-3 py-1.5 text-center text-sm text-ink-soft">
      Holding the phone: <b className="text-ink">{s.holder}</b> · <u>pass it over</u>
    </p>
  );
}

const Housekeeping = () => (
  <footer className="space-y-1 pt-4 text-sm text-ink-soft">
    <p><u>Copy my Shortlist link</u></p>
    <p><u>Send my partner a fresh link</u></p>
  </footer>
);

/* A — One scroll: next step on top, the list, the wish slip, housekeeping. */
function VariantA({ s }: { s: S }) {
  const [f, setF] = useState<G | "all">(s.expecting === "not sure yet" ? "all" : s.expecting);
  const rows = visible(s, f);
  return (
    <main className="flex flex-col gap-5 px-6 pt-6 pb-40">
      <Holder s={s} />
      <header>
        <p className="text-xs uppercase tracking-widest text-ink-soft">our shortlist · naming a {s.expecting === "not sure yet" ? "baby (not sure yet)" : s.expecting} ✎</p>
        <h1 className="font-display text-4xl">{rows.length} names we both love</h1>
      </header>
      <NextStep s={s} />
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-soft">{s.phase === "ranked" ? "our order" : "newest first"}</p>
        <FilterBar value={f} set={setF} />
      </div>
      <ol className="divide-y divide-paper-dim">{rows.map((e, i) => <NameRow key={e.id} e={e} i={i} ranked={s.phase === "ranked"} />)}</ol>
      <WishSlip />
      <Housekeeping />
    </main>
  );
}

/* B — Three tabs: Names · Duels · Deal. Each job gets its own room. */
function VariantB({ s }: { s: S }) {
  const [tab, setTab] = useState<"names" | "duels" | "deal">(s.phase === "incoming" ? "deal" : s.phase === "duels" ? "duels" : "names");
  const [f, setF] = useState<G | "all">(s.expecting === "not sure yet" ? "all" : s.expecting);
  const badge = { names: false, duels: s.phase === "duels" || s.phase === "ranked", deal: s.phase === "incoming" };
  return (
    <main className="flex flex-1 flex-col pb-40">
      <div className="flex flex-col gap-4 px-6 pt-6">
        <Holder s={s} />
        <h1 className="font-display text-3xl">Our shortlist</h1>
        <nav className="grid grid-cols-3 rounded-full bg-paper-dim p-1 text-sm">
          {(["names", "duels", "deal"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`relative rounded-full py-2 ${tab === t ? "bg-paper text-ink" : "text-ink-soft"}`}>
              {t === "names" ? "Names" : t === "duels" ? "This or that" : "New deck"}
              {badge[t] && <span className="absolute top-1.5 right-3 size-2 rounded-full bg-terra" />}
            </button>
          ))}
        </nav>
      </div>
      <div className="flex flex-col gap-5 px-6 pt-5">
        {tab === "names" && (
          <>
            <FilterBar value={f} set={setF} />
            <ol className="divide-y divide-paper-dim">{visible(s, f).map((e, i) => <NameRow key={e.id} e={e} i={i} ranked={s.phase === "ranked"} />)}</ol>
            <Housekeeping />
          </>
        )}
        {tab === "duels" && <NextStep s={s.phase === "incoming" || s.phase === "quiet" ? { ...s, phase: "waiting" } : s} />}
        {tab === "deal" && (
          <>
            {s.phase === "incoming" ? <NextStep s={s} /> : <NextStep s={{ ...s, phase: "quiet" }} />}
            <p className="text-sm text-ink-soft">naming a: <b>{s.expecting}</b> · <u>change</u></p>
            <WishSlip />
          </>
        )}
      </div>
    </main>
  );
}

/* C — The list is the page: a keepsake you look at, one floating next-step button, the rest in a sheet. */
function VariantC({ s }: { s: S }) {
  const [sheet, setSheet] = useState(false);
  const rows = visible(s, s.expecting === "not sure yet" ? "all" : s.expecting);
  const cta: Record<Phase, string> = {
    incoming: "20 new names from your partner →",
    duels: "3 new matches · start duels →",
    waiting: "Waiting for your partner's duels…",
    ranked: "Our order is ready →",
    quiet: "Deal a new deck →",
  };
  return (
    <main className="flex flex-1 flex-col pb-40">
      <div className="px-6 pt-6"><Holder s={s} /></div>
      <section className="mx-6 mt-4 flex flex-col items-center rounded-[20px] bg-paper-dim px-6 py-10 text-center">
        <p className="text-xs uppercase tracking-widest text-ink-soft">for our {s.expecting === "not sure yet" ? "baby" : s.expecting === "girl" ? "daughter" : "son"}</p>
        <ol className="mt-6 space-y-3">
          {rows.map((e, i) => (
            <li key={e.id} className={`font-display ${i === 0 && s.phase === "ranked" ? "text-6xl text-terra" : i < 3 ? "text-4xl" : "text-2xl text-ink-soft"} ${e.wish ? "italic" : ""}`}>
              {e.name}
            </li>
          ))}
        </ol>
        <p className="mt-8 text-sm text-ink-soft">{rows.length} names you both love · since Oct 12</p>
      </section>
      <button onClick={() => setSheet(true)} className="mx-auto mt-4 text-sm text-ink-soft underline">
        wishes, filter & links
      </button>
      <div className="fixed bottom-16 left-1/2 w-[min(440px,calc(100%-32px))] -translate-x-1/2">
        <button disabled={s.phase === "waiting"} className="w-full rounded-full bg-terra py-4 text-paper disabled:bg-ink-soft">
          {cta[s.phase]}
        </button>
      </div>
      {sheet && (
        <div className="fixed inset-0 z-10 flex items-end bg-ink/30" onClick={() => setSheet(false)}>
          <div className="mx-auto w-full max-w-[480px] space-y-4 rounded-t-[20px] bg-paper p-6 pb-24" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-ink-soft">naming a: <b>{s.expecting}</b> · <u>change</u></p>
            <WishSlip />
            <Housekeeping />
          </div>
        </div>
      )}
    </main>
  );
}

function Scenario({ s, set }: { s: S; set: (s: S) => void }) {
  const sel = <K extends keyof S>(k: K, opts: S[K][]) => (
    <select value={String(s[k])} onChange={(e) => set({ ...s, [k]: opts.find((o) => String(o) === e.target.value) })} className="rounded bg-paper px-1">
      {opts.map((o) => <option key={String(o)}>{String(o)}</option>)}
    </select>
  );
  return (
    <div className="flex flex-wrap gap-2 bg-zinc-200 px-3 py-2 text-[11px] text-zinc-700">
      scenario: {sel("phase", ["incoming", "duels", "waiting", "ranked", "quiet"])}
      {sel("expecting", ["girl", "boy", "not sure yet"])}
      same phone {sel("samePhone", [false, true])}
      {s.samePhone && sel("holder", ["Maxime", "Partner"])}
    </div>
  );
}

const VARIANTS = { A: ["One scroll", VariantA], B: ["Tabs", VariantB], C: ["The list is the page", VariantC] } as const;
type Key = keyof typeof VARIANTS;
const KEYS = Object.keys(VARIANTS) as Key[];

function Switcher() {
  const router = useRouter();
  const v = (useSearchParams().get("variant") ?? "A") as Key;
  const cur = KEYS.includes(v) ? v : "A";
  const [s, setS] = useState<S>({ phase: "duels", expecting: "girl", samePhone: false, holder: "Maxime" });
  const go = (d: number) => router.replace(`?variant=${KEYS[(KEYS.indexOf(cur) + d + KEYS.length) % KEYS.length]}`);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select,[contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const [label, V] = VARIANTS[cur];
  return (
    <>
      <Scenario s={s} set={setS} />
      <V key={cur + JSON.stringify(s)} s={s} />
      {process.env.NODE_ENV !== "production" && (
        <div className="fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black px-4 py-2 text-sm text-white shadow-lg">
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

export default function ShortlistPagePrototype() {
  return (
    <Suspense>
      <Switcher />
    </Suspense>
  );
}
