import { afterEach, expect, it, vi } from "vitest";
import { getStore } from "@/lib/store";

afterEach(() => {
  vi.unstubAllEnvs();
  (globalThis as { __naymStore?: unknown }).__naymStore = undefined;
});

it("refuses the in-memory store in production", () => {
  (globalThis as { __naymStore?: unknown }).__naymStore = undefined;
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  expect(() => getStore()).toThrow(/UPSTASH_REDIS_REST_URL/);
});
