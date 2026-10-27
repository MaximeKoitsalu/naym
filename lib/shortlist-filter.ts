import type { DeckGender } from "./deck-manifest";
import type { ShortlistEntry } from "./types";

/*
  The Shortlist's girl/boy/both filter — client-safe (no store import).
  Unisex names, wishes and pre-tag entries carry no single gender, so every
  filter shows them. Filtering only hides; nothing is ever deleted.
*/
export type ShortlistFilter = "girl" | "boy" | "both";

/** The list opens on the expecting gender; "not sure yet" shows both. */
export const defaultFilter = (expecting: DeckGender): ShortlistFilter =>
  expecting === "unsure" ? "both" : expecting;

export const visibleEntries = (entries: ShortlistEntry[], filter: ShortlistFilter) =>
  entries.filter(
    (e) => filter === "both" || !e.gender || e.gender === "unisex" || e.gender === filter,
  );
