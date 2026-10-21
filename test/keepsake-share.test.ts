// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { shareKeepsake } from "@/components/Reveal";

/*
  The keepsake share must hand over the image, never a URL: the token in
  /api/keepsake?token=… is the key to this partner's raw swipes.
*/

const TOKEN = "secret-creator-token";
const share = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  share.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["png"]) }),
  );
  Object.assign(navigator, { share, canShare: () => true });
});

afterEach(() => vi.unstubAllGlobals());

it("shares the keepsake as a file and never leaks the session token", async () => {
  await shareKeepsake(TOKEN);
  expect(share).toHaveBeenCalledTimes(1);
  const data = share.mock.calls[0][0];
  expect(data.files[0]).toBeInstanceOf(File);
  expect(data.url).toBeUndefined();
  expect(JSON.stringify([data.title, data.text])).not.toContain(TOKEN);
});
