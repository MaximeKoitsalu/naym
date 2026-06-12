import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3199",
    // Chromium with a phone viewport: B's world is a phone, and the
    // clipboard permissions the handoff test needs are Chromium-only.
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    permissions: ["clipboard-read", "clipboard-write"],
  },
  webServer: {
    command: "npm run dev -- --port 3199",
    url: "http://127.0.0.1:3199",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
