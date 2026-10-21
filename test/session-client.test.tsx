// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import SessionClient from "@/components/SessionClient";
import { swipesLocalKey } from "@/lib/local-swipes";

/*
  A lost final PUT must heal: when this device holds the full deck but the
  server stopped one short, the client re-sends instead of sitting on
  "Sealed" forever.
*/

const deck = ["astrid", "nils", "liv"].map((id) => ({
  id, name: id, say: id, origin: "test", meaning: id,
}));
const full = deck.map((c) => ({ id: c.id, liked: true }));
let state: Record<string, unknown>;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(swipesLocalKey("tok", 1), JSON.stringify(full));
  state = {
    role: "A", deck, deckTitle: "test deck",
    ownSwipes: full.slice(0, 2), ownDone: false, otherDone: false,
    bothDone: false, bStarted: false, inviteToken: null, round2: null,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.startsWith("/api/state") ? state : {}),
    })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
});

it("re-sends the full local deck when the server is one swipe behind", async () => {
  render(<SessionClient token="tok" />);
  await waitFor(() => {
    const put = vi.mocked(fetch).mock.calls.find(([u]) => u === "/api/swipes");
    expect(put).toBeDefined();
    expect(JSON.parse(put![1]!.body as string).swipes).toEqual(full);
  });
});

it("waiting poll backs off from 5s to 15s after five minutes", async () => {
  vi.useFakeTimers();
  state = { ...state, ownSwipes: full, ownDone: true, bStarted: true };
  render(<SessionClient token="tok" />);
  await act(() => vi.advanceTimersByTimeAsync(0)); // initial load lands, poll starts
  const polls = () =>
    vi.mocked(fetch).mock.calls.filter(([u]) => String(u).startsWith("/api/state")).length;
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(polls()).toBe(1 + 12); // initial load + every 5s
  await act(() => vi.advanceTimersByTimeAsync(5 * 60_000));
  const before = polls();
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(polls() - before).toBe(4); // every 15s
});
