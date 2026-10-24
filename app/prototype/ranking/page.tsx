"use client";

/*
  PROTOTYPE — throwaway, lives on branch prototype/shortlist-ranking only.
  Question (#13): how should ranking the Shortlist together feel?
  Three variants on /prototype/ranking?variant=A|B|C, in-memory, fake data.
  "Viewing as" toggles which partner's phone you're holding.
*/

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, Reorder, motion } from "motion/react";

type Name = { id: string; name: string; meaning: string };
type Partner = "A" | "B";

const SHORTLIST: Name[] = [
  { id: "saga", name: "Saga", meaning: "the seeing one" },
  { id: "alva", name: "Alva", meaning: "elf, sprite" },
  { id: "juliette", name: "Juliette", meaning: "youthful" },
  { id: "aurora", name: "Aurora", meaning: "dawn" },
  { id: "iris", name: "Iris", meaning: "rainbow" },
  { id: "greta", name: "Greta", meaning: "pearl" },
  { id: "liv", name: "Liv", meaning: "life, protection" },
  { id: "celeste", name: "Céleste", meaning: "heavenly" },
];
const byId = Object.fromEntries(SHORTLIST.map((n) => [n.id, n]));
const ids = SHORTLIST.map((n) => n.id);
// The partner you're not holding starts with a plausible different taste.
const PRESET_B = ["alva", "saga", "liv", "iris", "aurora", "celeste", "greta", "juliette"];

/** Borda: lower combined position = higher. */
function combine(a: string[], b: string[]) {
  return [...ids]
    .map((id) => ({ id, a: a.indexOf(id) + 1, b: b.indexOf(id) + 1 }))
    .sort((x, y) => x.a + x.b - (y.a + y.b) || Math.min(x.a, x.b) - Math.min(y.a, y.b));
}

function PartnerToggle({ who, set }: { who: Partner; set: (p: Partner) => void }) {
  return (
    <div className="flex gap-1 self-start rounded-full bg-paper-dim p-1 text-xs">
      {(["A", "B"] as const).map((p) => (
        <button
          key={p}
          onClick={() => set(p)}
          className={`rounded-full px-3 py-1 ${who === p ? "bg-ink text-paper" : "text-ink-soft"}`}
        >
          viewing as {p}
        </button>
      ))}
    </div>
  );
}

function Row({ n, i, note }: { n: Name; i: number; note?: string }) {
  return (
    <div className="flex items-baseline gap-3 py-3">
      <span className="w-5 text-right text-sm text-ink-soft tabular-nums">{i + 1}</span>
      <span className="font-display text-2xl">{n.name}</span>
      <span className="truncate text-sm text-ink-soft">{n.meaning}</span>
      {note && <span className="ml-auto shrink-0 text-xs text-terra">{note}</span>}
    </div>
  );
}

