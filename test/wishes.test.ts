import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  createSession,
  dealSession,
  getDealView,
  getReveal,
  getStateView,
  putSwipes,
  startB,
} from "@/lib/session";
import { addWish, getShortlistView, getWishes, resolvePartner } from "@/lib/shortlist";
import { buildSessionDeck, wishCard } from "@/lib/decks";
import { cleanWish, MAX_WISHES, MAX_WISH_LENGTH, type Wish, type WishGender } from "@/lib/wishes";
import { getStore } from "@/lib/store";
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

const w = (name: string, gender: WishGender = "unisex"): Wish => ({ name, gender });
const queueNames = async (shortlistId: string) => (await getWishes(shortlistId)).map((x) => x.name);
/** n distinct letter-only names. */
const many = (n: number) => Array.from({ length: n }, (_, i) => `${String.fromCharCode(65 + (i % 26))}${"a".repeat(1 + Math.floor(i / 26))}lia`);

const deal = async (...args: Parameters<typeof dealSession>) =>
  (await dealSession(...args)) as { creatorToken: string; size: number };

describe("cleanWish — the API boundary", () => {
  it("trims and collapses spaces", () => {
    expect(cleanWish("  Mirja   Lou ")).toBe("Mirja Lou");
  });
  it("allows letters of any script, hyphens and apostrophes", () => {
    for (const n of ["Anne-Sophie", "O'Neil", "Søren", "Zoë", "ユキ", "Αθηνά", "आरव"]) {
      expect(cleanWish(n)).toBe(n);
    }
  });
  it("capitalises each part, keeping the rest of the typed casing", () => {
    expect(cleanWish("mirja")).toBe("Mirja");
    expect(cleanWish("anna-lena")).toBe("Anna-Lena");
    expect(cleanWish("mcKenzie rose")).toBe("McKenzie Rose");
    expect(cleanWish("élodie")).toBe("Élodie");
  });
  it("straightens curly apostrophes", () => {
    expect(cleanWish("D’Arcy")).toBe("D'Arcy");
  });
  it("rejects digits, symbols, markup, empties and over-long names", () => {
    for (const n of ["R2D2", "<b>", "a@b", "", "   ", "--", "'", 42, null, "x".repeat(MAX_WISH_LENGTH + 1)]) {
      expect(cleanWish(n)).toBeNull();
    }
  });
});

