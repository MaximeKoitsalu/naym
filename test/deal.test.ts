import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  createSession,
  dealSession,
  getDealView,
  getReveal,
  getStateView,
  putSwipes,
  resolveToken,
  startB,
} from "@/lib/session";
import { getSeen, getShortlistView } from "@/lib/shortlist";
import { buildSessionDeck, getDeckEntry, unseenCounts } from "@/lib/decks";
import { deckGenderFor, MAX_DECK_SIZE, poolSize } from "@/lib/deck-manifest";
import { POST as postSession } from "@/app/api/session/route";

/*
  Dealing a new deck from the Shortlist (#21): same couple, dealer is A,
  Seen names (in sessions BOTH partners completed) never come back.
*/

beforeEach(() => {
  (globalThis as { __naymStore?: unknown }).__naymStore = undefined;
});

type Like = (id: string, i: number) => boolean;

async function swipeAll(token: string, liked: Like) {
  const deck = (await getStateView(token))!.deck;
  await putSwipes(token, deck.map((c, i) => ({ id: c.id, liked: liked(c.id, i) })));
}

/** A finishes; returns B's invite token. */
async function aFinishes(creatorToken: string, liked: Like = (_, i) => i < 3) {
  await swipeAll(creatorToken, liked);
  return (await getStateView(creatorToken))!.inviteToken!;
}

async function bothFinish(creatorToken: string, aLikes?: Like, bLikes: Like = (_, i) => i < 3) {
  const invite = await aFinishes(creatorToken, aLikes);
  await startB(invite);
  await swipeAll(invite, bLikes);
  return invite;
}

/** A first session completed by both → each Partner's Shortlist token. */
async function couple(...args: Parameters<typeof createSession>) {
  const { creatorToken } = (await createSession(...args))!;
  const invite = await bothFinish(creatorToken);
  const p1 = (await getReveal(creatorToken))!.shortlistToken!;
  const p2 = (await getReveal(invite))!.shortlistToken!;
  return { creatorToken, invite, p1, p2 };
}

const deckIds = async (token: string) => (await getStateView(token))!.deck.map((c) => c.id);

