import { createHash } from "node:crypto";
import nordic from "@/data/decks/nordic.json";
import greek from "@/data/decks/greek.json";
import german from "@/data/decks/german.json";
import italian from "@/data/decks/italian.json";
import french from "@/data/decks/french.json";
import type { NameCard } from "./types";
import { sameName } from "./wishes";
import { shuffle } from "./reveal";
import {
  DEFAULT_DECK_SIZE,
  MAX_DECK_SIZE,
  MIN_DECK_SIZE,
  type DeckGender,
  type GenderCounts,
} from "./deck-manifest";

/*
  Deck registry (server-side — full deck data).
  Sessions PIN their deck snapshot at creation, so editing these files
  never affects a live session. The client-side picker uses the
  lightweight manifest in deck-manifest.ts, not these imports.
*/

type TaggedCard = NameCard & { gender: NonNullable<NameCard["gender"]> };
type DeckFile = { deckId: string; title: string; names: TaggedCard[] };

export type DeckEntry = {
  deckId: string;
  title: string;
  names: NameCard[];
  version: string;
};

const isTag = (g: string): g is TaggedCard["gender"] =>
  g === "girl" || g === "boy" || g === "unisex";

// JSON imports widen `gender` to string: narrow it, failing loudly on a bad or missing tag.
function tagged(f: typeof nordic): DeckFile {
  return {
    ...f,
    names: f.names.map((n) => {
      if (!isTag(n.gender)) throw new Error(`${f.deckId}/${n.id}: bad gender tag "${n.gender}"`);
      return { ...n, gender: n.gender };
    }),
  };
}

const FILES: DeckFile[] = [nordic, greek, german, italian, french].map(tagged);

const versionOf = (data: unknown) =>
  createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 12);

