// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { lastShortlist, otherHolder, remember, replaceHolder } from "@/lib/shortlist-device";

/* lib/shortlist-device.ts — one phone remembering both Partners' links (#26). */

beforeEach(() => localStorage.clear());

it("keeps each Partner's link apart; the last opened is the way back", () => {
  remember("t1", 1);
  expect(otherHolder(1)).toBeNull(); // one link → no strip
  remember("t2", 2);
  expect(otherHolder(1)).toBe("t2");
  expect(otherHolder(2)).toBe("t1");
  expect(lastShortlist()).toBe("/shortlist/t2");
  remember("t1-again"); // the reveal doesn't know the partner — holders untouched
  expect(otherHolder(2)).toBe("t1");
});

it("swaps a reissued partner's dead link for the fresh one, only if the phone held it", () => {
  remember("t1", 1);
  replaceHolder(2, "fresh");
  expect(otherHolder(1)).toBeNull(); // this phone never held partner 2
  remember("t2", 2);
  replaceHolder(2, "fresh");
  expect(otherHolder(1)).toBe("fresh");
  expect(otherHolder(2)).toBe("t1");
});
