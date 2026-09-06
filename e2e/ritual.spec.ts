import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

/*
  The flagship E2E: the full ritual in two browser contexts, with the
  adversarial blindness assertion — no HTTP response delivered to B's
  context may ever contain A's raw swipe data.
*/

async function swipeCards(page: Page, count: number, like: (name: string) => boolean) {
  // Buttons are the accessible path and animate the same exit as a drag.
  // After each click, wait for the card to actually advance — the exit
  // animation means the heading lags the decision by ~600ms.
  for (let i = 0; i < count; i++) {
    const heading = page.locator("article h2");
    await heading.waitFor({ state: "visible" });
    const name = (await heading.textContent())!.trim();
    const button = like(name)
      ? page.getByRole("button", { name: `love ${name}` })
      : page.getByRole("button", { name: `pass on ${name}` });
    await button.click();
    await page.waitForFunction(
      (prev) => {
        const h = document.querySelector("article h2");
        return !h || h.textContent?.trim() !== prev;
      },
      name,
      { timeout: 10_000 },
    );
  }
}

const swipeWholeDeck = (page: Page, like: (name: string) => boolean) =>
  swipeCards(page, 50, like);

async function newPartnerPage(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  return { ctx, page };
}

test("full ritual: A swipes → handoff → B swipes blind → both reveals match", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const a = await newPartnerPage(browser);
  const b = await newPartnerPage(browser);

  // A's likes and B's likes overlap on exactly three names.
  const aLikes = new Set(["Astrid", "Liv", "Nils", "Saga"]);
  const bLikes = new Set(["Astrid", "Liv", "Nils", "Leif"]);

  // Adversarial tap: record every response body B's context receives.
  const bBodies: string[] = [];
  b.page.on("response", async (res) => {
    try {
      const ct = res.headers()["content-type"] ?? "";
      if (ct.includes("json")) bBodies.push(await res.text());
    } catch {
      /* streamed/aborted bodies — fine */
    }
  });

  // Partner A: create session, swipe, reach the handoff. This test hardcodes
  // specific names below, so it needs the full deterministic 50-card deck —
  // the default is a shuffled 20-card subset that might not include them.
  await a.page.goto("/");
  await a.page.getByRole("button", { name: "50", exact: true }).click();
  await a.page.getByRole("button", { name: "Start swiping" }).click();
  await a.page.waitForURL(/\/s\/.+/);
  await swipeWholeDeck(a.page, (n) => aLikes.has(n));
  await expect(a.page.getByText("Your picks are sealed.")).toBeVisible({ timeout: 15_000 });

  // The invite link is surfaced only here, post-completion.
  await a.page.getByRole("button", { name: "copy link instead" }).click();
  const inviteUrl = await a.page.evaluate(() => navigator.clipboard.readText());
  expect(inviteUrl).toMatch(/\/s\/.+/);

  // Partner B: passive landing → explicit start tap → blind swipe.
  await b.page.goto(inviteUrl);
  await expect(
    b.page.getByText("Your partner picked their favorites", { exact: false }),
  ).toBeVisible();
  await b.page.getByRole("button", { name: "Start swiping" }).click();
  await swipeWholeDeck(b.page, (n) => bLikes.has(n));

  // B's reveal: tap gate → choreography → the three mutual names.
  await b.page.getByRole("button", { name: "Tap to reveal" }).click({ timeout: 15_000 });
  await expect(b.page.getByText("you both chose")).toBeVisible({ timeout: 10_000 });
  for (const name of ["Astrid", "Liv", "Nils"]) {
    await expect(b.page.getByText(name, { exact: true })).toBeVisible({ timeout: 15_000 });
  }
  // Spoiler-protection copy on B's reveal.
  await expect(b.page.getByText("Don't tell them", { exact: false })).toBeVisible({
    timeout: 15_000,
  });

  // A's waiting page transitions to the reveal without a manual reload.
  await expect(a.page.getByRole("button", { name: "Tap to reveal" })).toBeVisible({
    timeout: 30_000,
  });
  await a.page.getByRole("button", { name: "Tap to reveal" }).click();
  await expect(a.page.getByText("you both chose")).toBeVisible({ timeout: 10_000 });

  // THE BLINDNESS CONTRACT: no response B received contains A's solo like
  // ("Saga" was liked only by A and matched by nobody) as swipe data, and
  // no raw swipe array for the other role ever appears.
  const allB = bBodies.join("\n");
  expect(allB).not.toContain('"swipesA"');
  expect(allB).not.toContain('"swipesB"');
  // Saga appears in B's own deck (a card), so assert on the reveal payloads:
  const revealBodies = bBodies.filter((s) => s.includes('"matches"'));
  expect(revealBodies.length).toBeGreaterThan(0);
  for (const body of revealBodies) {
    expect(body).not.toContain("Saga");
    expect(body).not.toContain("Leif");
  }
});

test("resume: killing the tab mid-deck resumes at the same card", async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await newPartnerPage(browser);
  await a.page.goto("/");
  // This test asserts an exact "8 / 50" progress label, so it needs the
  // full deck rather than the default 20-card subset.
  await a.page.getByRole("button", { name: "50", exact: true }).click();
  await a.page.getByRole("button", { name: "Start swiping" }).click();
  await a.page.waitForURL(/\/s\/.+/);
  const url = a.page.url();

  // Swipe 7 cards, then kill the page.
  await swipeCards(a.page, 7, () => false);
  await expect(a.page.getByText("8 / 50")).toBeVisible();
  await a.page.close();

  // Same context (same localStorage) — reopen and resume at card 8.
  const page2 = await a.ctx.newPage();
  await page2.goto(url);
  await expect(page2.getByText("8 / 50")).toBeVisible({ timeout: 15_000 });
});

test("unknown token shows the warm expired screen, not a crash", async ({ page }) => {
  await page.goto("/s/definitely-not-a-real-token");
  await expect(page.getByText("This session has ended.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: "Start a fresh deck" })).toBeVisible();
});
