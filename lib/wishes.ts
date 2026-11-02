/*
  Wish limits and validation — client-safe (no store import), so the slip
  hints with the same numbers the API enforces.
*/
import type { DeckGender } from "./deck-manifest";

/** How many wishes can wait on a Shortlist; a deck takes at most half its size of them. */
export const MAX_WISHES = 25;
export const MAX_WISH_LENGTH = 30;

/** "unisex" is the code name for "either". A name we already know keeps its curated tag. */
export const WISH_GENDERS = ["girl", "boy", "unisex"] as const;
export type WishGender = (typeof WISH_GENDERS)[number];
export type Wish = { name: string; gender: WishGender };

/** At most half a deck is the couple's own names, so every deck stays mostly discovery. */
export const wishSlots = (deckSize: number) => Math.floor(deckSize / 2);

/** A girl or boy wish only joins decks it fits; "either" and "not sure yet" decks take any. */
export const fitsDeck = (w: Wish, deck: DeckGender) =>
  w.gender === "unisex" || deck === "unsure" || w.gender === deck;

/** The gender a new wish starts on: who the couple is naming, or "either" when not sure yet. */
export const defaultWishGender = (expecting: DeckGender): WishGender =>
  expecting === "unsure" ? "unisex" : expecting;

/**
 * Validates a typed name at the API boundary: trimmed, inner spaces collapsed,
 * at most MAX_WISH_LENGTH characters, letters of any script (with their combining
 * marks), spaces, hyphens and apostrophes only. Curly apostrophes become straight
 * and each space- or hyphen-separated part gets a capital first letter; the rest
 * keeps the typed casing. Null when it doesn't pass.
 */
export function cleanWish(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC").trim().replace(/\s+/g, " ").replace(/’/g, "'");
  if (name.length > MAX_WISH_LENGTH) return null;
  if (!/^[\p{L}\p{M} '-]+$/u.test(name) || !/\p{L}/u.test(name)) return null;
  return name.replace(/(^|[ -])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase());
}

/** Wishes and curated names match case-insensitively ("saga" is Saga). */
export const sameName = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/**
 * A wish at the API boundary: `{ name, gender }`, or a bare name from an older
 * client (taken as "either"). Null when the name or the gender doesn't pass.
 */
export function parseWish(raw: unknown): Wish | null {
  if (typeof raw === "string") {
    const name = cleanWish(raw);
    return name ? { name, gender: "unisex" } : null;
  }
  const o = raw as { name?: unknown; gender?: unknown } | null;
  const name = cleanWish(o?.name);
  const gender = WISH_GENDERS.find((g) => g === (o?.gender ?? "unisex"));
  return name && gender ? { name, gender } : null;
}
