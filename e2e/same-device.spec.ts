import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/*
  The same-device ritual, entirely in ONE browser context (that's the
  point of same-device mode, unlike the two-context link-flow test in
  ritual.spec.ts) — plus the T3 security-fix regression guard: A's raw
  swipes must never survive in this browser's localStorage, and back
  navigation must never return to A's Handoff/token page.
*/

async function swipeCards(page: Page, count: number, like: (name: string) => boolean) {
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

test("same-device ritual: single context, localStorage cleared, no back-nav to A's token", async ({
  page,
}) => {
  test.setTimeout(180_000);

  // A's and B's likes overlap on exactly three names — same fixture as
  // ritual.spec.ts's two-context test.
  const aLikes = new Set(["Astrid", "Liv", "Nils", "Saga"]);
  const bLikes = new Set(["Astrid", "Liv", "Nils", "Leif"]);

  // Adversarial tap over the WHOLE single context: no response this
  // browser ever receives — A's or B's — may carry the other's raw swipes.
  const bodies: string[] = [];
  page.on("response", async (res) => {
    try {
      const ct = res.headers()["content-type"] ?? "";
      if (ct.includes("json")) bodies.push(await res.text());
    } catch {
      /* streamed/aborted bodies — fine */
    }
  });

  // Partner A: create session, swipe, reach the handoff.
  await page.goto("/");
  await page.getByRole("button", { name: "Start swiping" }).click();
  await page.waitForURL(/\/s\/.+/);
  const creatorToken = new URL(page.url()).pathname.split("/").pop()!;

  await swipeWholeDeck(page, (n) => aLikes.has(n));
  await expect(page.getByText("Your picks are sealed.")).toBeVisible({ timeout: 15_000 });

  // Same-device path instead of send/copy.
  await page.getByRole("button", { name: "Continue on this phone" }).click();
  await expect(page.getByText("Hand the phone to your partner now.")).toBeVisible();

  await page.getByRole("button", { name: "I'm ready" }).click();
  await page.waitForURL((url) => url.pathname !== `/s/${creatorToken}`, { timeout: 15_000 });
  const inviteToken = new URL(page.url()).pathname.split("/").pop()!;
  expect(inviteToken).not.toBe(creatorToken);

  // T6, part 1: A's raw swipes must not survive in this browser's storage.
  const aSwipesStillPresent = await page.evaluate(
    (tok) => localStorage.getItem(`naym:swipes:${tok}:r1`) !== null,
    creatorToken,
  );
  expect(aSwipesStillPresent).toBe(false);

  // Partner B, same tab: passive landing → explicit start tap → blind swipe.
  await expect(
    page.getByText("Your partner picked their favorites", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start swiping" }).click();
  await swipeWholeDeck(page, (n) => bLikes.has(n));

  // B's reveal: tap gate → choreography → the three mutual names.
  await page.getByRole("button", { name: "Tap to reveal" }).click({ timeout: 15_000 });
  await expect(page.getByText("you both chose")).toBeVisible({ timeout: 10_000 });
  for (const name of ["Astrid", "Liv", "Nils"]) {
    await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 15_000 });
  }

  // T6, part 2: back navigation must not return to A's Handoff/token page,
  // nor land anywhere exposing B's in-progress swipes or A's raw picks.
  await page.goBack();
  expect(page.url()).not.toContain(creatorToken);
  await expect(page.getByText("Your picks are sealed.")).not.toBeVisible();

  // THE BLINDNESS CONTRACT, across the entire single-context session: no
  // raw per-role swipe array ever serializes, and the reveal payloads never
  // carry a solo like ("Saga" is A-only, "Leif" is B-only — neither matched).
  const all = bodies.join("\n");
  expect(all).not.toContain('"swipesA"');
  expect(all).not.toContain('"swipesB"');
  const revealBodies = bodies.filter((s) => s.includes('"matches"'));
  expect(revealBodies.length).toBeGreaterThan(0);
  for (const body of revealBodies) {
    expect(body).not.toContain("Saga");
    expect(body).not.toContain("Leif");
  }
});
