import { nanoid } from "nanoid";
import { getStore } from "./store";
import { DECK_GENDERS, type DeckGender } from "./deck-manifest";
import { logEvent } from "./events";
import { MAX_WISHES, sameName } from "./wishes";
import { otherPartner, type NameCard, type Partner, type Shortlist } from "./types";

/*
  The couple's lasting Shortlist. Every key here is durable (no TTL) — the
  Shortlist outlives each 30-day session. It only ever receives the
  server-computed intersection (landMatches), never a partner's own likes.
*/

export type PartnerRecord = { shortlistId: string; partner: Partner };

export const shortlistKey = (id: string) => `shortlist:${id}`;
export const ptokKey = (t: string) => `ptok:${t}`;

/** A new Shortlist with Partner 1 minted; Partner 2 waits for B's start tap. */
export async function createShortlist(
  expecting: DeckGender = "unsure",
): Promise<{ id: string; token: string }> {
  const id = nanoid(12);
  const token = nanoid(21);
  const store = getStore();
  const shortlist: Shortlist = {
    id,
    partners: { 1: token, 2: null },
    expecting,
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
    // Shortlists made before the picker stored "not sure yet".
    expecting: DECK_GENDERS.find((g) => g === shortlist.expecting) ?? "unsure",
    entries: shortlist.entries,
  };
}

/* ── Dealing (#21) ─────────────────────────────────────────────────────── */

const seenKey = (id: string) => `shortlist:${id}:seen`;
const dealKey = (id: string) => `shortlist:${id}:deal`;

/** The latest deck dealt from this Shortlist. Tokens here never serialize as-is. */
export type DealRecord = {
  dealer: Partner;
  creatorToken: string;
  inviteToken: string;
};

export async function resolvePartner(token: string): Promise<PartnerRecord | null> {
  return getStore().get<PartnerRecord>(ptokKey(token));
}

/** Seen: every name in a session both partners completed, however they swiped it. */
export async function getSeen(id: string): Promise<Set<string>> {
  return new Set((await getStore().get<string[]>(seenKey(id))) ?? []);
}

/**
 * Idempotent. shortcut: read-modify-write, but a Shortlist has one live deck
 * at a time (dealSession), so it only races with itself writing the same ids;
 * use SADD if decks ever run concurrently.
 */
export async function markSeen(id: string, cardIds: string[]): Promise<void> {
  const seen = await getSeen(id);
  if (cardIds.every((c) => seen.has(c))) return;
  for (const c of cardIds) seen.add(c);
  await getStore().set(seenKey(id), [...seen]);
}

/** Replaces the last deal — dealSession only allows that when nobody loses a started deck. */
export async function recordDeal(id: string, deal: DealRecord): Promise<void> {
  await getStore().set(dealKey(id), deal);
}

export async function getDeal(id: string): Promise<DealRecord | null> {
  return getStore().get<DealRecord>(dealKey(id));
}

/** Either partner can change who they're naming ("finding out"). Nothing is deleted. */
export async function setExpecting(token: string, expecting: DeckGender): Promise<boolean> {
  const store = getStore();
  const rec = await store.get<PartnerRecord>(ptokKey(token));
  if (!rec) return false;
  const shortlist = await store.get<Shortlist>(shortlistKey(rec.shortlistId));
  if (!shortlist) return false;
  // shortcut: read-modify-write on the Shortlist key, so a match landing at the
  // same instant can be dropped (the next reveal view re-lands it); same fix as landMatches.
  shortlist.expecting = expecting;
  await store.set(shortlistKey(rec.shortlistId), shortlist);
  return true;
}

/**
 * A lost link: mints a fresh token for the OTHER partner and revokes their old
 * one. The requester's own token is never touched. Null when the token is
 * unknown or the other partner hasn't joined yet (nothing to reissue).
 */
export async function reissuePartnerLink(token: string): Promise<string | null> {
  const store = getStore();
  const rec = await store.get<PartnerRecord>(ptokKey(token));
  if (!rec) return null;
  const shortlist = await store.get<Shortlist>(shortlistKey(rec.shortlistId));
  const other = otherPartner(rec.partner);
  const old = shortlist?.partners[other];
  if (!shortlist || !old) return null;
  // shortcut: read-modify-write on the Shortlist key, so a match landing at the
  // same instant can be dropped (the next reveal view re-lands it); same fix as landMatches.
  const fresh = nanoid(21);
  await store.set(ptokKey(fresh), { shortlistId: shortlist.id, partner: other } satisfies PartnerRecord);
  shortlist.partners[other] = fresh;
  await store.set(shortlistKey(shortlist.id), shortlist);
  await store.del(ptokKey(old));
  await logEvent(null, "shortlist_link_reissued", undefined, {
    shortlist: shortlist.id,
    partner: rec.partner,
  });
  return fresh;
}

/* ── Wishes (#23) ──────────────────────────────────────────────────────── */

const wishesKey = (id: string) => `shortlist:${id}:wishes`;

/**
 * Wishes waiting on this Shortlist, in slip order. Open to both partners —
 * they're proposals, not swipes. A wish stays here until the deck it was
 * dealt into is finished by both (removeWishes), so a replaced or expired
 * deck hands its wishes on to the next deal.
 */
export async function getWishes(id: string): Promise<string[]> {
  return (await getStore().get<string[]>(wishesKey(id))) ?? [];
}

/**
 * Either partner slips a (cleaned) name in. A name already queued, in any case,
 * is a no-op. `{ full }` once MAX_WISHES are queued; null for an unknown token.
 * Logs wish_slipped without the partner.
 */
export async function addWish(
  token: string,
  name: string,
): Promise<{ wishes: string[] } | { full: true } | null> {
  const rec = await resolvePartner(token);
  if (!rec) return null;
  const wishes = await getWishes(rec.shortlistId);
  if (wishes.some((w) => sameName(w, name))) return { wishes };
  if (wishes.length >= MAX_WISHES) return { full: true };
  // shortcut: read-modify-write, so a slip and a deck completing (removeWishes) at the
  // same instant can drop one; RPUSH/LREM if it matters.
  // A new array: the memory store hands out stored values by reference, and a dealt deck holds this one.
  const next = [...wishes, name];
  await getStore().set(wishesKey(rec.shortlistId), next);
  await logEvent(null, "wish_slipped", undefined, { shortlist: rec.shortlistId });
  return { wishes: next };
}

/** A finished deck's wishes leave the queue; anything slipped since stays. Idempotent. */
export async function removeWishes(id: string, names: string[]): Promise<void> {
  const wishes = await getWishes(id);
  const left = wishes.filter((w) => !names.some((n) => sameName(n, w)));
  if (left.length < wishes.length) await getStore().set(wishesKey(id), left);
}
