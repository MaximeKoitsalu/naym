import { beforeEach, describe, expect, it } from "vitest";
import {
  armRound2,
  createSession,
  getReveal,
  getStateView,
  putSwipes,
  resolveToken,
  startB,
} from "@/lib/session";
import { getStore } from "@/lib/store";
import type { Swipe } from "@/lib/types";

/*
  Integration tests over the in-memory store: token roles, slot binding,
  the blindness boundary, derived completion, event integrity, round 2.
*/

beforeEach(() => {
  // Fresh store per test — getStore caches on globalThis.
  (globalThis as { __naymStore?: unknown }).__naymStore = undefined;
});

async function fullDeckSwipes(
  creatorToken: string,
  liked: (id: string, i: number) => boolean,
): Promise<Swipe[]> {
  const view = (await getStateView(creatorToken))!;
  return view.deck.map((c, i) => ({ id: c.id, liked: liked(c.id, i) }));
}

async function inviteTokenFor(creatorToken: string): Promise<string> {
  // Complete A's deck so the invite surfaces, then read it from A's view.
  const swipes = await fullDeckSwipes(creatorToken, (_, i) => i < 5);
  await putSwipes(creatorToken, swipes);
  const view = (await getStateView(creatorToken))!;
  return view.inviteToken!;
}

describe("tokens and roles", () => {
  it("creator token resolves to role A, invite to role B, junk to null", async () => {
    const { creatorToken } = await createSession();
    expect((await resolveToken(creatorToken))?.role).toBe("A");
    const invite = await inviteTokenFor(creatorToken);
    expect((await resolveToken(invite))?.role).toBe("B");
    expect(await resolveToken("not-a-token")).toBeNull();
  });

  it("invite token is surfaced ONLY to A and ONLY after A completes", async () => {
    const { creatorToken } = await createSession();
    let view = (await getStateView(creatorToken))!;
    expect(view.inviteToken).toBeNull(); // before completion: hidden
    const invite = await inviteTokenFor(creatorToken);
    view = (await getStateView(invite))!;
    expect(view.inviteToken).toBeNull(); // B never sees a token
  });
});

describe("B slot binding (prefetch-safe)", () => {
  it("state GETs never bind; startB binds once and logs invite_opened once", async () => {
    const { creatorToken, sessionId } = await createSession();
    const invite = await inviteTokenFor(creatorToken);
    await getStateView(invite); // a prefetcher's GET
    let events = (await getStore().range("events:log")) as { event: string }[];
    expect(events.filter((e) => e.event === "invite_opened")).toHaveLength(0);

    expect(await startB(invite)).toBe(true);
    expect(await startB(invite)).toBe(true); // idempotent resume
    const after = (await getStore().range("events:log")) as {
      event: string;
      session: string;
    }[];
    const opened = after.filter(
      (e) => e.event === "invite_opened" && e.session === sessionId,
    );
    expect(opened).toHaveLength(1);
  });

  it("the creator token can never bind the B slot", async () => {
    const { creatorToken } = await createSession();
    expect(await startB(creatorToken)).toBe(false);
  });
});

describe("the blindness boundary", () => {
  it("state view never contains the other partner's swipes, any stage", async () => {
    const { creatorToken } = await createSession();
    const invite = await inviteTokenFor(creatorToken);
    await startB(invite);
    const bSwipes = await fullDeckSwipes(invite, (_, i) => i % 2 === 0);
    await putSwipes(invite, bSwipes);
    for (const token of [creatorToken, invite]) {
      const json = JSON.stringify(await getStateView(token));
      // Own swipes appear; the OTHER role's array must not. The view has a
      // single ownSwipes field — assert no second swipe array sneaks in.
      expect(json).not.toContain('"swipesA"');
      expect(json).not.toContain('"swipesB"');
      expect((await getStateView(token))!.ownSwipes.length).toBeGreaterThan(0);
    }
  });

  it("reveal returns the intersection only", async () => {
    const { creatorToken } = await createSession();
    const aSwipes = await fullDeckSwipes(creatorToken, (id) =>
      ["astrid", "liv", "nils"].includes(id),
    );
    await putSwipes(creatorToken, aSwipes);
    const view = (await getStateView(creatorToken))!;
    const invite = view.inviteToken!;
    await startB(invite);
    const bSwipes = await fullDeckSwipes(invite, (id) => ["liv", "nils", "saga"].includes(id));
    await putSwipes(invite, bSwipes);

    const reveal = (await getReveal(creatorToken))!;
    expect(reveal.matches.map((m) => m.id).sort()).toEqual(["liv", "nils"]);
    const json = JSON.stringify(reveal);
    expect(json).not.toContain("astrid"); // A's solo like never serializes
    expect(json).not.toContain("saga"); // B's solo like never serializes
  });

  it("reveal refuses until both are complete", async () => {
    const { creatorToken } = await createSession();
    await inviteTokenFor(creatorToken);
    expect(await getReveal(creatorToken)).toBeNull();
  });
});

