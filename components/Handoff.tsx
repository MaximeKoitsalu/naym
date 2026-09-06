"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function fireHandoffMode(token: string, mode: "link" | "same-device") {
  // Fire-and-forget — must not block navigation or the share/copy action.
  fetch("/api/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, event: "handoff_mode_selected", mode }),
  }).catch(() => null);
}

export default function Handoff({
  inviteToken,
  creatorToken,
}: {
  inviteToken: string;
  creatorToken: string;
}) {
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<"sealed" | "interstitial">("sealed");
  const router = useRouter();
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
        fireHandoffMode(creatorToken, "link");
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
      fireHandoffMode(creatorToken, "link");
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  }

  function ready() {
    fireHandoffMode(creatorToken, "same-device");
    // Both tokens' localStorage entries would otherwise share this one
    // browser — clear A's raw swipes so B can't read them via devtools,
    // and replace (not push) so A's token URL isn't left in back-history.
    try {
      localStorage.removeItem(`naym:swipes:${creatorToken}:r1`);
    } catch {}
    router.replace(`/s/${inviteToken}`);
  }

  if (step === "interstitial") {
    return (
      <main className="flex flex-1 flex-col justify-center gap-6 px-8 text-center">
        <h1 className="font-display text-4xl font-semibold">
          Hand the phone to your partner now.
        </h1>
        <button
          onClick={ready}
          className="min-h-14 rounded-full bg-ink px-8 text-lg font-medium text-paper"
        >
          I&apos;m ready
        </button>
      </main>
    );
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
      <button
        onClick={() => setStep("interstitial")}
        className="text-sm text-ink-soft underline underline-offset-2"
      >
        Continue on this phone
      </button>
    </main>
  );
}
