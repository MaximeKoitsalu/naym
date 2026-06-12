"use client";

/*
  Partner B's front door — the kill metric's most fragile moment.
  One anchor (the partner framing), one promise, one CTA.
  The B slot binds on the tap below, never on this render (prefetch-safe).
*/
export default function InviteLanding({
  deckSize,
  onStart,
}: {
  deckSize: number;
  onStart: () => void;
}) {
  return (
    <main className="flex flex-1 flex-col justify-center gap-6 px-8">
      <p className="font-display text-2xl lowercase">naym</p>
      <h1 className="font-display text-3xl leading-snug">
        Your partner picked their favorites from {deckSize} names.
      </h1>
      <p className="text-base leading-relaxed text-ink-soft">
        Your turn. They can&apos;t see your answers, and you can&apos;t see
        theirs — until you&apos;ve both finished. Then one reveal shows only
        the names you both chose.
      </p>
      <button
        onClick={onStart}
        className="min-h-14 rounded-full bg-ink px-8 text-lg font-medium text-paper"
      >
        Start swiping
      </button>
      <p className="text-sm text-ink-soft">About 5 minutes. No account.</p>
    </main>
  );
}
