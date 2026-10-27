import { expect, test } from "@playwright/test";
import type { Browser, Page, Response } from "@playwright/test";

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
  test.setTimeout(240_000);
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

  // Matches land on BOTH Shortlists; each partner holds only their own link.
  const shortlistHref = async (p: Page) =>
    (await p.getByRole("link", { name: "Open our Shortlist" }).getAttribute("href", { timeout: 20_000 }))!;
  const aShortlist = await shortlistHref(a.page);
  const bShortlist = await shortlistHref(b.page);
  expect(aShortlist).not.toBe(bShortlist);
  for (const [p, own, other] of [
    [a.page, aShortlist, bShortlist],
    [b.page, bShortlist, aShortlist],
  ] as const) {
    // Tap every response the Shortlist page pulls (document, RSC, API).
    const bodies: Promise<string>[] = [];
    const tap = (res: Response) => {
      if (/\.(js|css|woff2?|png|svg|ico)(\?|$)/.test(res.url())) return;
      bodies.push(res.text().catch(() => ""));
    };
    p.on("response", tap);
    await p.goto(own);
    for (const name of ["Astrid", "Liv", "Nils"]) {
      await expect(p.getByText(name, { exact: true })).toBeVisible();
    }
    await p.waitForLoadState("networkidle");
    p.off("response", tap);
    // Matches only: no solo like, no other Partner's token — on the wire or in the DOM.
    const wire = (await Promise.all(bodies)).join("\n") + (await p.content());
    expect(bodies.length).toBeGreaterThan(0);
    expect(wire).not.toContain("Saga");
    expect(wire).not.toContain("Leif");
    expect(wire).not.toContain(other.split("/").pop()!);
    // Remembered on this device → the landing offers the way back.
    await p.goto("/");
    await expect(p.getByRole("link", { name: "Back to our Shortlist →" })).toHaveAttribute("href", own);
  }

  // Duels: A ranks Liv > Astrid > Nils, B ranks Liv > Nils > Astrid, blind.
  const duelAll = async (p: Page, own: string, taste: string[]) => {
    await p.goto(own);
    await p.getByRole("link", { name: "3 names to rank · start duels →" }).click();
    for (let i = 1; i <= 3; i++) {
      await expect(p.getByText(`${i} of 3`)).toBeVisible();
      // The previous pair fades out (disabled) before the live pair mounts.
      const picks = p.getByRole("button", { name: /^pick /, disabled: false });
      await expect(picks).toHaveCount(2);
      const pair = await picks.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!.slice(5)));
      const best = taste.find((n) => pair.includes(n))!;
      await picks.and(p.getByRole("button", { name: `pick ${best}` })).click();
    }
  };
  await duelAll(a.page, aShortlist, ["Liv", "Astrid", "Nils"]);
  await expect(a.page.getByText("All done. Waiting for your partner's duels…")).toBeVisible();
  await a.page.goto(aShortlist);
  await expect(a.page.getByText("Waiting for your partner's duels…")).toBeVisible();

  // B duels with every response tapped: A's picks and ranking never reach B.
  const duelBodies: Promise<string>[] = [];
  const duelTap = (res: Response) => {
    if (/\.(js|css|woff2?|png|svg|ico)(\?|$)/.test(res.url())) return;
    duelBodies.push(res.text().catch(() => ""));
  };
  b.page.on("response", duelTap);
  await duelAll(b.page, bShortlist, ["Liv", "Nils", "Astrid"]);
  await expect(b.page.getByText("You both put Liv first.")).toBeVisible();
  await expect(b.page.getByText("Biggest split:", { exact: false })).toBeVisible();
  await b.page.waitForLoadState("networkidle");
  b.page.off("response", duelTap);
  // A pick is final: flipping one to watch the order shift is refused.
  const repick = await b.page.request.post("/api/duels", {
    data: { token: bShortlist.split("/").pop(), a: "astrid", b: "liv", winner: "astrid" },
  });
  expect(repick.status()).toBe(400);
  const duelWire = (await Promise.all(duelBodies)).join("\n") + (await b.page.content());
  // Pick keys are "id|id", rankings never leave the server under any name.
  expect(duelWire).not.toMatch(/(astrid|liv|nils)\|(astrid|liv|nils)/);
  expect(duelWire).not.toMatch(/"(picks|ranks?|ranking)"/);
  // Every /api/duels answer carries exactly the picker's own view.
  const pickBodies = (await Promise.all(duelBodies)).filter((b) => b.startsWith('{"remaining"'));
  expect(pickBodies).toHaveLength(3);
  for (const body of pickBodies) {
    expect(Object.keys(JSON.parse(body)).sort()).toEqual(
      ["newCount", "order", "partnerDone", "remaining", "total"],
    );
  }

  // Both Shortlists now lead with Liv, grown and terracotta.
  for (const [p, own] of [[a.page, aShortlist], [b.page, bShortlist]] as const) {
    await p.goto(own);
    const first = p.locator("ol li").first();
    await expect(first).toHaveText("Liv");
    await expect(first).toHaveClass(/text-terra/);
    await expect(p.getByText("You both put Liv first.")).toBeVisible();
    await expect(p.getByRole("link", { name: "Our order is ready →" })).toBeVisible();
    await expect(p.getByRole("link", { name: "Deal a new deck →" })).toHaveClass(/border/);
  }

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

  // Shared phone (#26): B's reveal seen on A's device records B's link, so
  // the strip appears straight away and passes the phone over.
  await a.page.goto(inviteUrl);
  await a.page.getByRole("button", { name: "Tap to reveal" }).click({ timeout: 15_000 });
  await expect(a.page.getByRole("link", { name: "Open our Shortlist" })).toHaveAttribute("href", bShortlist, { timeout: 20_000 });
  await a.page.goto(aShortlist);
  await expect(a.page.getByText("Holding the phone:")).toContainText("Partner 1");
  await a.page.getByRole("link", { name: "pass it over" }).click();
  await a.page.waitForURL(`**${bShortlist}`);
  await expect(a.page.getByText("Holding the phone:")).toContainText("Partner 2");
  await a.page.goto(aShortlist);

  // Wishes (#23): the slip rejects digits, queues a name, and the queue survives a reload.
  await a.page.getByRole("button", { name: "filter & links" }).click();
  const slip = a.page.getByRole("textbox", { name: "a name to slip into the next deck" });
  await slip.fill("R2D2");
  await a.page.getByRole("button", { name: "Slip", exact: true }).click();
  await expect(a.page.getByRole("alert").filter({ hasText: "Letters" })).toHaveText("Letters, spaces, hyphens and apostrophes only.");
  await slip.fill("mirja"); // capitalised on the way in
  await a.page.getByRole("button", { name: "Slip", exact: true }).click();
  await expect(a.page.getByText("Waiting for the next deck: Mirja (1/3)")).toBeVisible();
  await a.page.reload();
  await a.page.getByRole("button", { name: "filter & links" }).click();
  await expect(a.page.getByText("Waiting for the next deck: Mirja (1/3)")).toBeVisible();

  // Fresh link (#25): A revokes B's link; B's old URL stops opening, A's still works.
  await a.page.getByRole("button", { name: "Send my partner a fresh link" }).click();
  await a.page.getByRole("button", { name: "Make a fresh link for my partner" }).click();
  await expect(a.page.getByText("Their old link no longer opens.")).toBeVisible();
  await b.page.goto(bShortlist);
  await expect(b.page.getByText("This Shortlist link doesn't open.")).toBeVisible();
  // The shared phone swapped its dead copy for the fresh link, which opens.
  await a.page.goto(aShortlist);
  await a.page.getByRole("link", { name: "pass it over" }).click();
  await expect(a.page.getByText("Holding the phone:")).toContainText("Partner 2");
  expect(a.page.url()).not.toContain(bShortlist);
  await expect(a.page.getByRole("listitem").filter({ hasText: "Astrid" })).toBeVisible();
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
