/*
  Wish limits and validation — client-safe (no store import), so the slip
  hints with the same numbers the API enforces.
*/
export const MAX_WISHES = 3;
export const MAX_WISH_LENGTH = 30;

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
