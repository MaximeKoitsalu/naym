# naym

*A blind name-matching ritual for couples*

naym turns picking a baby name into a shared moment instead of a negotiation. Each partner swipes through the same curated deck without seeing the other's choices, and a single choreographed reveal shows only the names you both liked.

## How it works

1. **Partner A** swipes a finite, curated deck of names (like/pass) and shares one link.
2. **Partner B** opens the link and swipes the same deck, fully blind to A's choices.
3. Once both are done, a **count-first reveal** shows how many mutual likes there are, then unveils the shared names one at a time.
4. No mutual likes? An optional **round 2** offers a decoy-padded shortlist so either partner can nominate names blind, without revealing who liked what first.

## Features

- **Server-enforced blindness** — raw swipe data never leaves the server; only the computed intersection is returned.
- **Resilient sync** — swipe state syncs as a full array with a monotonic guard, so a flaky connection can't roll back progress.
- **Pinned decks** — each session snapshots its deck at creation, so editing the deck data never affects a session in progress.
- **Curated name decks** — French, German, Greek, Italian, and Nordic decks included (`data/decks/`).
- **Durable event log** — every ritual event is recorded for analysis, with no TTL.

## Getting started

```bash
npm install
npm run dev
```

The app runs on an in-memory store by default, so it works out of the box with no external services.

> [!NOTE]
> To persist sessions across restarts (recommended for anything beyond local development), set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to point at an [Upstash Redis](https://upstash.com/) instance. See `lib/store.ts` for the key layout.

## Commands

| Command              | Description                                          |
| -------------------- | ----------------------------------------------------- |
| `npm run dev`         | Start the dev server                                  |
| `npm run build`       | Build for production                                  |
| `npm start`           | Start the production server                           |
| `npm test`            | Run the vitest unit suite                             |
| `npm run test:e2e`    | Run the Playwright end-to-end ritual tests            |
| `npm run typecheck`   | Type-check with `tsc --noEmit`                        |

## Testing

- `npm test` covers pure logic and store integration: reveal math, the monotonic sync guard, token roles, round 2, and event integrity.
- `npm run test:e2e` drives a full two-context ritual through a real browser (Chromium) and asserts the blindness boundary end-to-end. It needs a one-time `npx playwright install chromium` and spawns its own dev server on port 3199.

## Architecture

naym is a dynamic Next.js app — sessions require a server, so it's never statically exported. A few invariants are load-bearing and adversarially reviewed; see [`CLAUDE.md`](CLAUDE.md) for the full list and rationale:

- The blindness boundary is enforced server-side, not just in the UI.
- Swipe sync is monotonic; completion is derived from swipe count, never trusted from a client flag.
- A session's deck is pinned at creation and immune to later deck edits.

## Tech stack

Next.js 15, React 19, TypeScript, Tailwind CSS v4, Upstash Redis, Vitest, and Playwright.
