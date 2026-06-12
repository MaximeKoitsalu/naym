import { createHash } from "node:crypto";
import nordic from "@/data/decks/nordic.json";
import greek from "@/data/decks/greek.json";
import german from "@/data/decks/german.json";
import italian from "@/data/decks/italian.json";
import french from "@/data/decks/french.json";
import type { NameCard } from "./types";

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
