import { beforeEach, describe, expect, it } from "vitest";
import {
  allDeckIds,
  buildSessionDeck,
  getDeckEntry,
  DEFAULT_DECK_ID,
  SESSION_DECK_SIZE,
} from "@/lib/decks";
import { createSession, getStateView } from "@/lib/session";

// Deterministic "random" for shuffle-bearing tests.
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

beforeEach(() => {
  (globalThis as { __naymStore?: unknown }).__naymStore = undefined;
});

describe("deck registry", () => {
  it("ships five origin decks", () => {
    expect(allDeckIds().sort()).toEqual(
      ["french-v1", "german-v1", "greek-v1", "italian-v1", "nordic-v1"].sort(),
    );
  });

  it("every deck has exactly 50 well-formed names with unique ids", () => {
    for (const id of allDeckIds()) {
      const deck = getDeckEntry(id)!;
      expect(deck.names, deck.deckId).toHaveLength(50);
      expect(new Set(deck.names.map((n) => n.id)).size, deck.deckId).toBe(50);
      for (const n of deck.names) {
        expect(n.id, `${deck.deckId}/${n.name}`).toMatch(/^[a-z]+$/);
        expect(n.name.length, n.id).toBeGreaterThan(1);
        expect(n.say.length, n.id).toBeGreaterThan(1);
        expect(n.meaning.length, n.id).toBeGreaterThan(3);
        expect(n.origin.length, n.id).toBeGreaterThan(2);
      }
      expect(deck.version, deck.deckId).toMatch(/^[0-9a-f]{12}$/);
    }
  });

  it("deck versions are distinct per deck", () => {
    const versions = allDeckIds().map((id) => getDeckEntry(id)!.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("name ids are globally unique across ALL decks — blending depends on it", () => {
    const all = allDeckIds().flatMap((id) => getDeckEntry(id)!.names.map((n) => n.id));
    const dupes = all.filter((id, i) => all.indexOf(id) !== i);
    expect(dupes, `cross-deck id collisions: ${dupes.join(", ")}`).toEqual([]);
  });
});

describe("deck blending", () => {
  it("a single origin returns that deck verbatim", () => {
    const single = buildSessionDeck(["greek-v1"])!;
    expect(single.deckId).toBe("greek-v1");
    expect(single.names).toEqual(getDeckEntry("greek-v1")!.names);
  });

  it("two origins blend to 50 cards, 25 from each, shuffled together", () => {
    const blend = buildSessionDeck(["nordic-v1", "greek-v1"], seq(0.3, 0.7, 0.1, 0.9, 0.5))!;
    expect(blend.names).toHaveLength(SESSION_DECK_SIZE);
    const nordicIds = new Set(getDeckEntry("nordic-v1")!.names.map((n) => n.id));
    const fromNordic = blend.names.filter((n) => nordicIds.has(n.id)).length;
    expect(fromNordic).toBe(25);
    expect(blend.deckId).toBe("nordic-v1+greek-v1");
    expect(blend.title).toBe("nordic × greek deck");
    expect(new Set(blend.names.map((n) => n.id)).size).toBe(SESSION_DECK_SIZE);
  });

  it("three origins split 17/17/16, earliest picks get the remainder", () => {
    const blend = buildSessionDeck(
      ["nordic-v1", "italian-v1", "french-v1"],
      seq(0.2, 0.8, 0.4, 0.6),
    )!;
    expect(blend.names).toHaveLength(SESSION_DECK_SIZE);
    const count = (deckId: string) => {
      const ids = new Set(getDeckEntry(deckId)!.names.map((n) => n.id));
      return blend.names.filter((n) => ids.has(n.id)).length;
    };
    expect(count("nordic-v1")).toBe(17);
    expect(count("italian-v1")).toBe(17);
    expect(count("french-v1")).toBe(16);
  });

  it("all five origins blend evenly to 50", () => {
    const blend = buildSessionDeck(allDeckIds(), seq(0.5, 0.25, 0.75))!;
    expect(blend.names).toHaveLength(SESSION_DECK_SIZE);
  });

  it("duplicate picks collapse; unknown ids and empty picks reject", () => {
    const dup = buildSessionDeck(["nordic-v1", "nordic-v1"])!;
    expect(dup.deckId).toBe("nordic-v1"); // de-duped to a single origin
    expect(buildSessionDeck(["nordic-v1", "klingon-v1"])).toBeNull();
    expect(buildSessionDeck([])).toBeNull();
  });
});

describe("session deck selection", () => {
  it("defaults to the nordic deck", async () => {
    const s = (await createSession())!;
    const view = (await getStateView(s.creatorToken))!;
    expect(view.deckTitle).toBe("nordic deck");
  });

  it("pins the chosen deck for both partners", async () => {
    const s = (await createSession("greek-v1"))!;
    const view = (await getStateView(s.creatorToken))!;
    expect(view.deckTitle).toBe("greek deck");
    expect(view.deck.map((c) => c.id)).toContain("penelope");
    expect(view.deck).toHaveLength(50);
  });

  it("rejects unknown deck ids", async () => {
    expect(await createSession("klingon-v1")).toBeNull();
  });

  it("pins a blended deck for both partners with a blend title", async () => {
    const s = (await createSession(["german-v1", "french-v1"]))!;
    const view = (await getStateView(s.creatorToken))!;
    expect(view.deckTitle).toBe("german × french deck");
    expect(view.deck).toHaveLength(50);
  });

  it("default deck id is a registered deck", () => {
    expect(getDeckEntry(DEFAULT_DECK_ID)).not.toBeNull();
  });
});
