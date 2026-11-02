"use client";

import { useState } from "react";
import type { DeckGender } from "@/lib/deck-manifest";
import { MAX_WISHES, MAX_WISH_LENGTH, sameName, wishGenderLabel, type Wish } from "@/lib/wishes";
import { Choice, useWishGender, WishGenderPick } from "./Choice";
import { replaceHolder } from "@/lib/shortlist-device";
import { otherPartner, type Partner } from "@/lib/types";

/*
  The "Us" tab: who we're naming, the wish slip (#23), this partner's own link,
  and a fresh link for the other partner when theirs is lost. The girl/boy/both
  filter lives on the Shortlist itself.
*/

const wishLabel = (w: Wish) => `${w.name} (${wishGenderLabel(w.gender)})`;

/** Variant C's paper slip. The server validates; the input only hints. */
function WishSlip({
  token,
  expecting,
  wishes,
  inDeck,
  onWishes,
}: {
  token: string;
  expecting: DeckGender;
  wishes: Wish[];
  /** Names of queued wishes already dealt into the live deck. */
  inDeck: string[];
  onWishes: (w: Wish[]) => void;
}) {
  const [text, setText] = useState("");
  const [gender, setGender] = useWishGender(text, expecting);
  const [error, setError] = useState<string | null>(null);
  const full = wishes.length >= MAX_WISHES;
  const dealt = wishes.filter((w) => inDeck.some((d) => sameName(d, w.name)));
  const waiting = wishes.filter((w) => !dealt.includes(w));
  async function submitWish(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/shortlist/wishes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, name: text, gender }),
    }).catch(() => null);
    const body = res?.ok ? await res.json() : null;
    if (body?.wishes) {
      onWishes(body.wishes);
      setText("");
    } else {
      setError(
        res?.status === 400
          ? "Letters, spaces, hyphens and apostrophes only."
          : res?.status === 409
            ? `${MAX_WISHES} names are already waiting — swipe a deck first.`
            : "That didn't save — try again.",
      );
    }
  }
  return (
    <form onSubmit={submitWish} className="rounded-[20px] bg-paper-dim p-5">
      <p className="font-display text-xl">Slip a name into the next deck</p>
      <p className="mt-1 text-sm text-ink-soft">
        It&apos;ll show up as a wish. You both swipe it — it only joins the Shortlist if you both love it.
        Each deck takes up to half its size of your names; the rest wait for the next.
      </p>
      <div className="mt-4">
        <WishGenderPick value={gender} onChange={setGender} />
      </div>
      <div className="mt-4 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="a name"
          aria-label="a name to slip into the next deck"
          maxLength={MAX_WISH_LENGTH}
          disabled={full}
          className="min-h-12 min-w-0 flex-1 rounded-2xl border border-ink-soft/25 bg-paper px-4 font-display text-lg italic outline-none focus:border-terra"
        />
        <button
          type="submit"
          disabled={!text.trim() || full}
          className="min-h-12 rounded-2xl bg-terra px-5 text-paper disabled:opacity-40"
        >
          Slip
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-terra-deep">
          {error}
        </p>
      )}
      {waiting.length > 0 && (
        <p className="mt-3 text-sm text-ink-soft">
          Waiting for the next deck: {waiting.map(wishLabel).join(", ")}
        </p>
      )}
      {dealt.length > 0 && (
        <p className="mt-3 text-sm text-ink-soft">
          In the deck you&apos;re swiping now: {dealt.map(wishLabel).join(", ")}
        </p>
      )}
    </form>
  );
}

export function CopyLinkButton({
  token,
  autoFocus,
  label = "Copy my Shortlist link",
}: {
  token: string;
  autoFocus?: boolean;
  label?: string;
}) {
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
      {copied ? "Link copied" : label}
    </button>
  );
}


/** Revokes the other partner's lost link; the fresh one is shown here only. */
function FreshPartnerLink({ token, partner }: { token: string; partner: Partner }) {
  const [step, setStep] = useState<"idle" | "confirm" | "busy" | "none">("idle");
  const [fresh, setFresh] = useState<string | null>(null);
  async function reissue() {
    setStep("busy");
    const res = await fetch("/api/shortlist/reissue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => null);
    const body = res?.ok ? await res.json() : null;
    if (body?.token) {
      replaceHolder(otherPartner(partner), body.token); // a shared phone keeps both links
      setFresh(body.token);
    } else setStep(res?.status === 404 ? "none" : "confirm");
  }
  if (fresh) {
    return (
      <div className="space-y-2">
        <p className="text-sm leading-relaxed text-ink-soft">
          Their old link no longer opens. Pass this one on — it&apos;s theirs alone.
        </p>
        <CopyLinkButton token={fresh} label="Copy my partner's fresh link" />
      </div>
    );
  }
  if (step === "none") {
    return <p className="text-sm text-ink-soft">Your partner hasn&apos;t joined yet — there&apos;s no link to replace.</p>;
  }
  if (step === "idle") {
    return (
      <button onClick={() => setStep("confirm")} className="min-h-11 w-full text-sm text-ink-soft underline">
        Send my partner a fresh link
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm leading-relaxed text-ink-soft">
        Lost their link? A fresh one stops the old one working. Yours stays the same.
      </p>
      <button
        onClick={reissue}
        disabled={step === "busy"}
        className="min-h-12 w-full rounded-full border border-ink-soft/25 px-6 font-medium"
      >
        Make a fresh link for my partner
      </button>
    </div>
  );
}

const EXPECTING_OPTIONS: { value: DeckGender; label: string }[] = [
  { value: "girl", label: "a girl" },
  { value: "boy", label: "a boy" },
  { value: "unsure", label: "not sure yet" },
];


export default function UsPanel({
  token,
  partner,
  expecting: initialExpecting,
  wishes: initialWishes,
  wishesInDeck,
}: {
  token: string;
  partner: Partner;
  expecting: DeckGender;
  wishes: Wish[];
  wishesInDeck: string[];
}) {
  const [expecting, setExpecting] = useState(initialExpecting);
  const [wishes, setWishes] = useState(initialWishes);

  function changeExpecting(g: DeckGender) {
    // Optimistic; a failed save reverts.
    const before = expecting;
    setExpecting(g);
    fetch("/api/shortlist/expecting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, expecting: g }),
    })
      .then((r) => {
        if (!r.ok) throw new Error();
      })
      .catch(() => setExpecting(before));
  }

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 pt-10 pb-[calc(var(--nav-h)+2.5rem)]">
      <h1 className="font-display text-4xl">Us</h1>
      <Choice legend="who are we naming?" options={EXPECTING_OPTIONS} value={expecting} onChange={changeExpecting} />
      <WishSlip token={token} expecting={expecting} wishes={wishes} inDeck={wishesInDeck} onWishes={setWishes} />
      <section className="space-y-3">
        <p className="text-sm leading-relaxed text-ink-soft">
          This link is yours alone. Your partner has their own.
        </p>
        <CopyLinkButton token={token} />
        <FreshPartnerLink token={token} partner={partner} />
      </section>
    </main>
  );
}
