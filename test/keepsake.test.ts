import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/keepsake/route";
import { createSession, getStateView, putSwipes, startB } from "@/lib/session";
import { getStore } from "@/lib/store";

/*
  app/api/keepsake — one download is one keepsake_saved, and NOT a
  reveal_viewed (that would double-count the reveal funnel).
*/

beforeEach(() => {
  (globalThis as { __naymStore?: unknown }).__naymStore = undefined;
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline"))); // no font download
});

it("logs keepsake_saved once and no reveal_viewed", async () => {
  const { creatorToken, sessionId } = (await createSession())!;
  const deck = (await getStateView(creatorToken))!.deck;
  const liked = deck.map((c) => ({ id: c.id, liked: true }));
  await putSwipes(creatorToken, liked);
  const invite = (await getStateView(creatorToken))!.inviteToken!;
  await startB(invite);
  await putSwipes(invite, liked);

  const res = await GET(new NextRequest(`http://localhost/api/keepsake?token=${creatorToken}`));
  expect(res.status).toBe(200);
  const events = ((await getStore().range("events:log")) as { event: string; session: string }[])
    .filter((e) => e.session === sessionId)
    .map((e) => e.event);
  expect(events.filter((e) => e === "keepsake_saved")).toHaveLength(1);
  expect(events).not.toContain("reveal_viewed");
});
