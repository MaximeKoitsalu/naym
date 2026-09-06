import { createHash } from "node:crypto";
import nordic from "@/data/decks/nordic.json";
import greek from "@/data/decks/greek.json";
import german from "@/data/decks/german.json";
import italian from "@/data/decks/italian.json";
import french from "@/data/decks/french.json";
import type { NameCard } from "./types";
import { DEFAULT_DECK_SIZE, MAX_DECK_SIZE, MIN_DECK_SIZE } from "./deck-manifest";

/*
  Deck registry (server-side — full deck data).
  Sessions PIN their deck snapshot at creation, so editing these files
  never affects a live session. The client-side picker uses the
  lightweight manifest in deck-manifest.ts, not these imports.
*/

type DeckFile = { deckId: string; title: string; names: NameCard[] };

export type DeckEntry = {
  deckId: string;
  title: string;
  names: NameCard[];
  version: string;
};

const FILES: DeckFile[] = [nordic, greek, german, italian, french];

const REGISTRY = new Map<string, DeckEntry>(
  FILES.map((f) => [
    f.deckId,
    {
      deckId: f.deckId,
      title: f.title,
      names: f.names,
      version: createHash("sha256").update(JSON.stringify(f)).digest("hex").slice(0, 12),
    },
  ]),
);

export const DEFAULT_DECK_ID = "nordic-v1";

export function getDeckEntry(deckId: string): DeckEntry | null {
  return REGISTRY.get(deckId) ?? null;
}

export function allDeckIds(): string[] {
  return [...REGISTRY.keys()];
}

/** Clamp a requested deck size into [MIN_DECK_SIZE, MAX_DECK_SIZE], defaulting garbage input. */
function clampSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_DECK_SIZE;
  return Math.min(MAX_DECK_SIZE, Math.max(MIN_DECK_SIZE, Math.round(size)));
}

/**
 * Build the deck a session will pin. One origin → that deck verbatim when
 * `size` is the full MAX_DECK_SIZE, otherwise a shuffled subset of it.
 * Several origins → a BLEND: an even stratified sample of `size` across the
 * chosen decks (floor split, remainder to the earliest picks), shuffled,
 * deduped by id. The finite-deck premise survives — both partners still
 * swipe the same cards, whatever the mix or size.
 *
 * `rand` is injectable for deterministic tests.
 */
export function buildSessionDeck(
  deckIds: string[],
  size: number = DEFAULT_DECK_SIZE,
  rand: () => number = Math.random,
): DeckEntry | null {
  const unique = [...new Set(deckIds)];
  if (unique.length === 0) return null;
  const entries = unique.map((id) => getDeckEntry(id));
  if (entries.some((e) => e === null)) return null;
  const decks = entries as DeckEntry[];
  const target = clampSize(size);

  if (decks.length === 1) {
    const deck = decks[0];
    if (target >= deck.names.length) return deck; // full deck — verbatim, unshuffled
    return { ...deck, names: shuffle(deck.names, rand).slice(0, target) };
  }

  const per = Math.floor(target / decks.length);
  const remainder = target - per * decks.length;
  const seen = new Set<string>();
  const picked: NameCard[] = [];
  decks.forEach((deck, i) => {
    const take = per + (i < remainder ? 1 : 0);
    let taken = 0;
    for (const card of shuffle(deck.names, rand)) {
      if (taken >= take) break;
      if (seen.has(card.id)) continue; // cross-deck id collision — keep first
      seen.add(card.id);
      picked.push(card);
      taken++;
    }
  });

  const names = shuffle(picked, rand);
  const labels = decks.map((d) => d.title.replace(/ deck$/, ""));
  return {
    deckId: decks.map((d) => d.deckId).join("+"),
    title: `${labels.join(" × ")} deck`,
    names,
    version: createHash("sha256").update(JSON.stringify(names)).digest("hex").slice(0, 12),
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
