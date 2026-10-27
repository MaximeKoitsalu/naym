import { nanoid } from "nanoid";
import { getStore } from "./store";
import type { NameCard, Partner, Shortlist } from "./types";

/*
  The couple's lasting Shortlist. Every key here is durable (no TTL) — the
  Shortlist outlives each 30-day session. It only ever receives the
  server-computed intersection (landMatches), never a partner's own likes.
*/

type PartnerRecord = { shortlistId: string; partner: Partner };

const shortlistKey = (id: string) => `shortlist:${id}`;
const ptokKey = (t: string) => `ptok:${t}`;

/** A new Shortlist with Partner 1 minted; Partner 2 waits for B's start tap. */
export async function createShortlist(): Promise<{ id: string; token: string }> {
  const id = nanoid(12);
  const token = nanoid(21);
  const store = getStore();
  const shortlist: Shortlist = {
    id,
    partners: { 1: token, 2: null },
    expecting: "not sure yet",
    entries: [],
  };
  await store.set(shortlistKey(id), shortlist);
  await store.set(ptokKey(token), { shortlistId: id, partner: 1 } satisfies PartnerRecord);
  return { id, token };
}

/** Mints the partner's token once; later calls return the existing one. */
export async function mintPartner(id: string, partner: Partner): Promise<string | null> {
  const store = getStore();
  const shortlist = await store.get<Shortlist>(shortlistKey(id));
  if (!shortlist) return null;
  const existing = shortlist.partners[partner];
  if (existing) return existing;
  const token = nanoid(21);
  shortlist.partners[partner] = token;
  await store.set(ptokKey(token), { shortlistId: id, partner } satisfies PartnerRecord);
  await store.set(shortlistKey(id), shortlist);
  return token;
}

export async function partnerToken(id: string, partner: Partner): Promise<string | null> {
  return (await getStore().get<Shortlist>(shortlistKey(id)))?.partners[partner] ?? null;
}

/**
 * Copies server-computed matches onto the Shortlist as full card snapshots.
 * Idempotent by card id — re-viewing a reveal adds nothing.
 * shortcut: read-modify-write on one key, so two sessions landing at the same
 * instant can drop one (the next reveal view re-lands it); move entries to a
 * hash with HSETNX when #21 deals concurrent decks.
 */
export async function landMatches(id: string, cards: NameCard[]): Promise<void> {
  if (cards.length === 0) return;
  const store = getStore();
  const shortlist = await store.get<Shortlist>(shortlistKey(id));
  if (!shortlist) return;
  const have = new Set(shortlist.entries.map((e) => e.id));
  const fresh = cards.filter((c) => !have.has(c.id));
  if (fresh.length === 0) return;
  const matchedAt = Date.now();
  shortlist.entries.push(...fresh.map((c) => ({ ...c, matchedAt })));
  await store.set(shortlistKey(id), shortlist);
}

/** One partner's view. Never carries the other partner's token. */
export async function getShortlistView(token: string) {
  const store = getStore();
  const rec = await store.get<PartnerRecord>(ptokKey(token));
  if (!rec) return null;
  const shortlist = await store.get<Shortlist>(shortlistKey(rec.shortlistId));
  if (!shortlist) return null;
  return {
    partner: rec.partner,
    expecting: shortlist.expecting,
    entries: shortlist.entries,
  };
}
