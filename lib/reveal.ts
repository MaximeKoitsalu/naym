import type { NameCard, Swipe } from "./types";

/*
  Pure reveal math. Lives server-side ONLY — the blindness contract requires
  that raw per-role swipe arrays never serialize off the server.
*/

export function likedIds(swipes: Swipe[]): Set<string> {
  return new Set(swipes.filter((s) => s.liked).map((s) => s.id));
}

/** Mutual likes, in deck order. */
export function intersection(deck: NameCard[], a: Swipe[], b: Swipe[]): NameCard[] {
  const la = likedIds(a);
  const lb = likedIds(b);
  return deck.filter((c) => la.has(c.id) && lb.has(c.id));
}

/** Solo likes of either partner, in deck order — the round-2 union. */
export function union(deck: NameCard[], a: Swipe[], b: Swipe[]): NameCard[] {
  const la = likedIds(a);
  const lb = likedIds(b);
  return deck.filter((c) => la.has(c.id) || lb.has(c.id));
}

/**
 * Round-2 deck: the unattributed union PLUS decoys sampled from the names
 * neither partner liked, shuffled. The decoys are what make set subtraction
 * useless — "not mine" might be the partner's like or a decoy, so blindness
 * survives round 2 mathematically, not just cosmetically.
 *
 * `rand` is injectable for deterministic tests.
 */
export function buildRound2Deck(
  deck: NameCard[],
  a: Swipe[],
  b: Swipe[],
  rand: () => number = Math.random,
): NameCard[] | null {
  const u = union(deck, a, b);
  if (u.length === 0) return null; // empty union → skip round 2, warm ending
  const unionIds = new Set(u.map((c) => c.id));
  const remainder = deck.filter((c) => !unionIds.has(c.id));
  const decoyCount = Math.min(remainder.length, Math.max(5, Math.round(u.length * 0.5)));
  const decoys = shuffle(remainder, rand).slice(0, decoyCount);
  return shuffle([...u, ...decoys], rand);
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Monotonic swipe-array merge guard: an incoming full-array PUT may never
 * shrink stored progress (an empty webview localStorage must not wipe real
 * progress), and every id must belong to the pinned deck.
 * Returns the array to store, or null when the write must be rejected.
 */
export function guardSwipes(
  deck: NameCard[],
  stored: Swipe[],
  incoming: Swipe[],
): Swipe[] | null {
  if (incoming.length < stored.length) return null;
  if (incoming.length > deck.length) return null;
  const deckIds = new Set(deck.map((c) => c.id));
  const seen = new Set<string>();
  for (const s of incoming) {
    if (!deckIds.has(s.id) || seen.has(s.id) || typeof s.liked !== "boolean") return null;
    seen.add(s.id);
  }
  return incoming;
}

/** Completion is DERIVED — a dropped final request can't fake a dropout. */
export function isComplete(deck: NameCard[], swipes: Swipe[]): boolean {
  return swipes.length === deck.length;
}
