import { describe, expect, it } from "vitest";
import {
  buildRound2Deck,
  guardSwipes,
  intersection,
  isComplete,
  likedIds,
  union,
} from "@/lib/reveal";
import type { NameCard, Swipe } from "@/lib/types";

const deck: NameCard[] = ["astrid", "nils", "liv", "erik", "saga", "leif"].map(
  (id) => ({ id, name: id, say: id, origin: "test", meaning: id }),
);

const swipe = (id: string, liked: boolean): Swipe => ({ id, liked });
const all = (liked: (id: string) => boolean): Swipe[] =>
  deck.map((c) => swipe(c.id, liked(c.id)));

// Deterministic "random" for shuffle-bearing tests.
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe("intersection — the blindness boundary's math", () => {
  it("returns mutual likes only, in deck order", () => {
    const a = all((id) => ["astrid", "liv", "erik"].includes(id));
    const b = all((id) => ["liv", "erik", "leif"].includes(id));
    expect(intersection(deck, a, b).map((c) => c.id)).toEqual(["liv", "erik"]);
  });
  it("zero matches when tastes are disjoint", () => {
    const a = all((id) => id === "astrid");
    const b = all((id) => id === "leif");
    expect(intersection(deck, a, b)).toEqual([]);
  });
});

describe("round-2 deck — decoy padding defeats set subtraction", () => {
  it("returns null on an empty union (warm ending, no round 2)", () => {
    const none = all(() => false);
    expect(buildRound2Deck(deck, none, none)).toBeNull();
  });
  it("contains every union name plus at least decoys from the unliked remainder", () => {
    const a = all((id) => id === "astrid");
    const b = all((id) => id === "nils");
    const r2 = buildRound2Deck(deck, a, b, seq(0.1, 0.5, 0.9, 0.3, 0.7))!;
    const ids = r2.map((c) => c.id);
    expect(ids).toContain("astrid");
    expect(ids).toContain("nils");
    // Decoys: at least min(remainder, max(5, 50% of union)) names neither liked.
    const decoys = ids.filter((id) => !["astrid", "nils"].includes(id));
    expect(decoys.length).toBeGreaterThanOrEqual(4); // remainder has 4
    // The subtraction attack: union \ my likes must NOT equal partner's likes.
    const aLikes = likedIds(a);
    const recovered = ids.filter((id) => !aLikes.has(id));
    expect(recovered).not.toEqual(["nils"]);
  });
  it("never duplicates names", () => {
    const a = all((id) => ["astrid", "liv"].includes(id));
    const b = all((id) => ["liv", "erik"].includes(id));
    const r2 = buildRound2Deck(deck, a, b, seq(0.2, 0.8, 0.4))!;
    expect(new Set(r2.map((c) => c.id)).size).toBe(r2.length);
  });
});

describe("monotonic guard — an empty webview can never wipe progress", () => {
  const stored = [swipe("astrid", true), swipe("nils", false)];
  it("rejects shorter arrays (the destructive empty PUT)", () => {
    expect(guardSwipes(deck, stored, [])).toBeNull();
    expect(guardSwipes(deck, stored, [swipe("astrid", true)])).toBeNull();
  });
  it("accepts equal-length replays (idempotent heal)", () => {
    expect(guardSwipes(deck, stored, stored)).toEqual(stored);
  });
  it("accepts forward progress", () => {
    const next = [...stored, swipe("liv", true)];
    expect(guardSwipes(deck, stored, next)).toEqual(next);
  });
  it("rejects unknown name ids — swipes are keyed to the pinned deck", () => {
    expect(guardSwipes(deck, [], [swipe("zelda", true)])).toBeNull();
  });
  it("rejects duplicate ids and overlong arrays", () => {
    expect(guardSwipes(deck, [], [swipe("astrid", true), swipe("astrid", false)])).toBeNull();
    const tooMany = [...all(() => true), swipe("astrid", true)];
    expect(guardSwipes(deck, [], tooMany)).toBeNull();
  });
  it("rejects non-boolean liked values", () => {
    expect(
      guardSwipes(deck, [], [{ id: "astrid", liked: "yes" as unknown as boolean }]),
    ).toBeNull();
  });
});

describe("derived completion — a dropped final request can't fake a dropout", () => {
  it("complete exactly when every deck card is swiped", () => {
    expect(isComplete(deck, all(() => true))).toBe(true);
    expect(isComplete(deck, all(() => true).slice(0, -1))).toBe(false);
    expect(isComplete(deck, [])).toBe(false);
  });
});

describe("union", () => {
  it("is unattributed solo likes of either partner, in deck order", () => {
    const a = all((id) => id === "saga");
    const b = all((id) => id === "astrid");
    expect(union(deck, a, b).map((c) => c.id)).toEqual(["astrid", "saga"]);
  });
});
