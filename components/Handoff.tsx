"use client";

import { useState } from "react";

export default function Handoff({ inviteToken }: { inviteToken: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/s/${inviteToken}`
      : `/s/${inviteToken}`;

  async function send() {
    // Native share where it exists; copy as the universal fallback.
    if (navigator.share) {
      try {
        await navigator.share({
          title: "naym",
          text: "I picked my favorite baby names in secret. Your turn — we only see the ones we BOTH chose.",
          url,
        });
        return;
      } catch {
        /* user dismissed the sheet — fall through to copy */
      }
    }
    await copy();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  }

  return (
    <main className="flex flex-1 flex-col justify-center gap-6 px-8 text-center">
      <h1 className="font-display text-4xl font-semibold">Your picks are sealed.</h1>
      <p className="text-base leading-relaxed text-ink-soft">
        Now it&apos;s their turn. They&apos;ll swipe the same {""}
        names — and they can&apos;t see what you chose.
      </p>
      <p className="flex items-center justify-center gap-1.5 text-sm text-ink-soft">
        <span aria-hidden>🔒</span> nothing is revealed until you&apos;ve both finished
      </p>
      {/* Primary action directly under the body copy (D4) — the raw URL is noise. */}
      <button
        onClick={send}
        className="min-h-14 rounded-full bg-ink px-8 text-lg font-medium text-paper"
      >
        Send to your partner
      </button>
      <button onClick={copy} className="text-sm text-ink-soft underline underline-offset-2">
        {copied ? "copied ✓" : "copy link instead"}
      </button>
    </main>
  );
}
