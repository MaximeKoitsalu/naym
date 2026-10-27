/*
  Wish limits and validation — client-safe (no store import), so the slip
  hints with the same numbers the API enforces.
*/
export const MAX_WISHES = 3;
export const MAX_WISH_LENGTH = 30;

/**
 * Validates a typed name at the API boundary: trimmed, inner spaces collapsed,
 * at most MAX_WISH_LENGTH characters, letters of any script (with their combining
 * marks), spaces, hyphens and apostrophes only. Null when it doesn't pass.
 */
export function cleanWish(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (name.length > MAX_WISH_LENGTH) return null;
  return /^[\p{L}\p{M} '’-]+$/u.test(name) && /\p{L}/u.test(name) ? name : null;
}
