"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { CombinedOrder, DuelsView } from "@/lib/duels";
import type { ShortlistEntry } from "@/lib/types";

/*
  Duels (#22), prototype variant C: two names at a time, in secret; each
  partner's ranking builds itself, and the least-misery order reveals once
  both are done.
*/

/** List type by position; the #1 name grows and turns terracotta once an order exists. */
export const rankClass = (i: number, ranked: boolean) =>
  i === 0 && ranked ? "text-6xl text-terra" : i < 3 ? "text-4xl" : "text-2xl text-ink-soft";

const PRIMARY = "min-h-14 rounded-full px-8 py-4 text-center text-lg font-medium text-paper";

/** Which duel step, if any, claims the Shortlist's primary next-step button. */
export function duelsStep(duels: DuelsView): "duel" | "waiting" | "ready" | null {
  if (duels.remaining.length > 0) return "duel";
  if (duels.total > 0 && !duels.partnerDone) return "waiting";
  return duels.order && duels.newCount === 0 ? "ready" : null;
}

/** The duel step as the Shortlist's primary button; nothing when there's none. */
export function DuelsButton({ token, duels }: { token: string; duels: DuelsView }) {
  const step = duelsStep(duels);
  const href = `/shortlist/${token}/duels`;
  if (step === "duel") {
    const n = duels.newCount;
    return (
      <Link href={href} className={`${PRIMARY} bg-terra`}>
        {n} {n === 1 ? "name" : "names"} to rank · start duels →
      </Link>
    );
  }
  if (step === "waiting") {
    return (
      <p role="status" className={`${PRIMARY} bg-ink-soft`}>
        Waiting for your partner&apos;s duels…
      </p>
    );
  }
  if (step === "ready") {
    return (
      <Link href={href} className={`${PRIMARY} bg-terra`}>
        Our order is ready →
      </Link>
    );
  }
  return null;
}

const listNames = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;

/** "You both put X in your top N" and the biggest split. */
export function OrderSummary({ order, entries }: { order: CombinedOrder; entries: ShortlistEntry[] }) {
  const name = (id: string) => entries.find((e) => e.id === id)?.name ?? "";
  return (
    <div className="space-y-2 text-center">
      {order.bothTop.length > 0 && (
        <p className="font-display text-xl">
          You both put <span className="text-terra">{listNames(order.bothTop.map(name))}</span>{" "}
          {order.topN === 1 ? "first" : `in your top ${order.topN}`}.
        </p>
      )}
      {order.split && (
        <p className="text-sm text-ink-soft">
          Biggest split: <b>{name(order.split)}</b> — worth a conversation.
        </p>
      )}
    </div>
  );
}

export default function DuelsPlay({
  token,
  initial,
  entries,
}: {
  token: string;
  initial: DuelsView;
  entries: ShortlistEntry[];
}) {
  const [duels, setDuels] = useState(initial);
  const [busy, setBusy] = useState(false);
  const pair = duels.remaining[0];
  const answered = duels.total - duels.remaining.length;
  const ready = duels.order && duels.newCount === 0 ? duels.order : null;

  async function pick(winner: string) {
    if (busy || !pair) return;
    setBusy(true);
    const res = await fetch("/api/duels", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, a: pair[0].id, b: pair[1].id, winner }),
    }).catch(() => null);
    if (res?.ok) setDuels(await res.json());
    setBusy(false);
  }

  return (
    <main className="flex flex-1 flex-col gap-5 px-6 pt-10 pb-40">
      <header>
        <p className="text-xs uppercase tracking-widest text-ink-soft">
          your shortlist · {entries.length} names
        </p>
        <h1 className="font-display text-4xl">This or that</h1>
        <p className="mt-1 text-ink-soft">Two names at a time, in secret. Your ranking builds itself.</p>
      </header>

      {pair ? (
        <div className="space-y-4">
          <p className="text-center text-sm text-ink-soft">
            {answered + 1} of {duels.total}
          </p>
          <AnimatePresence mode="wait">
            <motion.div
              key={answered}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="grid gap-3"
            >
              {pair.map((n) => (
                <button
                  key={n.id}
                  onClick={() => pick(n.id)}
                  disabled={busy}
                  aria-label={`pick ${n.name}`}
                  className="rounded-[20px] border border-paper-dim bg-paper px-6 py-10 text-center hover:border-terra"
                >
                  <div className="font-display text-4xl">{n.name}</div>
                  <div className="mt-1 text-sm text-ink-soft">{n.meaning}</div>
                </button>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : ready ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <OrderSummary order={ready} entries={entries} />
          <ol className="space-y-3 text-center">
            {ready.ids.map((id, i) => (
              <li key={id} className={`font-display ${rankClass(i, true)}`}>
                {entries.find((e) => e.id === id)?.name}
              </li>
            ))}
          </ol>
        </motion.div>
      ) : (
        <p role="status" className="py-12 text-center text-ink-soft">
          All done. Waiting for your partner&apos;s duels…
        </p>
      )}

      <Link
        href={`/shortlist/${token}`}
        className="mx-auto mt-4 min-h-11 text-sm text-ink-soft underline"
      >
        back to our Shortlist
      </Link>
    </main>
  );
}