describe("the wish queue", () => {
  it("is shared by both partners, capped at MAX_WISHES, deduped case-insensitively", async () => {
    const { p1, p2 } = await couple("nordic-v1", 10);
    expect(await addWish(p1, w("Mirja", "girl"))).toEqual({ wishes: [w("Mirja", "girl")] });
    expect(await addWish(p2, w("mirja", "boy"))).toEqual({ wishes: [w("Mirja", "girl")] });
    for (const n of many(MAX_WISHES - 1)) await addWish(p2, w(n));
    expect(await addWish(p2, w("Tove"))).toEqual({ full: true });
    expect(await getWishes((await resolvePartner(p1))!.shortlistId)).toHaveLength(MAX_WISHES);
  });

  it("a name we already know keeps its curated tag; unknown names keep the pick", async () => {
    const { p1 } = await couple("nordic-v1", 10);
    await addWish(p1, w("saga", "boy")); // Saga is a girl in the nordic deck
    await addWish(p1, w("Mirja", "girl"));
    expect(await getWishes((await resolvePartner(p1))!.shortlistId)).toEqual([w("saga", "girl"), w("Mirja", "girl")]);
  });

  it("wishes queued before gender tags read back as 'either', or their curated tag", async () => {
    const { p1 } = await couple("nordic-v1", 10);
    const id = (await resolvePartner(p1))!.shortlistId;
    await getStore().set(`shortlist:${id}:wishes`, ["Mirja", "Saga"]);
    expect(await getWishes(id)).toEqual([w("Mirja", "unisex"), w("Saga", "girl")]);
  });

  it("O'Neil and O’Neil are the same wish; wish_slipped never names the partner", async () => {
    const { p1, p2 } = await couple("nordic-v1", 10);
    await addWish(p1, w(cleanWish("O'Neil")!));
    expect(await addWish(p2, w(cleanWish("o’neil")!))).toEqual({ wishes: [w("O'Neil")] });
    const slipped = (await getStore().range("events:log")).filter(
      (e) => (e as { event: string }).event === "wish_slipped",
    );
    expect(slipped).toHaveLength(1);
    expect(slipped[0]).toMatchObject({ session: null, role: null });
    expect(slipped[0]).not.toHaveProperty("partner");
  });

  it("an unknown token queues nothing", async () => {
    expect(await addWish("nope", w("Mirja"))).toBeNull();
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
    expect((await post({ token: p1, name: "Mirja", gender: "other" })).status).toBe(400);
    expect((await post({ token: "nope", name: "Mirja" })).status).toBe(404);
    const ok = await post({ token: p1, name: "  Mirja ", gender: "girl" });
    expect(await ok.json()).toEqual({ wishes: [w("Mirja", "girl")] });
    expect(await (await post({ token: p1, name: "Ilse" })).json()).toMatchObject({ wishes: [{}, w("Ilse")] }); // no gender → either
    for (const n of many(MAX_WISHES - 2)) await post({ token: p1, name: n });
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
  it("an unknown name becomes a wish card carrying the partner's pick", () => {
    expect(wishCard("Mirja", [], "girl")).toEqual({
      id: "wish-mirja",
      name: "Mirja",
      say: "",
      origin: "",
      meaning: "",
      gender: "girl",
      wish: true,
    });
  });
});

describe("wishes entering a dealt deck", () => {
  it("buildSessionDeck shuffles given wish cards in and counts them toward the size", () => {
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
    await addWish(p1, w("Mirja"));
    await addWish(p1, w("Ilse"));
    await addWish(p2, w("saga"));

    const dealt = await deal(p2, ["greek-v1"], 10, "unsure");
    expect(dealt.size).toBe(10);
    const id = (await resolvePartner(p1))!.shortlistId;
    // Still queued while the deck is live; the dealt event counts them.
    expect(await queueNames(id)).toEqual(["Mirja", "Ilse", "saga"]);
    expect((await getDealView(p1))!.wishes).toEqual(["Mirja", "Ilse", "saga"]);
    const created = (await getStore().range("events:log")).filter(
      (e) => (e as { event: string }).event === "session_created",
    );
    expect(created.at(-1)).toMatchObject({ wishes: 3 });
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
    // A finished deck takes its own wishes off the queue.
    expect(await getWishes(id)).toEqual([]);
    const entries = (await getShortlistView(p1))!.entries;
    expect(entries.find((e) => e.id === "wish-mirja")).toMatchObject({ name: "Mirja", wish: true });
    expect(entries.find((e) => e.id === "wish-ilse")).toBeUndefined();
  });

  it("a dry deal keeps the queue; wishes count toward the minimum deck", async () => {
    const { p1 } = await couple("greek-v1", 20, "boy"); // 25 boys → 5 unseen
    await addWish(p1, w("Mirja"));
    expect(await dealSession(p1, ["greek-v1"], 10, "boy")).toEqual({ dry: 6 });
    expect(await queueNames((await resolvePartner(p1))!.shortlistId)).toEqual(["Mirja"]);
  });

  it("a replaced deck hands its wishes to the next deal; a later slip survives completion", async () => {
    const { p1 } = await couple("nordic-v1", 10);
    const id = (await resolvePartner(p1))!.shortlistId;
    await addWish(p1, w("Mirja"));
    const first = await deal(p1, ["greek-v1"], 10);
    const replaced = await deal(p1, ["greek-v1"], 10); // B hasn't started, so the dealer may replace
    expect(replaced.creatorToken).not.toBe(first.creatorToken);
    const names = async (t: string) => (await getStateView(t))!.deck.map((c) => c.name);
    expect(await names(replaced.creatorToken)).toContain("Mirja");
    expect(await queueNames(id)).toEqual(["Mirja"]);

    await addWish(p1, w("Ilse")); // slipped while the deck is live — not in it
    expect(await names(replaced.creatorToken)).not.toContain("Ilse");
    await bothFinish(replaced.creatorToken, () => false, () => false);
    expect(await queueNames(id)).toEqual(["Ilse"]);
  });

  it("a deck takes only wishes that fit its gender, at most half its size; the rest wait", async () => {
    const { p1 } = await couple("nordic-v1", 10, "girl");
    const id = (await resolvePartner(p1))!.shortlistId;
    await addWish(p1, w("Bjarke", "boy"));
    for (const n of many(7)) await addWish(p1, w(n, "girl"));
    const dealt = await deal(p1, ["greek-v1"], 10, "girl");
    const inDeck = (await getStateView(dealt.creatorToken))!.deck.filter((c) => c.wish).map((c) => c.name);
    expect(inDeck).toEqual(expect.arrayContaining(many(5))); // the first 5 girl wishes, in queue order
    expect(inDeck).toHaveLength(5);
    expect(inDeck).not.toContain("Bjarke");
    await bothFinish(dealt.creatorToken, () => false, () => false);
    expect(await queueNames(id)).toEqual(["Bjarke", ...many(7).slice(5)]);
  });
});

describe("wishes typed in the deck builder", () => {
  const post = (body: unknown) =>
    import("@/app/api/session/route").then(({ POST }) =>
      POST(new NextRequest("http://localhost/api/session", { method: "POST", body: JSON.stringify(body) })),
    );

  it("join the very first deck, queued until it completes", async () => {
    const res = await post({
      deckIds: ["nordic-v1"],
      size: 10,
      gender: "girl",
      wishes: [{ name: "mirja", gender: "girl" }, "SAGA", { name: "Bjarke", gender: "boy" }],
    });
    expect(res.status).toBe(200);
    const { creatorToken } = await res.json();
    const state = (await getStateView(creatorToken))!;
    expect(state.deck).toHaveLength(10);
    const names = state.deck.map((c) => c.name);
    expect(names).toContain("Mirja");
    expect(names).toContain("Saga"); // borrows the curated card
    expect(state.deck.find((c) => c.name === "Mirja")).toMatchObject({ wish: true, gender: "girl" });
    expect(names).not.toContain("Bjarke"); // a boy's name doesn't fit a girl deck

    const invite = await bothFinish(creatorToken, () => true, () => true);
    const token = (await getReveal(invite))!.shortlistToken!;
    const { shortlistId } = (await resolvePartner(token))!;
    // The deck completed, so its wishes left the queue; the boy's name still waits.
    expect(await getWishes(shortlistId)).toEqual([w("Bjarke", "boy")]);
  });

  it("refuses a bad name, a bad gender, or more than MAX_WISHES", async () => {
    expect((await post({ deckIds: ["nordic-v1"], wishes: ["<img>"] })).status).toBe(400);
    expect((await post({ deckIds: ["nordic-v1"], wishes: [{ name: "Mirja", gender: "x" }] })).status).toBe(400);
    expect((await post({ deckIds: ["nordic-v1"], wishes: "Mirja" })).status).toBe(400);
    expect((await post({ deckIds: ["nordic-v1"], wishes: many(MAX_WISHES + 1) })).status).toBe(400);
  });

  it("go into a dealt deck through the Shortlist's queue", async () => {
    const { creatorToken } = (await createSession("nordic-v1", 10, "girl"))!;
    const invite = await bothFinish(creatorToken, () => true, () => true);
    const token = (await getReveal(invite))!.shortlistToken!;
    const res = await post({ shortlistToken: token, deckIds: ["greek-v1"], size: 10, gender: "girl", wishes: ["Mirja"] });
    expect(res.status).toBe(200);
    const dealt = (await res.json()).creatorToken;
    expect((await getStateView(dealt))!.deck.map((c) => c.name)).toContain("Mirja");
  });
});
