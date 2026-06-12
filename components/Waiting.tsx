"use client";

export default function Waiting({ round2 = false }: { round2?: boolean }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="font-display text-3xl leading-snug">
        {round2 ? "One more wait —" : "They're swiping."}
      </p>
      <p className="text-base leading-relaxed text-ink-soft">
        {round2
          ? "they're on round two right now."
          : "When they finish, your reveal is waiting right here."}
      </p>
      <p className="text-sm text-ink-soft">
        Keep this page — it checks on its own. No spoilers, promise.
      </p>
    </main>
  );
}
