"use client";

import Link from "next/link";

export function ExpiredScreen() {
  return (
    <main className="flex flex-1 flex-col justify-center gap-5 px-8 text-center">
      <h1 className="font-display text-3xl">This session has ended.</h1>
      <p className="text-base leading-relaxed text-ink-soft">
        Sessions keep for 30 days, then quietly let go. Nothing was revealed
        to anyone.
      </p>
      <Link
        href="/"
        className="mx-auto min-h-14 rounded-full bg-ink px-8 py-4 text-lg font-medium text-paper"
      >
        Start a fresh deck
      </Link>
    </main>
  );
}

export function LoadingScreen() {
  return (
    <main className="flex flex-1 items-center justify-center" aria-busy>
      <p className="font-display text-2xl lowercase text-ink-soft">naym</p>
    </main>
  );
}
