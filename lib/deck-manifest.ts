/*
  Client-safe deck manifest for the origin picker — labels, per-gender sample
  names and per-gender card counts only, so the landing bundle never carries
  five full decks (the B-side first-load budget is sacred). Keep in sync with
  data/decks/*.json (test/decks.test.ts checks it).
*/
export const DECK_MANIFEST = [
  {
    id: "nordic-v1",
    label: "nordic",
    sample: { girl: "Astrid · Saga · Freja", boy: "Leif · Axel · Viggo", unsure: "Astrid · Leif · Saga" },
    count: { girl: 25, boy: 25, unisex: 0 },
  },
  {
    id: "greek-v1",
    label: "greek",
    sample: { girl: "Penelope · Daphne · Thalia", boy: "Theo · Orion · Leonidas", unsure: "Penelope · Theo · Daphne" },
    count: { girl: 25, boy: 25, unisex: 0 },
  },
  {
    id: "german-v1",
    label: "german",
    sample: { girl: "Greta · Marlene · Frieda", boy: "Otto · Emil · Moritz", unsure: "Greta · Otto · Marlene" },
    count: { girl: 25, boy: 25, unisex: 0 },
  },
  {
    id: "italian-v1",
    label: "italian",
    sample: { girl: "Giulia · Aurora · Bianca", boy: "Matteo · Luca · Dante", unsure: "Giulia · Matteo · Aurora" },
    count: { girl: 25, boy: 25, unisex: 0 },
  },
  {
    id: "french-v1",
    label: "french",
    sample: { girl: "Juliette · Margaux · Colette", boy: "Léo · Gaspard · Jules", unsure: "Juliette · Léo · Margaux" },
    count: { girl: 24, boy: 25, unisex: 1 },
  },
] as const;

/** Who the deck is for. "unsure" is the picker's "not sure yet". */
export const DECK_GENDERS = ["girl", "boy", "unsure"] as const;
export type DeckGender = (typeof DECK_GENDERS)[number];

/** Cards available to a deck of `gender` across `ids` — unisex counts for every gender. */
export function poolSize(ids: readonly string[], gender: DeckGender): number {
  return DECK_MANIFEST.filter((d) => ids.includes(d.id)).reduce(
    (sum, { count: c }) =>
      sum + c.unisex + (gender === "unsure" ? c.girl + c.boy : c[gender]),
    0,
  );
}

export type DeckChoice = (typeof DECK_MANIFEST)[number]["id"];

/*
  Deck size — how many names go into a session's pinned deck. Presets only
  in the UI; min/max are the server-side clamp (buildSessionDeck) for any
  request that didn't come through a preset button.
*/
export const DECK_SIZE_PRESETS = [10, 20, 35, 50] as const;
export const DEFAULT_DECK_SIZE = 20;
export const MIN_DECK_SIZE = 10;
export const MAX_DECK_SIZE = 50;

export type DeckSize = (typeof DECK_SIZE_PRESETS)[number];