const REGISTRY = new Map<string, DeckEntry>(
  FILES.map((f) => [
    f.deckId,
    {
      deckId: f.deckId,
      title: f.title,
      names: f.names,
      version: versionOf(f),
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

/** Per deck, the gender counts of names NOT in `seen` — the dealing builder's pool. */
export function unseenCounts(seen: ReadonlySet<string>): Record<string, GenderCounts> {
  const out: Record<string, GenderCounts> = {};
  for (const [id, deck] of REGISTRY) {
    const c = (out[id] = { girl: 0, boy: 0, unisex: 0 });
    for (const n of deck.names) if (!seen.has(n.id) && n.gender) c[n.gender]++;
  }
  return out;
}

/**
 * A wish as a card: a curated card with the same name (case-insensitive) is
 * borrowed whole, preferring the chosen decks; an unknown name becomes an
 * untagged wish card.
 */
export function wishCard(name: string, preferDeckIds: string[] = []): NameCard {
  const decks = [...preferDeckIds.map((id) => getDeckEntry(id)), ...REGISTRY.values()];
  for (const d of decks) {
    const card = d?.names.find((c) => sameName(c.name, name));
    if (card) return card;
  }
  return { id: `wish-${name.toLocaleLowerCase()}`, name, say: "", origin: "", meaning: "", wish: true };
}

/** Clamp a requested deck size into [MIN_DECK_SIZE, MAX_DECK_SIZE], defaulting garbage input. */
function clampSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_DECK_SIZE;
  return Math.min(MAX_DECK_SIZE, Math.max(MIN_DECK_SIZE, Math.round(size)));
}

/**
 * A deck's cards in dealing order for `gender`. Girl/boy: that gender plus
 * unisex, shuffled. Not sure yet: girls and boys alternate (starting side set
 * by `boyFirst`, so blends stay even overall), and a side that runs short is
 * filled from unisex before the other side takes the surplus.
 */
function dealOrder(
  names: NameCard[],
  gender: DeckGender,
  boyFirst: boolean,
  rand: () => number,
): NameCard[] {
  if (gender !== "unsure") {
    return shuffle(names.filter((c) => c.gender === gender || c.gender === "unisex"), rand);
  }
  const of = (g: NameCard["gender"]) => shuffle(names.filter((c) => c.gender === g), rand);
  const girls = of("girl");
  const boys = of("boy");
  const unisex = of("unisex");
  const sides = boyFirst ? [boys, girls] : [girls, boys];
  const out: NameCard[] = [];
  while (girls.length || boys.length || unisex.length) {
    for (const side of sides) {
      const card = side.shift() ?? unisex.shift();
      if (card) out.push(card);
    }
  }
  return out;
}

/**
 * Build the deck a session will pin. One origin → that deck verbatim when
 * `size` is the full MAX_DECK_SIZE and gender is "unsure", otherwise a
 * shuffled subset of it.
 * Several origins → a BLEND: an even stratified sample of `size` across the
 * chosen decks (floor split, remainder to the earliest picks), shuffled,
 * deduped by id. The finite-deck premise survives — both partners still
 * swipe the same cards, whatever the mix or size.
 *
 * `gender` filters the cards (unisex counts for both); "unsure" deals an even
 * girl/boy split. A pool smaller than `size` yields a smaller deck — the
 * picker disables those sizes, and a dealt deck reports it (dealSession).
 *
 * `exclude` drops the couple's Seen names before dealing — never refilled.
 * `wishes` (cards from wishCard) take slots of `size` and are shuffled in,
 * whatever the gender and even if Seen.
 * `rand` is injectable for deterministic tests.
 */
export function buildSessionDeck(
  deckIds: string[],
  size: number = DEFAULT_DECK_SIZE,
  gender: DeckGender = "unsure",
  rand: () => number = Math.random,
  exclude: ReadonlySet<string> = new Set(),
  wishes: NameCard[] = [],
): DeckEntry | null {
  const wishIds = wishes.map((w) => w.id);
  const base = curatedDeck(
    deckIds,
    clampSize(size) - wishes.length,
    gender,
    rand,
    wishes.length ? new Set([...exclude, ...wishIds]) : exclude,
  );
  if (!base || wishes.length === 0) return base;
  const names = shuffle([...base.names, ...wishes], rand);
  return {
    ...base,
    names,
    version: versionOf(names),
  };
}

function curatedDeck(
  deckIds: string[],
  target: number,
  gender: DeckGender,
  rand: () => number,
  exclude: ReadonlySet<string>,
): DeckEntry | null {
  const unique = [...new Set(deckIds)];
  if (unique.length === 0) return null;
  const entries = unique.map((id) => getDeckEntry(id));
  if (entries.some((e) => e === null)) return null;
  const decks = (entries as DeckEntry[]).map((d) =>
    exclude.size ? { ...d, names: d.names.filter((c) => !exclude.has(c.id)) } : d,
  );

  if (decks.length === 1) {
    const deck = decks[0];
    // full deck — verbatim, unshuffled
    if (gender === "unsure" && target >= deck.names.length) return deck;
    return {
      ...deck,
      names: shuffle(dealOrder(deck.names, gender, rand() < 0.5, rand).slice(0, target), rand),
    };
  }

  const per = Math.floor(target / decks.length);
  const remainder = target - per * decks.length;
  const seen = new Set<string>();
  const picked: NameCard[] = [];
  const orders = decks.map((deck, i) => dealOrder(deck.names, gender, i % 2 === 1, rand));
  orders.forEach((order, i) => {
    const take = per + (i < remainder ? 1 : 0);
    let taken = 0;
    while (taken < take && order.length) {
      const card = order.shift()!;
      if (seen.has(card.id)) continue; // cross-deck id collision — keep first
      seen.add(card.id);
      picked.push(card);
      taken++;
    }
  });
  // A deck short of its share (Seen names excluded) is topped up from the others.
  for (const order of orders) {
    for (const card of order) {
      if (picked.length >= target) break;
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      picked.push(card);
    }
  }

  const names = shuffle(picked, rand);
  const labels = decks.map((d) => d.title.replace(/ deck$/, ""));
  return {
    deckId: decks.map((d) => d.deckId).join("+"),
    title: `${labels.join(" × ")} deck`,
    names,
    version: versionOf(names),
  };
}
