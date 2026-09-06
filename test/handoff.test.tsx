// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Handoff from "@/components/Handoff";

/*
  Handoff.tsx — the same-device interstitial's "I'm ready" idempotency
  guard (T4): a rapid double-tap must fire exactly one event and one
  navigation, not two.
*/

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

beforeEach(() => {
  replace.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }),
  );
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("double-tapping 'I'm ready' fires exactly one event and one navigation", () => {
  render(<Handoff inviteToken="invite-tok" creatorToken="creator-tok" />);

  fireEvent.click(screen.getByRole("button", { name: "Continue on this phone" }));
  const readyButton = screen.getByRole("button", { name: "I'm ready" });
  fireEvent.click(readyButton);
  fireEvent.click(readyButton);

  expect(fetch).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledWith("/s/invite-tok");
});
