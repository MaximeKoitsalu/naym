import { beforeEach, describe, expect, it } from "vitest";
import { getStore } from "@/lib/store";
import { overLimit, ruleFor } from "@/lib/rate-limit";

beforeEach(() => {
  (globalThis as { __naymStore?: unknown }).__naymStore = undefined;
});

describe("rate limits", () => {
  it("picks the tight rules for session creation, reissue and the keepsake", () => {
    expect(ruleFor("/api/session").name).toBe("session");
    expect(ruleFor("/api/shortlist/reissue").name).toBe("reissue");
    expect(ruleFor("/api/keepsake").name).toBe("keepsake");
    expect(ruleFor("/api/swipes").name).toBe("api");
  });

  it("allows max requests per window and IP, then refuses, then resets", async () => {
    const rule = { name: "t", max: 3, windowS: 60 };
    const t0 = 1_000_000_000_000;
    for (let i = 0; i < 3; i++) expect(await overLimit(getStore(), rule, "1.2.3.4", t0)).toBe(false);
    expect(await overLimit(getStore(), rule, "1.2.3.4", t0)).toBe(true);
    expect(await overLimit(getStore(), rule, "5.6.7.8", t0)).toBe(false); // another IP
    expect(await overLimit(getStore(), rule, "1.2.3.4", t0 + 61_000)).toBe(false); // next window
  });
});