describe("dealing from the Shortlist", () => {
  it("attaches to the same Shortlist; the dealer is A, whichever Partner deals", async () => {
    const { creatorToken, p1, p2 } = await couple("greek-v1", 10);
    const first = (await resolveToken(creatorToken))!.meta.shortlist!;
    const dealt = (await dealSession(p2, ["nordic-v1"], 20))!;
    expect("creatorToken" in dealt && dealt.size).toBe(20);
    const { meta, role } = (await resolveToken((dealt as { creatorToken: string }).creatorToken))!;
    expect(role).toBe("A");
    expect(meta.shortlist).toEqual({ id: first.id, A: 2, B: 1 });

    // B's matches land on the SAME Shortlist, under the right Partners.
    const invite = await bothFinish((dealt as { creatorToken: string }).creatorToken, () => true, () => true);
    expect((await getReveal(invite))!.shortlistToken).toBe(p1);
    expect((await getShortlistView(p1))!.entries.length).toBeGreaterThan(20);
  });

  it("an unknown Shortlist token deals nothing", async () => {
    expect(await dealSession("nope", ["nordic-v1"], 20)).toBeNull();
  });

  it("excludes every Seen name", async () => {
    const { creatorToken, p1 } = await couple("nordic-v1", 20);
    const seen = await deckIds(creatorToken);
    const dealt = (await dealSession(p1, ["nordic-v1"], 50)) as { creatorToken: string; size: number };
    expect(dealt.size).toBe(30);
    const fresh = await deckIds(dealt.creatorToken);
    expect(fresh.filter((id) => seen.includes(id))).toEqual([]);
  });

  it("Seen does not depend on swipe direction", async () => {
    const patterns: [Like, Like][] = [
      [() => true, () => true],
      [() => false, () => false],
      [() => true, () => false],
      [(_, i) => i % 2 === 0, (_, i) => i % 3 === 0],
    ];
    for (const [aLikes, bLikes] of patterns) {
      (globalThis as { __naymStore?: unknown }).__naymStore = undefined;
      const { creatorToken } = (await createSession("nordic-v1", 20))!;
      await bothFinish(creatorToken, aLikes, bLikes);
      const { shortlist } = (await resolveToken(creatorToken))!.meta;
      expect([...(await getSeen(shortlist!.id))].sort()).toEqual((await deckIds(creatorToken)).sort());
    }
  });

  it("names in an abandoned session go back to the pool", async () => {
    const { p1 } = await couple("greek-v1", 10);
    const abandoned = (await dealSession(p1, ["nordic-v1"], MAX_DECK_SIZE)) as { creatorToken: string };
    await aFinishes(abandoned.creatorToken); // B never finishes
    const again = (await dealSession(p1, ["nordic-v1"], MAX_DECK_SIZE)) as { size: number };
    expect(again.size).toBe(MAX_DECK_SIZE);
  });

  it("10+ unseen left: deals a smaller deck; under 10: dry, nothing created", async () => {
    const { p1 } = await couple("nordic-v1", 10, "girl"); // 25 girls → 15 unseen
    const smaller = (await dealSession(p1, ["nordic-v1"], 20, "girl")) as { creatorToken: string; size: number };
    expect(smaller.size).toBe(15);
    await bothFinish(smaller.creatorToken);
    expect(await dealSession(p1, ["nordic-v1"], 20, "girl")).toEqual({ dry: 0 });

    const other = await couple("greek-v1", 20, "boy"); // 25 boys → 5 unseen
    expect(await dealSession(other.p1, ["greek-v1"], 10, "boy")).toEqual({ dry: 5 });
    // Adding a region refills with fresh names — never with Seen ones.
    const wider = (await dealSession(other.p1, ["greek-v1", "nordic-v1"], 20, "boy")) as { size: number };
    expect(wider.size).toBe(20);
  });

  it("POST /api/session deals from a Shortlist and answers 409 when dry", async () => {
    const { p1 } = await couple("greek-v1", 20, "boy");
    const post = (body: unknown) =>
      postSession(new NextRequest("http://localhost/api/session", { method: "POST", body: JSON.stringify(body) }));
    const dry = await post({ deckIds: ["greek-v1"], size: 10, gender: "boy", shortlistToken: p1 });
    expect(dry.status).toBe(409);
    expect(await dry.json()).toMatchObject({ left: 5 });
    const ok = await post({ deckIds: ["nordic-v1"], size: 20, gender: "boy", shortlistToken: p1 });
    expect(await ok.json()).toMatchObject({ size: 20 });
    expect((await post({ deckIds: ["nordic-v1"], shortlistToken: "nope" })).status).toBe(400);
  });
});

describe("the other Partner's view of a dealt deck", () => {
  it("shows once the dealer finishes; B binds on the Start tap, never on GET", async () => {
    const { p1, p2 } = await couple("greek-v1", 10);
    const dealt = (await dealSession(p1, ["nordic-v1"], 20)) as { creatorToken: string };

    // Dealer still swiping: the other Partner gets no link yet.
    expect(await getDealView(p2)).toEqual({ mine: false, size: 20, href: null, canDeal: false });
    expect(await getDealView(p1)).toEqual({ mine: true, size: 20, href: `/s/${dealt.creatorToken}`, canDeal: true });

    const invite = await aFinishes(dealt.creatorToken);
    const view = (await getDealView(p2))!;
    expect(view).toEqual({ mine: false, size: 20, href: `/s/${invite}`, canDeal: false });
    expect(JSON.stringify(view)).not.toContain(dealt.creatorToken);

    await getStateView(invite); // a prefetcher's GET
    expect((await resolveToken(invite))!.meta.bStartedAt).toBeNull();
    await startB(invite);
    expect((await resolveToken(invite))!.meta.bStartedAt).not.toBeNull();

    await swipeAll(invite, () => false);
    expect(await getDealView(p1)).toBeNull();
    expect(await getDealView(p2)).toBeNull();
  });
});

