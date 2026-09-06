# naym

A blind name-matching ritual for couples. Partner A swipes a finite 50-name
curated deck, shares one link; partner B swipes the same deck blind; one
count-first choreographed reveal shows only mutual likes.

**Plan of record:** `~/.gstack/projects/maximekoitsalu/maximekoitsalu-unknown-design-20260612-195849.md`
(office-hours → eng review → design review, all CLEAR). Read it before
changing architecture — the two-token session model, server-side blindness
boundary, decoy-padded round 2, and sync protocol were all adversarially
reviewed decisions, not accidents.

## Commands

```bash
npm run dev        # dev server (in-memory store unless Upstash env vars set)
npm test           # vitest unit suite — run before every commit
npm run test:e2e   # playwright two-context ritual + blindness contract
npm run typecheck  # tsc --noEmit
```

## Testing

- `npm test` — pure-logic + store-integration tests (reveal math, monotonic
  guard, token roles, round 2, event integrity). Free, fast.
- `npm run test:e2e` — needs `npx playwright install chromium` once. Spawns
  its own dev server on port 3199.

## Architecture invariants (do not break)

1. **The blindness boundary:** raw per-role swipe arrays NEVER serialize off
   the server. The reveal endpoint returns the server-computed intersection
   only; round 2 returns the decoy-padded shuffled deck only. Enforced by
   `e2e/ritual.spec.ts`.
2. **Monotonic sync:** swipe PUTs carry the client's FULL array; the server
   rejects any array shorter than stored (`guardSwipes`). Completion is
   DERIVED from count, never trusted from a flag.
3. **B slot binds on the start tap, never on GET** — link prefetchers must
   see a passive page.
4. **Deck pinning:** the session stores its full deck snapshot at creation.
   Editing `data/decks/nordic.json` must never affect live sessions.
5. **Events are durable** (`events:log`, no TTL) — they ARE the kill metric.
6. **Dynamic app:** never set `output: "export"` (sessions need a server).

## Storage

`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` env vars switch the
store from in-memory (dev/test) to Upstash. Key layout in `lib/store.ts`.

## Design system (v1, revisable)

Fraunces (display) + Schibsted Grotesk (UI chrome); paper `#FAF7F2`, ink
`#221F1A`, terracotta `#C26A4A`; 4px scale, 20px card radius, no decorative
shadows. The full design spec (choreography beats, swipe physics contract,
state table, a11y rules) lives in the plan of record.

## Agent skills

### Issue tracker

Issues tracked as GitHub Issues in MaximeKoitsalu/naym via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix), used as-is. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
