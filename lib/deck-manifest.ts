/*
  Client-safe deck manifest for the origin picker — labels and sample names
  only, so the landing bundle never carries five full decks (the B-side
  first-load budget is sacred). Keep in sync with data/decks/*.json ids.
*/
export const DECK_MANIFEST = [
  { id: "nordic-v1", label: "nordic", sample: "Astrid · Leif · Saga" },
  { id: "greek-v1", label: "greek", sample: "Penelope · Theo · Daphne" },
  { id: "german-v1", label: "german", sample: "Greta · Otto · Marlene" },
  { id: "italian-v1", label: "italian", sample: "Giulia · Matteo · Aurora" },
  { id: "french-v1", label: "french", sample: "Juliette · Léo · Margaux" },
] as const;

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