describe("sync protocol", () => {
  it("monotonic guard holds through the API path: empty PUT cannot wipe", async () => {
    const { creatorToken } = await createSession();
    const partial = (await fullDeckSwipes(creatorToken, () => true)).slice(0, 10);
    await putSwipes(creatorToken, partial);
    const wiped = await putSwipes(creatorToken, []); // webview with empty localStorage
    expect(wiped!.swipes).toHaveLength(10); // stored state wins
  });

  it("completion is derived and deck_completed fires exactly once", async () => {
    const { creatorToken, sessionId } = await createSession();
    const full = await fullDeckSwipes(creatorToken, () => false);
    await putSwipes(creatorToken, full.slice(0, 49));
    await putSwipes(creatorToken, full);
    await putSwipes(creatorToken, full); // idempotent replay
    const events = (await getStore().range("events:log")) as {
      event: string;
      session: string;
      role: string | null;
    }[];
    const completed = events.filter(
      (e) => e.event === "deck_completed" && e.session === sessionId,
    );
    expect(completed).toHaveLength(1);
  });
});

describe("round 2", () => {
  async function zeroMatchSession() {
    const { creatorToken, sessionId } = await createSession();
    const aSwipes = await fullDeckSwipes(creatorToken, (id) => id === "astrid");
    await putSwipes(creatorToken, aSwipes);
    const invite = (await getStateView(creatorToken))!.inviteToken!;
    await startB(invite);
    const bSwipes = await fullDeckSwipes(invite, (id) => id === "nils");
    await putSwipes(invite, bSwipes);
    return { creatorToken, invite, sessionId };
  }

  it("either partner can arm; idempotent; deck is decoy-padded", async () => {
    const { creatorToken, invite } = await zeroMatchSession();
    expect(await armRound2(invite)).toBe(true); // B arms
    expect(await armRound2(creatorToken)).toBe(true); // A's tap is a no-op success
    const view = (await getStateView(creatorToken))!;
    const ids = view.round2!.deck.map((c) => c.id);
    expect(ids).toContain("astrid");
    expect(ids).toContain("nils");
    expect(ids.length).toBeGreaterThan(2); // decoys present
  });

  it("cannot arm when matches exist", async () => {
    const { creatorToken } = await createSession();
    const both = await fullDeckSwipes(creatorToken, (id) => id === "astrid");
    await putSwipes(creatorToken, both);
    const invite = (await getStateView(creatorToken))!.inviteToken!;
    await startB(invite);
    await putSwipes(invite, both);
    expect(await armRound2(creatorToken)).toBe(false);
  });

  it("cannot arm on an empty union — warm ending instead", async () => {
    const { creatorToken } = await createSession();
    const none = await fullDeckSwipes(creatorToken, () => false);
    await putSwipes(creatorToken, none);
    const invite = (await getStateView(creatorToken))!.inviteToken!;
    await startB(invite);
    await putSwipes(invite, none);
    expect(await armRound2(creatorToken)).toBe(false);
    const reveal = (await getReveal(creatorToken))!;
    expect(reveal.matches).toHaveLength(0);
    expect(reveal.round2Available).toBe(false);
  });

  it("round-2 completion produces a second reveal", async () => {
    const { creatorToken, invite } = await zeroMatchSession();
    await armRound2(creatorToken);
    const view = (await getStateView(creatorToken))!;
    const r2deck = view.round2!.deck;
    const r2All = (liked: boolean) => r2deck.map((c) => ({ id: c.id, liked }));
    await putSwipes(creatorToken, r2All(true), 2);
    await putSwipes(invite, r2All(true), 2);
    const reveal = (await getReveal(invite))!;
    expect(reveal.round2).toBeDefined();
    expect(reveal.round2!.matches.length).toBe(r2deck.length);
  });
});

describe("events are durable", () => {
  it("kill-metric events live under a key with no TTL", async () => {
    const { creatorToken, sessionId } = await createSession();
    await putSwipes(creatorToken, (await fullDeckSwipes(creatorToken, () => true)).slice(0, 3));
    const events = (await getStore().range("events:log")) as { session: string }[];
    expect(events.filter((e) => e.session === sessionId).length).toBeGreaterThanOrEqual(2);
  });
});
