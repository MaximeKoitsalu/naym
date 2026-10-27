import { beforeEach, describe, expect, it } from "vitest";
import {
  allDeckIds,
  buildSessionDeck,
  getDeckEntry,
  DEFAULT_DECK_ID,
} from "@/lib/decks";
import {
  DECK_MANIFEST,
  DEFAULT_DECK_SIZE,
  MAX_DECK_SIZE,
  MIN_DECK_SIZE,
  poolSize,
} from "@/lib/deck-manifest";
import { POST as postSession } from "@/app/api/session/route";
import { NextRequest } from "next/server";
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
  it("a single origin at max size returns that deck verbatim, unshuffled", () => {
    const single = buildSessionDeck(["greek-v1"], MAX_DECK_SIZE)!;
    expect(single.deckId).toBe("greek-v1");
    expect(single.names).toEqual(getDeckEntry("greek-v1")!.names);
  });

  it("two origins blend to 50 cards, 25 from each, shuffled together", () => {
    const blend = buildSessionDeck(
      ["nordic-v1", "greek-v1"],
      MAX_DECK_SIZE,
      "unsure",
      seq(0.3, 0.7, 0.1, 0.9, 0.5),
    )!;
    expect(blend.names).toHaveLength(MAX_DECK_SIZE);
    const nordicIds = new Set(getDeckEntry("nordic-v1")!.names.map((n) => n.id));
    const fromNordic = blend.names.filter((n) => nordicIds.has(n.id)).length;
    expect(fromNordic).toBe(25);
    expect(blend.deckId).toBe("nordic-v1+greek-v1");
    expect(blend.title).toBe("nordic × greek deck");
    expect(new Set(blend.names.map((n) => n.id)).size).toBe(MAX_DECK_SIZE);
  });

  it("three origins split 17/17/16, earliest picks get the remainder", () => {
    const blend = buildSessionDeck(
      ["nordic-v1", "italian-v1", "french-v1"],
      MAX_DECK_SIZE,
      "unsure",
      seq(0.2, 0.8, 0.4, 0.6),
    )!;
    expect(blend.names).toHaveLength(MAX_DECK_SIZE);
    const count = (deckId: string) => {
      const ids = new Set(getDeckEntry(deckId)!.names.map((n) => n.id));
      return blend.names.filter((n) => ids.has(n.id)).length;
    };
    expect(count("nordic-v1")).toBe(17);
    expect(count("italian-v1")).toBe(17);
    expect(count("french-v1")).toBe(16);
  });

  it("all five origins blend evenly to 50", () => {
    const blend = buildSessionDeck(allDeckIds(), MAX_DECK_SIZE, "unsure", seq(0.5, 0.25, 0.75))!;
    expect(blend.names).toHaveLength(MAX_DECK_SIZE);
  });

  it("duplicate picks collapse; unknown ids and empty picks reject", () => {
    const dup = buildSessionDeck(["nordic-v1", "nordic-v1"])!;
    expect(dup.deckId).toBe("nordic-v1"); // de-duped to a single origin
    expect(buildSessionDeck(["nordic-v1", "klingon-v1"])).toBeNull();
    expect(buildSessionDeck([])).toBeNull();
  });
});

describe("deck size", () => {
  it("defaults to DEFAULT_DECK_SIZE when omitted", () => {
    const deck = buildSessionDeck(["greek-v1"])!;
    expect(deck.names).toHaveLength(DEFAULT_DECK_SIZE);
  });

  it("a single origin below max size is a shuffled, deduped subset of that deck", () => {
    const deck = buildSessionDeck(["greek-v1"], 20)!;
    expect(deck.names).toHaveLength(20);
    const greekIds = new Set(getDeckEntry("greek-v1")!.names.map((n) => n.id));
    expect(deck.names.every((n) => greekIds.has(n.id))).toBe(true);
    expect(new Set(deck.names.map((n) => n.id)).size).toBe(20);
  });

  it("a blend at a non-max size still splits evenly", () => {
    const deck = buildSessionDeck(["nordic-v1", "greek-v1"], 20, "unsure", seq(0.3, 0.7, 0.1, 0.9, 0.5))!;
    expect(deck.names).toHaveLength(20);
    const nordicIds = new Set(getDeckEntry("nordic-v1")!.names.map((n) => n.id));
    expect(deck.names.filter((n) => nordicIds.has(n.id))).toHaveLength(10);
  });

  it("clamps below the min up to MIN_DECK_SIZE", () => {
    const deck = buildSessionDeck(["greek-v1"], 1)!;
    expect(deck.names).toHaveLength(MIN_DECK_SIZE);
  });

  it("clamps above the max down to MAX_DECK_SIZE, verbatim", () => {
    const deck = buildSessionDeck(["greek-v1"], 999)!;
    expect(deck.names).toEqual(getDeckEntry("greek-v1")!.names);
  });

  it("clamps a non-finite/garbage size to the default", () => {
    expect(buildSessionDeck(["greek-v1"], NaN)!.names).toHaveLength(DEFAULT_DECK_SIZE);
  });
});