function DragList({ order, set }: { order: string[]; set: (o: string[]) => void }) {
  return (
    <Reorder.Group axis="y" values={order} onReorder={set} className="divide-y divide-paper-dim">
      {order.map((id, i) => (
        <Reorder.Item key={id} value={id} className="cursor-grab touch-none bg-paper active:cursor-grabbing">
          <Row n={byId[id]} i={i} note="⋮⋮" />
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}

function CombinedReveal({ a, b }: { a: string[]; b: string[] }) {
  const rows = combine(a, b);
  const bothTop3 = rows.filter((r) => r.a <= 3 && r.b <= 3);
  const split = [...rows].sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b))[0];
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {bothTop3.length > 0 && (
        <p className="font-display text-xl">
          You both put{" "}
          <span className="text-terra">{bothTop3.map((r) => byId[r.id].name).join(" & ")}</span> in your top 3.
        </p>
      )}
      <div className="divide-y divide-paper-dim">
        {rows.map((r, i) => (
          <Row key={r.id} n={byId[r.id]} i={i} note={`A#${r.a} · B#${r.b}`} />
        ))}
      </div>
      <p className="text-sm text-ink-soft">
        Biggest split: <b>{byId[split.id].name}</b> (A#{split.a}, B#{split.b}) — worth a conversation.
      </p>
    </motion.div>
  );
}

/* A — Blind rank, sealed, then a combined reveal. */
function VariantA() {
  const [who, setWho] = useState<Partner>("A");
  const [orders, setOrders] = useState<Record<Partner, string[]>>({ A: ids, B: PRESET_B });
  const [sealed, setSealed] = useState<Record<Partner, boolean>>({ A: false, B: true });
  const both = sealed.A && sealed.B;
  return (
    <Shell title="Rank in secret" sub="Order your Shortlist. Your partner can't see it until you've both sealed.">
      <PartnerToggle who={who} set={setWho} />
      {both ? (
        <CombinedReveal a={orders.A} b={orders.B} />
      ) : sealed[who] ? (
        <p className="py-12 text-center text-ink-soft">Sealed. Waiting for {who === "A" ? "B" : "A"}…</p>
      ) : (
        <>
          <DragList order={orders[who]} set={(o) => setOrders({ ...orders, [who]: o })} />
          <button
            onClick={() => setSealed({ ...sealed, [who]: true })}
            className="w-full rounded-[20px] bg-terra py-4 text-paper"
          >
            Seal my order
          </button>
        </>
      )}
      <State s={{ orders, sealed }} />
    </Shell>
  );
}

/* B — One shared order either partner drags; last mover is marked. */
function VariantB() {
  const [who, setWho] = useState<Partner>("A");
  const [order, setOrder] = useState(PRESET_B);
  const [movedBy, setMovedBy] = useState<Record<string, Partner>>({});
  const reorder = (o: string[]) => {
    const moved = o.find((id, i) => order[i] !== id);
    if (moved) setMovedBy({ ...movedBy, [moved]: who });
    setOrder(o);
  };
  return (
    <Shell title="Our order" sub="One list, shared. Either of you can move a name; it updates for both.">
      <PartnerToggle who={who} set={setWho} />
      <Reorder.Group axis="y" values={order} onReorder={reorder} className="divide-y divide-paper-dim">
        {order.map((id, i) => (
          <Reorder.Item key={id} value={id} className="cursor-grab touch-none bg-paper">
            <Row n={byId[id]} i={i} note={movedBy[id] ? `moved by ${movedBy[id]}` : undefined} />
          </Reorder.Item>
        ))}
      </Reorder.Group>
      <State s={{ order, movedBy }} />
    </Shell>
  );
}

/* C — Head-to-head duels in secret; ranking emerges from wins. */
const PAIRS: [string, string][] = (() => {
  const all: [string, string][] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) all.push([ids[i], ids[j]]);
  // Deterministic spread of 12 duels so every name appears ~3 times.
  return all.filter((_, k) => k % 7 < 3).slice(0, 12);
})();

function winsToOrder(picks: string[]) {
  const wins = Object.fromEntries(ids.map((id) => [id, 0]));
  picks.forEach((id) => wins[id]++);
  return [...ids].sort((x, y) => wins[y] - wins[x]);
}
const PRESET_B_PICKS = PAIRS.map(([x, y]) => (PRESET_B.indexOf(x) < PRESET_B.indexOf(y) ? x : y));

function VariantC() {
  const [who, setWho] = useState<Partner>("A");
  const [picks, setPicks] = useState<Record<Partner, string[]>>({ A: [], B: PRESET_B_PICKS });
  const mine = picks[who];
  const done = (p: Partner) => picks[p].length === PAIRS.length;
  const pair = PAIRS[mine.length];
  return (
    <Shell title="This or that" sub="Two names at a time, in secret. Your ranking builds itself.">
      <PartnerToggle who={who} set={setWho} />
      {done("A") && done("B") ? (
        <CombinedReveal a={winsToOrder(picks.A)} b={winsToOrder(picks.B)} />
      ) : done(who) ? (
        <p className="py-12 text-center text-ink-soft">All done. Waiting for {who === "A" ? "B" : "A"}…</p>
      ) : (
        <div className="space-y-4">
          <p className="text-center text-sm text-ink-soft">
            {mine.length + 1} of {PAIRS.length}
          </p>
          <AnimatePresence mode="wait">
            <motion.div
              key={mine.length}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="grid gap-3"
            >
              {pair.map((id) => (
                <button
                  key={id}
                  onClick={() => setPicks({ ...picks, [who]: [...mine, id] })}
                  className="rounded-[20px] border border-paper-dim bg-paper px-6 py-10 text-center hover:border-terra"
                >
                  <div className="font-display text-4xl">{byId[id].name}</div>
                  <div className="mt-1 text-sm text-ink-soft">{byId[id].meaning}</div>
                </button>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
      <State s={{ picksA: picks.A.length, picksB: picks.B.length }} />
    </Shell>
  );
}

function Shell({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col gap-5 px-6 pt-10 pb-40">
      <header>
        <p className="text-xs uppercase tracking-widest text-ink-soft">your shortlist · 8 names</p>
        <h1 className="font-display text-4xl">{title}</h1>
        <p className="mt-1 text-ink-soft">{sub}</p>
      </header>
      {children}
    </main>
  );
}

function State({ s }: { s: unknown }) {
  return (
    <pre className="mt-6 overflow-x-auto rounded bg-paper-dim p-2 text-[10px] text-ink-soft">
      {JSON.stringify(s)}
    </pre>
  );
}

const VARIANTS = { A: ["Blind rank → reveal", VariantA], B: ["Shared order", VariantB], C: ["Duels → reveal", VariantC] } as const;
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

export default function RankingPrototype() {
  return (
    <Suspense>
      <Switcher />
    </Suspense>
  );
}
