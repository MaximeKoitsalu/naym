import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as postExpecting } from "@/app/api/shortlist/expecting/route";
import { POST as postReissue } from "@/app/api/shortlist/reissue/route";
import { createSession, getReveal, getStateView, putSwipes, resolveToken, startB } from "@/lib/session";
import { getShortlistView, partnerToken } from "@/lib/shortlist";
import { defaultFilter, visibleEntries } from "@/lib/shortlist-filter";
import { getStore } from "@/lib/store";
import type { ShortlistEntry } from "@/lib/types";

/*
  The Shortlist sheet: the expecting setting and filter (#24), and the
  fresh partner link (#25).
*/

beforeEach(() => {
  (globalThis as { __naymStore?: unknown }).__naymStore = undefined;
});

const post = (handler: (r: NextRequest) => Promise<Response>, body: unknown) =>
  handler(
    new NextRequest("http://localhost/api/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

/** Both partners' Shortlist tokens, from a session with the given picker gender. */
async function bothPartners(gender: "girl" | "boy" | "unsure" = "unsure") {
  const { creatorToken } = (await createSession(undefined, undefined, gender))!;
  const all = async (t: string) =>
    putSwipes(t, (await getStateView(t))!.deck.map((c) => ({ id: c.id, liked: true })));
  await all(creatorToken);
  const invite = (await getStateView(creatorToken))!.inviteToken!;
  await startB(invite);
  await all(invite);
  return {
    p1: (await getReveal(creatorToken))!.shortlistToken!,
    p2: (await getReveal(invite))!.shortlistToken!,
  };
}

describe("expecting", () => {
  it("is set from the first deck's picker", async () => {
    const { p1 } = await bothPartners("girl");
    expect((await getShortlistView(p1))!.expecting).toBe("girl");
  });

  it("either partner can change it, and both see the change", async () => {
    const { p1, p2 } = await bothPartners();
    expect((await post(postExpecting, { token: p2, expecting: "boy" })).status).toBe(200);
    expect((await getShortlistView(p1))!.expecting).toBe("boy");
    expect((await post(postExpecting, { token: p1, expecting: "girl" })).status).toBe(200);
    expect((await getShortlistView(p2))!.expecting).toBe("girl");
  });

  it("rejects unknown genders and unknown tokens", async () => {
    const { p1 } = await bothPartners();
    expect((await post(postExpecting, { token: p1, expecting: "not sure yet" })).status).toBe(400);
    expect((await post(postExpecting, { token: "nope", expecting: "boy" })).status).toBe(404);
  });

  it("reads pre-picker Shortlists as unsure", async () => {
    const { p1 } = await bothPartners();
    const { shortlistId } = (await getStore().get<{ shortlistId: string }>(`ptok:${p1}`))!;
    const raw = (await getStore().get<Record<string, unknown>>(`shortlist:${shortlistId}`))!;
    await getStore().set(`shortlist:${shortlistId}`, { ...raw, expecting: "not sure yet" });
    expect((await getShortlistView(p1))!.expecting).toBe("unsure");
  });
});

describe("the girl/boy/both filter", () => {
  const entry = (id: string, gender?: ShortlistEntry["gender"]): ShortlistEntry => ({
    id, name: id, say: "", origin: "", meaning: "", gender, matchedAt: 1,
  });
  const entries = [entry("astrid", "girl"), entry("leif", "boy"), entry("kim", "unisex"), entry("wish")];
  const ids = (f: "girl" | "boy" | "both") => visibleEntries(entries, f).map((e) => e.id);

  it("defaults to the expecting gender; not sure yet shows both", () => {
    expect(defaultFilter("girl")).toBe("girl");
    expect(defaultFilter("boy")).toBe("boy");
    expect(defaultFilter("unsure")).toBe("both");
  });

  it("always shows unisex and untagged names (wishes), and deletes nothing", () => {
    expect(ids("girl")).toEqual(["astrid", "kim", "wish"]);
    expect(ids("boy")).toEqual(["leif", "kim", "wish"]);
    expect(ids("both")).toEqual(["astrid", "leif", "kim", "wish"]);
    expect(entries).toHaveLength(4);
  });
});

describe("a fresh link for my partner (#25)", () => {
  it("mints the other partner a new token and revokes the old one", async () => {
    const { p1, p2 } = await bothPartners();
    const res = await post(postReissue, { token: p1 });
    expect(res.status).toBe(200);
    const { token: fresh } = await res.json();
    expect(fresh).toBeTruthy();
    expect(fresh).not.toBe(p2);
    expect(await getShortlistView(p2)).toBeNull(); // the old URL no longer opens
    expect((await getShortlistView(fresh))!.partner).toBe(2);
    expect((await getShortlistView(p1))!.partner).toBe(1); // requester untouched
  });

  it("never touches or reveals the requester's own token", async () => {
    const { p1, p2 } = await bothPartners();
    const body = JSON.stringify(await (await post(postReissue, { token: p2 })).json());
    expect(body).not.toContain(p1);
    expect(body).not.toContain(p2);
    expect((await getShortlistView(p1))).toBeNull(); // p2 asked → p1 was reissued
    expect((await getShortlistView(p2))!.partner).toBe(2);
  });

  it("refuses when the other partner hasn't joined, and for unknown tokens", async () => {
    const { creatorToken } = (await createSession())!;
    const { shortlist } = (await resolveToken(creatorToken))!.meta;
    const p1 = (await partnerToken(shortlist!.id, 1))!;
    expect((await post(postReissue, { token: p1 })).status).toBe(404);
    expect((await post(postReissue, { token: "nope" })).status).toBe(404);
    expect((await getShortlistView(p1))!.partner).toBe(1);
  });

  it("logs the reissue", async () => {
    const { p1 } = await bothPartners();
    await post(postReissue, { token: p1 });
    const events = (await getStore().range("events:log")) as { event: string; partner?: number }[];
    const logged = events.filter((e) => e.event === "shortlist_link_reissued");
    expect(logged).toHaveLength(1);
    expect(logged[0].partner).toBe(1);
  });
});