describe("session deck selection", () => {
  it("defaults to the nordic deck", async () => {
    const s = (await createSession())!;
    const view = (await getStateView(s.creatorToken))!;
    expect(view.deckTitle).toBe("nordic deck");
  });

  it("pins the chosen deck for both partners", async () => {
    const s = (await createSession("greek-v1", MAX_DECK_SIZE))!;
    const view = (await getStateView(s.creatorToken))!;
    expect(view.deckTitle).toBe("greek deck");
    expect(view.deck.map((c) => c.id)).toContain("penelope");
    expect(view.deck).toHaveLength(MAX_DECK_SIZE);
  });

  it("rejects unknown deck ids", async () => {
    expect(await createSession("klingon-v1")).toBeNull();
  });

  it("pins a blended deck for both partners with a blend title", async () => {
    const s = (await createSession(["german-v1", "french-v1"], MAX_DECK_SIZE))!;
    const view = (await getStateView(s.creatorToken))!;
    expect(view.deckTitle).toBe("german × french deck");
    expect(view.deck).toHaveLength(MAX_DECK_SIZE);
  });

  it("default deck id is a registered deck", () => {
    expect(getDeckEntry(DEFAULT_DECK_ID)).not.toBeNull();
  });

  it("defaults to DEFAULT_DECK_SIZE when size is omitted", async () => {
    const s = (await createSession())!;
    const view = (await getStateView(s.creatorToken))!;
    expect(view.deck).toHaveLength(DEFAULT_DECK_SIZE);
  });

  it("pins a custom size chosen at creation", async () => {
    const s = (await createSession("greek-v1", 35))!;
    const view = (await getStateView(s.creatorToken))!;
    expect(view.deck).toHaveLength(35);
  });
});

describe("gender-aware decks", () => {
  const count = (names: { gender?: string }[], g: string) =>
    names.filter((n) => n.gender === g).length;

  it("every card carries a valid gender tag, including the settled exceptions", () => {
    const byId = new Map(
      allDeckIds().flatMap((id) => getDeckEntry(id)!.names.map((n) => [n.id, n.gender])),
    );
    for (const g of byId.values()) expect(["girl", "boy", "unisex"]).toContain(g);
    for (const id of ["aris", "jonas", "luca", "nico", "pierre", "hjalmar"]) {
      expect(byId.get(id), id).toBe("boy");
    }
    for (const id of ["elektra", "noemi", "leni", "romy"]) expect(byId.get(id), id).toBe("girl");
    expect(byId.get("camille")).toBe("unisex");
  });

  it("the manifest's counts and samples match the deck files", () => {
    for (const m of DECK_MANIFEST) {
      const names = getDeckEntry(m.id)!.names;
      expect(m.count, m.id).toEqual({
        girl: count(names, "girl"),
        boy: count(names, "boy"),
        unisex: count(names, "unisex"),
      });
      for (const g of ["girl", "boy"] as const) {
        for (const sample of m.sample[g].split(" · ")) {
          const card = names.find((n) => n.name === sample);
          expect(card?.gender, `${m.id}/${sample}`).toMatch(new RegExp(`${g}|unisex`));
        }
      }
    }
  });

  it("a girl deck holds only girl and unisex cards", () => {
    const deck = buildSessionDeck(["french-v1"], 20, "girl")!;
    expect(deck.names).toHaveLength(20);
    expect(count(deck.names, "boy")).toBe(0);
  });

  it("unisex counts for both: the full french girl and boy pools include Camille", () => {
    for (const g of ["girl", "boy"] as const) {
      const deck = buildSessionDeck(["french-v1"], 999, g)!;
      expect(deck.names.map((n) => n.id), g).toContain("camille");
      expect(deck.names).toHaveLength(poolSize(["french-v1"], g));
    }
  });

  it("not sure yet deals an even girl/boy split, in a blend too", () => {
    const single = buildSessionDeck(["greek-v1"], 20, "unsure")!;
    expect([count(single.names, "girl"), count(single.names, "boy")]).toEqual([10, 10]);
    const blend = buildSessionDeck(
      ["nordic-v1", "italian-v1", "french-v1"],
      MAX_DECK_SIZE,
      "unsure",
    )!;
    expect(blend.names).toHaveLength(MAX_DECK_SIZE);
    expect(count(blend.names, "girl")).toBe(25);
    expect(count(blend.names, "boy")).toBe(25);
  });

  it("not sure yet fills the short side from unisex", () => {
    // french: 24 girls, 25 boys, Camille. rand 0.9 → girls deal first, so at 49
    // the girl side runs dry on its 25th turn and takes Camille.
    const deck = buildSessionDeck(["french-v1"], 49, "unsure", () => 0.9)!;
    expect(count(deck.names, "girl")).toBe(24);
    expect(count(deck.names, "unisex")).toBe(1);
    expect(count(deck.names, "boy")).toBe(24);
  });

  it("pool size: one region holds 25 per gender, so 35+ needs another region", () => {
    expect(poolSize(["nordic-v1"], "girl")).toBe(25);
    expect(poolSize(["french-v1"], "boy")).toBe(26);
    expect(poolSize(["nordic-v1"], "unsure")).toBe(50);
    expect(poolSize(["nordic-v1", "greek-v1"], "girl")).toBe(50);
    // The server clamp deals what the pool holds, never a padded deck.
    expect(buildSessionDeck(["nordic-v1"], MAX_DECK_SIZE, "boy")!.names).toHaveLength(25);
  });

  it("POST /api/session validates the gender", async () => {
    const post = (body: unknown) =>
      postSession(
        new NextRequest("http://localhost/api/session", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      );
    expect((await post({ deckIds: ["greek-v1"], gender: "cat" })).status).toBe(400);
    const ok = await post({ deckIds: ["greek-v1"], size: 20, gender: "girl" });
    const view = (await getStateView((await ok.json()).creatorToken))!;
    expect(count(view.deck, "boy")).toBe(0);
  });

  it("createSession pins the gender-filtered deck", async () => {
    const s = (await createSession("greek-v1", 20, "boy"))!;
    const deck = (await getStateView(s.creatorToken))!.deck;
    expect(deck).toHaveLength(20);
    expect(count(deck, "girl")).toBe(0);
  });
});
