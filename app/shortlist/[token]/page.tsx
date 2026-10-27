import Link from "next/link";
import ShortlistPage from "@/components/Shortlist";
import { getShortlistView } from "@/lib/shortlist";

export default async function ShortlistRoute({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // A read only — the view carries this partner's matches, never the other's token.
  const view = await getShortlistView(token);
  if (!view) {
    return (
      <main className="flex flex-1 flex-col justify-center gap-5 px-8 text-center">
        <h1 className="font-display text-3xl">This Shortlist link doesn&apos;t open.</h1>
        <p className="text-base leading-relaxed text-ink-soft">
          It may have been replaced with a fresh one. Ask your partner, or
          start a new deck.
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
  return <ShortlistPage token={token} expecting={view.expecting} entries={view.entries} />;
}
