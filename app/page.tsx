"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Landing() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const res = await fetch("/api/session", { method: "POST" });
      const { creatorToken } = await res.json();
      // The creator URL is partner A's identity for this session.
      localStorage.setItem(`naym:role:${creatorToken}`, "A");
      router.push(`/s/${creatorToken}`);
    } catch {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col justify-center gap-8 px-8 py-16">
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
