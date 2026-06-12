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
