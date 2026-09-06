"use client";

import { useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import type { NameCard, Swipe } from "@/lib/types";
import { swipesLocalKey } from "@/lib/local-swipes";

/*
  Swipe physics contract (design review D14, starting values — tune on device):
  commit at 35% card width OR flick velocity > 500px/s; max rotation 12°;
  spring return stiffness 300 / damping 30; intent overlays fade proportional
  to drag; button taps animate the same exit as a drag (buttons ARE the
  accessible path); undo unlimited within the deck, disabled after the final
  card; touch-action: pan-y so cards never fight page scroll.
*/
const COMMIT_FRACTION = 0.35;
const COMMIT_VELOCITY = 500;
const MAX_ROTATION = 12;

export default function SwipeDeck({
  deck,
  initial,
  round,
  onSync,
}: {
  deck: NameCard[];
  initial: Swipe[];
  round: 1 | 2;
  onSync: (swipes: Swipe[], done: boolean) => void;
}) {
  const [swipes, setSwipes] = useState<Swipe[]>(initial);
  const [exiting, setExiting] = useState<1 | -1 | 0>(0);
  const reduced = useReducedMotion();
  const surfaceRef = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-MAX_ROTATION, MAX_ROTATION]);
  const likeOpacity = useTransform(x, [40, 160], [0, 1]);
  const skipOpacity = useTransform(x, [-160, -40], [1, 0]);

  const index = swipes.length;
  const card = deck[index];
  const done = index >= deck.length;

  function commit(liked: boolean) {
    if (!card) return;
    const next = [...swipes, { id: card.id, liked }];
    setSwipes(next);
    setExiting(0);
    x.set(0);
    onSync(next, next.length === deck.length);
  }

  function decide(liked: boolean) {
    // Rapid double-tap during the exit animation must produce exactly one
    // record — ignore decisions while a card is mid-exit.
    if (exiting !== 0) return;
    // Button taps animate the same exit as a full drag — parity.
    if (reduced) {
      commit(liked);
      return;
    }
    setExiting(liked ? 1 : -1);
    animate(x, liked ? 420 : -420, {
      type: "spring",
      stiffness: 300,
      damping: 30,
      onComplete: () => commit(liked),
    });
  }

  function onDragEnd(_: unknown, info: { offset: { x: number }; velocity: { x: number } }) {
    const width = surfaceRef.current?.offsetWidth ?? 360;
    const past = Math.abs(info.offset.x) > width * COMMIT_FRACTION;
    const flick = Math.abs(info.velocity.x) > COMMIT_VELOCITY;
    if (past || flick) decide(info.offset.x > 0);
    else animate(x, 0, { type: "spring", stiffness: 300, damping: 30 });
  }

  function undo() {
    if (swipes.length === 0 || done) return; // undo dies after the final card — completion is final
    const prev = swipes.slice(0, -1);
    setSwipes(prev);
    // Note: the server's monotonic guard means the shorter array is rejected
    // remotely until forward progress resumes — local state leads, by design.
    try {
      localStorage.setItem(
        swipesLocalKey(location.pathname.split("/").pop()!, round),
        JSON.stringify(prev),
      );
    } catch {}
  }

  const lastSwipe = swipes[swipes.length - 1];
  const lastName = lastSwipe ? deck.find((c) => c.id === lastSwipe.id)?.name : null;

  if (done) {
    // Final sync already fired in commit(); SessionClient flips the stage
    // after the awaited refresh. Brief sealed beat in the meantime.
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-8">
        <p className="font-display text-3xl">Sealed.</p>
        <p className="text-ink-soft">Saving your picks…</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-4">
      {/* Header: the blindness promise is persistent and legible (D4). */}
      <header className="flex items-center justify-between pb-2 text-sm text-ink-soft">
        <span aria-label="progress saves automatically">save &amp; close</span>
        <span className="flex items-center gap-1 font-medium text-ink">
          <span aria-hidden>🔒</span> sealed — they never see your picks
        </span>
        <span aria-live="polite">
          {index + 1} / {deck.length}
        </span>
      </header>
      <div className="h-1 w-full rounded bg-paper-dim">
        <div
          className="h-1 rounded bg-terra transition-[width]"
          style={{ width: `${(index / deck.length) * 100}%` }}
        />
      </div>

      {round === 1 && index === Math.floor(deck.length / 2) && (
        <p className="pt-2 text-center text-sm text-ink-soft">
          halfway — {deck.length - index} to go
        </p>
      )}
      {round === 2 && index === 0 && (
        <p className="pt-2 text-center text-sm text-ink-soft">
          round two — a fresh look, still sealed
        </p>
      )}

      {/* The card */}
      <div ref={surfaceRef} className="swipe-surface relative flex flex-1 items-stretch py-4">
        <AnimatePresence>
          <motion.article
            key={`${round}-${card.id}`}
            className="relative flex flex-1 flex-col items-center justify-center gap-3 rounded-[20px] bg-paper-dim px-8 text-center"
            style={reduced ? {} : { x, rotate }}
            drag={reduced ? false : "x"}
            dragDirectionLock
            dragSnapToOrigin={false}
            onDragEnd={onDragEnd}
            initial={reduced ? { opacity: 0 } : { scale: 0.96, opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            aria-live="polite"
            aria-label={`${card.name}, ${card.meaning}`}
          >
            {!reduced && (
              <>
                <motion.span
                  style={{ opacity: likeOpacity }}
                  className="absolute left-6 top-6 rounded-full border-2 border-terra px-3 py-1 font-display text-lg text-terra"
                  aria-hidden
                >
                  love
                </motion.span>
                <motion.span
                  style={{ opacity: skipOpacity }}
                  className="absolute right-6 top-6 rounded-full border-2 border-ink-soft px-3 py-1 font-display text-lg text-ink-soft"
                  aria-hidden
                >
                  pass
                </motion.span>
              </>
            )}
            <h2
              className={`font-display font-semibold leading-none ${
                card.name.length > 8 ? "text-5xl" : "text-6xl"
              }`}
            >
              {card.name}
            </h2>
            <p className="text-sm italic text-ink-soft">{card.say}</p>
            <p className="rounded-full border border-ink-soft/40 px-3 py-0.5 text-xs uppercase tracking-wider text-ink-soft">
              {card.origin}
            </p>
            <p className="max-w-[260px] text-base leading-relaxed text-ink-soft">
              {card.meaning}
            </p>
          </motion.article>
        </AnimatePresence>
      </div>

      {index === 0 && round === 1 && (
        <p className="pb-2 text-center text-sm text-ink-soft">
          swipe right if you love it, left to pass — or use the buttons
        </p>
      )}

      {/* Decision row: ✕ and ♥ are the ONLY elements on the action axis (D3). */}
      <div className="flex items-center justify-center gap-12 pt-1">
        <button
          onClick={() => decide(false)}
          aria-label={`pass on ${card.name}`}
          className="flex size-16 items-center justify-center rounded-full border-2 border-ink text-2xl"
        >
          ✕
        </button>
        <button
          onClick={() => decide(true)}
          aria-label={`love ${card.name}`}
          className="flex size-16 items-center justify-center rounded-full bg-terra text-2xl text-paper"
        >
          ♥
        </button>
      </div>
      <div className="flex min-h-9 items-start justify-start pt-2">
        {swipes.length > 0 && (
          <button
            onClick={undo}
            aria-label={`undo, bring back ${lastName}`}
            className="rounded-full px-3 py-1 text-sm text-ink-soft underline underline-offset-2"
          >
            ↩ undo {lastName}
          </button>
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        {exiting !== 0 ? "card sent" : ""}
      </span>
    </main>
  );
}