describe("one live deck per Shortlist", () => {
  it("nobody can deal over a deck the other Partner has started", async () => {
    const { p1, p2 } = await couple("greek-v1", 10);
    const dealt = (await dealSession(p1, ["nordic-v1"], 20)) as { creatorToken: string };
    // The other Partner can't replace it, even before it reaches them.
    expect(await dealSession(p2, ["italian-v1"], 20)).toEqual({ busy: true });

    const invite = await aFinishes(dealt.creatorToken);
    await startB(invite);
    expect(await dealSession(p1, ["italian-v1"], 20)).toEqual({ busy: true });
    expect(await dealSession(p2, ["italian-v1"], 20)).toEqual({ busy: true });
    expect((await getDealView(p1))!.canDeal).toBe(false);
    expect((await getDealView(p2))!.href).toBe(`/s/${invite}`); // their link never disappears

    await swipeAll(invite, () => false); // finished → dealing reopens for both
    expect(await dealSession(p2, ["italian-v1"], 20)).toMatchObject({ size: 20 });
  });

  it("the dealer may replace their own deck before the other Partner starts", async () => {
    const { p1 } = await couple("greek-v1", 10);
    const first = (await dealSession(p1, ["nordic-v1"], 20)) as { creatorToken: string };
    await aFinishes(first.creatorToken);
    const second = (await dealSession(p1, ["italian-v1"], 20)) as { creatorToken: string };
    expect((await getDealView(p1))!.href).toBe(`/s/${second.creatorToken}`);
  });

  it("POST /api/session answers 409 on a busy Shortlist", async () => {
    const { p1, p2 } = await couple("greek-v1", 10);
    await dealSession(p1, ["nordic-v1"], 20);
    const res = await postSession(
      new NextRequest("http://localhost/api/session", {
        method: "POST",
        body: JSON.stringify({ deckIds: ["italian-v1"], size: 20, shortlistToken: p2 }),
      }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).not.toHaveProperty("left");
  });
});

describe("the builder's unseen pool", () => {
  it("counts only unseen names, so unfillable sizes are disabled up front", async () => {
    const { creatorToken } = await couple("nordic-v1", 20, "girl");
    const { shortlist } = (await resolveToken(creatorToken))!.meta;
    const unseen = unseenCounts(await getSeen(shortlist!.id));
    expect(unseen["nordic-v1"]).toEqual({ girl: 5, boy: 25, unisex: 0 });
    expect(poolSize(["nordic-v1"], "girl", unseen)).toBe(5);
    expect(poolSize(["nordic-v1", "greek-v1"], "girl", unseen)).toBe(30);
    expect(poolSize(["nordic-v1"], "girl")).toBe(25); // no override → the manifest
  });
});

describe("blend top-up", () => {
  it("a region short of its share is topped up from the others", () => {
    const nordic = getDeckEntry("nordic-v1")!.names.map((c) => c.id);
    const exclude = new Set(nordic.slice(5)); // nordic has 5 left
    const deck = buildSessionDeck(["nordic-v1", "greek-v1"], 50, "unsure", Math.random, exclude)!;
    expect(deck.names).toHaveLength(50);
    expect(deck.names.filter((c) => exclude.has(c.id))).toEqual([]);
  });
});

describe("gender default", () => {
  it("maps the Shortlist's expecting to the builder's gender", () => {
    expect(deckGenderFor("girl")).toBe("girl");
    expect(deckGenderFor("boy")).toBe("boy");
    expect(deckGenderFor("not sure yet")).toBe("unsure");
  });
});
