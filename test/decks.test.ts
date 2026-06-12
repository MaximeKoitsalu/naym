import { beforeEach, describe, expect, it } from "vitest";
import { allDeckIds, getDeckEntry, DEFAULT_DECK_ID } from "@/lib/decks";
import { createSession, getStateView } from "@/lib/session";

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

  it("default deck id is a registered deck", () => {
    expect(getDeckEntry(DEFAULT_DECK_ID)).not.toBeNull();
  });
});
