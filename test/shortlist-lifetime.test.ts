import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, getReveal, getStateView, putSwipes, resolveToken, startB } from "@/lib/session";
import { addWish, getWishes, partnerToken, resolvePartner } from "@/lib/shortlist";

/*
  A Shortlist expires like a session until its first match, then is kept for good —
  so scripted or abandoned first decks never leave durable keys behind.
*/

beforeEach(() => {
  (globalThis as { __naymStore?: unknown }).__naymStore = undefined;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const DAY = 24 * 60 * 60 * 1000;

async function finish(creatorToken: string, likesA: boolean, likesB: boolean) {
  const deck = (await getStateView(creatorToken))!.deck;
  await putSwipes(creatorToken, deck.map((c) => ({ id: c.id, liked: likesA })));
  const invite = (await getStateView(creatorToken))!.inviteToken!;
  await startB(invite);
  await putSwipes(invite, deck.map((c) => ({ id: c.id, liked: likesB })));
  return invite;
}

describe("Shortlist lifetime", () => {
  it("a Shortlist with no match expires with its session", async () => {
    const { creatorToken } = (await createSession("nordic-v1", 10, "girl"))!;
    const invite = await finish(creatorToken, true, false); // no match
    const p1 = (await getReveal(creatorToken))!.shortlistToken!;
    const p2 = (await getReveal(invite))!.shortlistToken!;
    vi.advanceTimersByTime(31 * DAY);
    expect(await resolvePartner(p1)).toBeNull();
    expect(await resolvePartner(p2)).toBeNull();
  });

  it("the first match keeps the Shortlist, both links and its wishes for good", async () => {
    const { creatorToken } = (await createSession("nordic-v1", 10, "girl"))!;
    const p1 = (await partnerToken((await resolveToken(creatorToken))!.meta.shortlist!.id, 1))!;
    await addWish(p1, { name: "Mirja", gender: "girl" }); // queued before any match → expiring
    const invite = await finish(creatorToken, true, true); // every name matches
    await getReveal(invite);
    const p2 = (await getReveal(invite))!.shortlistToken!;
    vi.advanceTimersByTime(365 * DAY);
    const rec = await resolvePartner(p1);
    expect(rec).not.toBeNull();
    expect(await resolvePartner(p2)).not.toBeNull();
    expect((await getWishes(rec!.shortlistId)).map((w) => w.name)).toEqual(["Mirja"]);
  });
});
