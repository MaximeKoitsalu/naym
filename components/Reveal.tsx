"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { RevealPayload } from "@/lib/types";

/*
  The reveal — count-first suspense arc (design review D9).

  gate  →  "ready? tap when you're together"        (the tap is the audio unlock, later)
  beat1 →  "out of 50 names…"                        ~1.2s hold, slow ease-out
  beat2 →  the count lands with spring overshoot     the ONE suspense spike; identical
                                                     weight when the count is 0
  beat3 →  names enter typographically               700ms stagger (300ms at 8+),
                                                     meaning fades in beneath
  beat4 →  settles into the keepsake; CTAs last

  prefers-reduced-motion: same beats as crossfades — zero springs, full copy,
  the emotional arc survives with animations off (design review D11).
*/

type Phase = "gate" | "beat1" | "beat2" | "beat3" | "beat4";

export default function Reveal({
  token,
  role,
  onArmedRound2,
}: {
  token: string;
  role: "A" | "B";
  onArmedRound2: () => void;
}) {
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [phase, setPhase] = useState<Phase>("gate");
  const [arming, setArming] = useState(false);
  const reduced = useReducedMotion();

  // The held beat while the intersection fetches reads as anticipation.
  useEffect(() => {
    fetch(`/api/reveal?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setReveal)
      .catch(() => null);
  }, [token]);

  // Beat clock. Reduced motion keeps the same pacing, swaps springs for fades.
  useEffect(() => {
    if (phase === "gate" || phase === "beat4" || !reveal) return;
    const final = reveal.round2 ?? reveal;
    const stagger = final.matches.length >= 8 ? 300 : 700;
    const durations: Record<Exclude<Phase, "gate" | "beat4">, number> = {
      beat1: 1600,
      beat2: 1400,
      beat3: Math.max(1200, final.matches.length * stagger + 600),
    };
    const next: Record<string, Phase> = { beat1: "beat2", beat2: "beat3", beat3: "beat4" };
    const t = setTimeout(() => setPhase(next[phase]), durations[phase]);
    return () => clearTimeout(t);
  }, [phase, reveal]);

  async function armRound2() {
    setArming(true);
    const res = await fetch("/api/round2", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => null);
    if (res?.ok) onArmedRound2();
    else setArming(false);
  }

  async function share() {
    const url = `${window.location.origin}/api/keepsake?token=${encodeURIComponent(token)}`;
    fetch("/api/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, event: "reveal_shared" }),
    }).catch(() => null);
    if (navigator.share) {
      try {
        await navigator.share({ title: "naym", text: "We both chose…", url });
        return;
      } catch {}
    }
    window.open(url, "_blank");
  }

  if (!reveal && phase !== "gate") return null;

  // ---- The tap gate ----
  if (phase === "gate") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
        <p className="font-display text-3xl leading-snug">Your reveal is ready.</p>
        <p className="text-base text-ink-soft">
          {role === "B"
            ? "Best together — sit next to them if you can."
            : "Take a breath. This is the moment."}
        </p>
        <button
          onClick={() => setPhase("beat1")}
          disabled={!reveal}
          className="min-h-14 rounded-full bg-terra px-10 text-lg font-medium text-paper disabled:opacity-60"
        >
          {reveal ? "Tap to reveal" : "Unsealing…"}
        </button>
      </main>
    );
  }

  if (!reveal) return null;
  const final = reveal.round2 ?? reveal;
  const matches = final.matches;
  const zero = matches.length === 0;
  const fade = { initial: { opacity: 0 }, animate: { opacity: 1 } };
  const springUp = reduced
    ? fade
    : {
        initial: { opacity: 0, y: 24, scale: 0.9 },
        animate: { opacity: 1, y: 0, scale: 1 },
      };
  const stagger = matches.length >= 8 ? 0.3 : 0.7;

  return (
    <main className="flex flex-1 flex-col justify-center gap-6 px-8 py-10 text-center">
      <AnimatePresence mode="wait">
        {phase === "beat1" && (
          <motion.p
            key="b1"
            {...fade}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className="font-display text-3xl text-ink-soft"
          >
            out of {final.deckSize} names…
          </motion.p>
        )}

        {phase !== "beat1" && (
          <motion.div key="count" className="flex flex-col gap-6">
            {/* Beat 2 — the drop. Identical weight at zero. */}
            <motion.h1
              {...springUp}
              transition={
                reduced
                  ? { duration: 0.6 }
                  : { type: "spring", stiffness: 260, damping: 14 }
              }
              className="font-display text-4xl leading-snug"
            >
              {zero ? (
                <>
                  you both chose <span className="text-terra">0</span>
                </>
              ) : matches.length === 1 ? (
                <>
                  one name.{" "}
                  <span className="text-terra">both of you.</span>
                </>
              ) : (
                <>
                  you both chose{" "}
                  <span className="text-terra">{matches.length}</span>
                </>
              )}
            </motion.h1>

            {/* Beat 3 — the names, typographic entries ON the keepsake (R5: no boxed cards). */}
            {(phase === "beat3" || phase === "beat4") && !zero && (
              <motion.ul
                initial="hidden"
                animate="show"
                variants={{
                  hidden: {},
                  show: { transition: { staggerChildren: reduced ? 0.25 : stagger } },
                }}
                className="flex flex-col gap-4"
              >
                {matches.map((m) => (
                  <motion.li
                    key={m.id}
                    variants={{
                      hidden: reduced ? { opacity: 0 } : { opacity: 0, y: 18 },
                      show: reduced
                        ? { opacity: 1, transition: { duration: 0.5 } }
                        : {
                            opacity: 1,
                            y: 0,
                            transition: { type: "spring", stiffness: 240, damping: 22 },
                          },
                    }}
                  >
                    <p
                      className={`font-display font-semibold text-terra-deep ${
                        m.name.length > 12 ? "text-3xl" : "text-4xl"
                      }`}
                    >
                      {m.name}
                    </p>
                    <p className="text-sm text-ink-soft">{m.meaning}</p>
                  </motion.li>
                ))}
              </motion.ul>
            )}

            {/* Zero-match: full production parity (design review D7). */}
            {(phase === "beat3" || phase === "beat4") && zero && (
              <motion.div {...fade} transition={{ duration: 0.8 }} className="flex flex-col gap-3">
                <p className="text-base leading-relaxed text-ink-soft">
                  0 of {final.deckSize} — that&apos;s a real answer too.
                </p>
                {reveal.round2 ? (
                  <p className="text-base leading-relaxed text-ink-soft">
                    Two rounds, fifty-plus names, two honest people. The right
                    name is still out there — and now you know a lot more about
                    what it isn&apos;t.
                  </p>
                ) : (
                  <p className="text-base leading-relaxed text-ink-soft">
                    It usually means the right name isn&apos;t hiding in this
                    deck — or it&apos;s waiting in round two.
                  </p>
                )}
              </motion.div>
            )}

            {/* Beat 4 — the settle: keepsake frame + CTAs last. */}
            {phase === "beat4" && (
              <motion.div {...fade} transition={{ duration: 0.7 }} className="flex flex-col gap-4">
                <p className="text-sm text-ink-soft">
                  {zero
                    ? ""
                    : `${matches.length} of ${final.deckSize} — chosen twice.`}
                </p>

                {!zero && (
                  <>
                    <button
                      onClick={share}
                      className="min-h-14 rounded-full bg-ink px-8 text-lg font-medium text-paper"
                    >
                      Save the keepsake card
                    </button>
                    {role === "B" && (
                      <p className="text-sm leading-relaxed text-ink-soft">
                        Don&apos;t tell them which names — show them this
                        screen together, or let them open their own link.
                      </p>
                    )}
                  </>
                )}

                {zero && reveal.round2Available && !reveal.round2Armed && (
                  <button
                    onClick={armRound2}
                    disabled={arming}
                    className="min-h-14 rounded-full bg-terra px-8 text-lg font-medium text-paper disabled:opacity-60"
                  >
                    {arming ? "Dealing round two…" : "Begin round two"}
                  </button>
                )}
                {zero && reveal.round2Available && !reveal.round2Armed && (
                  <p className="text-sm text-ink-soft">
                    A short second deck — names with a real chance, plus a few
                    wild cards. Still sealed, both of you swipe again.
                  </p>
                )}
                {zero && reveal.round2Armed && !reveal.round2 && (
                  <p className="text-sm text-ink-soft">
                    Round two is dealt — your deck is ready on this page.
                  </p>
                )}
                {zero && !reveal.round2Available && !reveal.round2 && (
                  <p className="font-display text-xl">
                    Fifty honest answers is its own keepsake.
                  </p>
                )}

                <p className="pt-4 font-display text-xl lowercase text-ink-soft">naym</p>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
