// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
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

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(swipesLocalKey("tok", 1), JSON.stringify(full));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.startsWith("/api/state")
          ? {
              role: "A", deck, deckTitle: "test deck",
              ownSwipes: full.slice(0, 2), ownDone: false, otherDone: false,
              bothDone: false, bStarted: false, inviteToken: null, round2: null,
            }
          : {},
    })),
  );
});

afterEach(() => {
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
