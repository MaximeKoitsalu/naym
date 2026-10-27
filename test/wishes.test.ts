import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  createSession,
  dealSession,
  getReveal,
  getStateView,
  putSwipes,
  startB,
} from "@/lib/session";
import { addWish, getShortlistView, getWishes, resolvePartner } from "@/lib/shortlist";
import { buildSessionDeck, wishCard } from "@/lib/decks";
import { cleanWish, MAX_WISH_LENGTH } from "@/lib/wishes";
import { POST as postWish } from "@/app/api/shortlist/wishes/route";

/*
  Wishes (#23): a typed name queued on the Shortlist, dealt into the next deck,
  landing on the Shortlist only through a match.
*/

beforeEach(() => {
  (globalThis as { __naymStore?: unknown }).__naymStore = undefined;
});

type Like = (id: string, i: number) => boolean;

async function swipeAll(token: string, liked: Like) {
  const deck = (await getStateView(token))!.deck;
  await putSwipes(token, deck.map((c, i) => ({ id: c.id, liked: liked(c.id, i) })));
}

async function bothFinish(creatorToken: string, aLikes: Like, bLikes: Like) {
  await swipeAll(creatorToken, aLikes);
  const invite = (await getStateView(creatorToken))!.inviteToken!;
  await startB(invite);
  await swipeAll(invite, bLikes);
  return invite;
}

async function couple(...args: Parameters<typeof createSession>) {
  const { creatorToken } = (await createSession(...args))!;
  const invite = await bothFinish(creatorToken, (_, i) => i < 3, (_, i) => i < 3);
  return {
    creatorToken,
    p1: (await getReveal(creatorToken))!.shortlistToken!,
    p2: (await getReveal(invite))!.shortlistToken!,
  };
}

const deal = async (...args: Parameters<typeof dealSession>) =>
  (await dealSession(...args)) as { creatorToken: string; size: number };

describe("cleanWish — the API boundary", () => {
  it("trims and collapses spaces", () => {
    expect(cleanWish("  Mirja   Lou ")).toBe("Mirja Lou");
  });
  it("allows letters of any script, hyphens and apostrophes", () => {
    for (const n of ["Anne-Sophie", "O'Neil", "D’Arcy", "Søren", "Zoë", "ユキ", "Αθηνά", "आरव"]) {
      expect(cleanWish(n)).toBe(n);
    }
  });
  it("rejects digits, symbols, markup, empties and over-long names", () => {
    for (const n of ["R2D2", "<b>", "a@b", "", "   ", "--", "'", 42, null, "x".repeat(MAX_WISH_LENGTH + 1)]) {
      expect(cleanWish(n)).toBeNull();
    }
  });
});

describe("the wish queue", () => {
  it("is shared by both partners, capped at 3, deduped case-insensitively", async () => {
    const { p1, p2 } = await couple("nordic-v1", 10);
    expect(await addWish(p1, "Mirja")).toEqual({ wishes: ["Mirja"] });
    expect(await addWish(p2, "mirja")).toEqual({ wishes: ["Mirja"] });
    await addWish(p2, "Ilse");
    await addWish(p1, "Saga");
    expect(await addWish(p2, "Tove")).toEqual({ full: true });
    expect(await getWishes((await resolvePartner(p1))!.shortlistId)).toEqual(["Mirja", "Ilse", "Saga"]);
  });

  it("an unknown token queues nothing", async () => {
    expect(await addWish("nope", "Mirja")).toBeNull();
  });

  it("POST /api/shortlist/wishes validates, queues, and answers 409 when full", async () => {
    const { p1 } = await couple("nordic-v1", 10);
    const post = (body: unknown) =>
      postWish(
        new NextRequest("http://localhost/api/shortlist/wishes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    expect((await post({ token: p1, name: "R2D2" })).status).toBe(400);
    expect((await post({ token: "nope", name: "Mirja" })).status).toBe(404);
    const ok = await post({ token: p1, name: "  Mirja " });
    expect(await ok.json()).toEqual({ wishes: ["Mirja"] });
    await post({ token: p1, name: "Ilse" });
    await post({ token: p1, name: "Tove" });
    expect((await post({ token: p1, name: "Una" })).status).toBe(409);
  });
});

describe("wishCard — curated lookup", () => {
  it("borrows a curated card, case-insensitively", () => {
    const saga = wishCard("sAGA");
    expect(saga.name).toBe("Saga");
    expect(saga.meaning).not.toBe("");
    expect(saga.wish).toBeUndefined();
  });
  it("an unknown name becomes an untagged wish card", () => {
    expect(wishCard("Mirja")).toEqual({
      id: "wish-mirja",
      name: "Mirja",
      say: "",
      origin: "",
      meaning: "",
      wish: true,
    });
  });
});

describe("wishes entering a dealt deck", () => {
  it("are shuffled in, count toward the size, and go into any gender deck", () => {
    const wishes = [wishCard("Mirja"), wishCard("Ilse")];
    const deck = buildSessionDeck(["nordic-v1"], 10, "boy", Math.random, new Set(), wishes)!;
    expect(deck.names).toHaveLength(10);
    expect(deck.names.filter((c) => c.wish).map((c) => c.name).sort()).toEqual(["Ilse", "Mirja"]);
    expect(deck.names.filter((c) => !c.wish).every((c) => c.gender === "boy")).toBe(true);
  });

  it("a borrowed curated card appears once, even when the curated pick would include it", () => {
    const saga = wishCard("Saga");
    const deck = buildSessionDeck(["nordic-v1"], 50, "unsure", Math.random, new Set(), [saga])!;
    expect(deck.names).toHaveLength(50);
    expect(deck.names.filter((c) => c.id === saga.id)).toHaveLength(1);
  });

  it("the next deal by either partner takes the queue, both swipe it, and only a match lands", async () => {
    const { creatorToken, p1, p2 } = await couple("nordic-v1", 50); // every nordic name Seen
    const saga = (await getStateView(creatorToken))!.deck.find((c) => c.name === "Saga")!;
    await addWish(p1, "Mirja");
    await addWish(p1, "Ilse");
    await addWish(p2, "saga");

    const dealt = await deal(p2, ["greek-v1"], 10, "boy");
    expect(dealt.size).toBe(10);
    expect(await getWishes((await resolvePartner(p1))!.shortlistId)).toEqual([]);
    const deck = (await getStateView(dealt.creatorToken))!.deck;
    // A Seen curated name comes back when wished, borrowing its card.
    expect(deck.find((c) => c.id === saga.id)).toEqual(saga);
    expect(deck.filter((c) => c.wish).map((c) => c.name).sort()).toEqual(["Ilse", "Mirja"]);

    // Both love Mirja; only one loves Ilse.
    const invite = await bothFinish(
      dealt.creatorToken,
      (id) => id === "wish-mirja" || id === "wish-ilse",
      (id) => id === "wish-mirja",
    );
    await getReveal(invite);
    const entries = (await getShortlistView(p1))!.entries;
    expect(entries.find((e) => e.id === "wish-mirja")).toMatchObject({ name: "Mirja", wish: true });
    expect(entries.find((e) => e.id === "wish-ilse")).toBeUndefined();
  });

  it("a dry deal keeps the queue; wishes count toward the minimum deck", async () => {
    const { p1 } = await couple("greek-v1", 20, "boy"); // 25 boys → 5 unseen
    await addWish(p1, "Mirja");
    expect(await dealSession(p1, ["greek-v1"], 10, "boy")).toEqual({ dry: 6 });
    expect(await getWishes((await resolvePartner(p1))!.shortlistId)).toEqual(["Mirja"]);
  });
});
