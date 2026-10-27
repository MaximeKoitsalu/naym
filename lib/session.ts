import { nanoid } from "nanoid";
import { buildSessionDeck, DEFAULT_DECK_ID, type DeckEntry } from "./decks";
import { MIN_DECK_SIZE, type DeckGender } from "./deck-manifest";
import { getStore, SESSION_TTL_S } from "./store";
import {
  createShortlist,
  getDeal,
  getSeen,
  landMatches,
  markSeen,
  mintPartner,
  partnerToken,
  recordDeal,
  resolvePartner,
} from "./shortlist";
import {
  buildRound2Deck,
  guardSwipes,
  intersection,
  isComplete,
} from "./reveal";
import type {
  EventName,
  NameCard,
  Partner,
  RevealPayload,
  Role,
  SessionMeta,
  Swipe,
} from "./types";

type TokenRecord = { id: string; role: Role };

const tokKey = (t: string) => `tok:${t}`;
const metaKey = (id: string) => `sess:${id}:meta`;
const swipesKey = (id: string, role: Role, round: 1 | 2) =>
  round === 1 ? `sess:${id}:swipes:${role}` : `sess:${id}:r2:${role}`;

export async function logEvent(
  sessionId: string,
  event: EventName,
  role?: Role,
  extra?: Record<string, unknown>,
) {
  // Durable key, no TTL — slow recruitment must never delete the kill metric.
  await getStore().append("events:log", {
    session: sessionId,
    event,
    role: role ?? null,
    ts: Date.now(),
    ...extra,
  });
}

export async function createSession(
  deckIds: string | string[] = DEFAULT_DECK_ID,
  size?: number,
  gender: DeckGender = "unsure",
): Promise<{ creatorToken: string; sessionId: string } | null> {
  // One origin → that deck verbatim (at max size); several → an even blend.
  const entry = buildSessionDeck(
    Array.isArray(deckIds) ? deckIds : [deckIds],
    size,
    gender,
  );
  if (!entry) return null; // unknown deck or empty pick — route turns this into a 400
  const shortlist = await createShortlist(); // mints Partner 1
  return openSession(entry, { id: shortlist.id, A: 1, B: 2 });
}

async function openSession(
  entry: DeckEntry,
  shortlist: NonNullable<SessionMeta["shortlist"]>,
): Promise<{ creatorToken: string; inviteToken: string; sessionId: string }> {
  const store = getStore();
  const id = nanoid(12);
  const creatorToken = nanoid(21);
  const inviteToken = nanoid(21);
  const meta: SessionMeta & { inviteToken: string } = {
    id,
    deckId: entry.deckId,
    deckTitle: entry.title,
    deckVersion: entry.version,
    deck: entry.names, // full snapshot pinned at creation — deck edits never corrupt live sessions
    contract: "love",
    createdAt: Date.now(),
    bStartedAt: null,
    round2: null,
    shortlist,
    inviteToken,
  };
  await store.set(metaKey(id), meta, SESSION_TTL_S);
  await store.set(tokKey(creatorToken), { id, role: "A" } satisfies TokenRecord, SESSION_TTL_S);
  await store.set(tokKey(inviteToken), { id, role: "B" } satisfies TokenRecord, SESSION_TTL_S);
  await logEvent(id, "session_created");
  return { creatorToken, inviteToken, sessionId: id };
}

/**
 * Either Partner deals a new deck from their Shortlist: the dealer is role A,
 * the other Partner role B, on the SAME Shortlist. Seen names never return.
 * Fewer than MIN_DECK_SIZE unseen names → `{ dry }`, nothing is created.
 */
export async function dealSession(
  partnerTok: string,
  deckIds: string[],
  size?: number,
  gender: DeckGender = "unsure",
): Promise<{ creatorToken: string; size: number } | { dry: number } | null> {
  const partner = await resolvePartner(partnerTok);
  if (!partner) return null;
  const seen = await getSeen(partner.shortlistId);
  const entry = buildSessionDeck(deckIds, size, gender, Math.random, seen);
  if (!entry) return null;
  if (entry.names.length < MIN_DECK_SIZE) return { dry: entry.names.length };
  const other: Partner = partner.partner === 1 ? 2 : 1;
  const { creatorToken, inviteToken } = await openSession(entry, {
    id: partner.shortlistId,
    A: partner.partner,
    B: other,
  });
  await recordDeal(partner.shortlistId, { dealer: partner.partner, creatorToken, inviteToken });
  return { creatorToken, size: entry.names.length };
}

/**
 * The latest dealt deck as ONE Partner's Shortlist shows it: the dealer gets
 * their own A link; the other Partner sees it only once the dealer has
 * finished, with their own B link (B binds on the Start tap, not here).
 * Never carries the other Partner's session token. Null once both finished.
 */
export async function getDealView(
  partnerTok: string,
): Promise<{ mine: boolean; size: number; href: string } | null> {
  const partner = await resolvePartner(partnerTok);
  if (!partner) return null;
  const deal = await getDeal(partner.shortlistId);
  if (!deal) return null;
  const resolved = await resolveToken(deal.creatorToken);
  if (!resolved) return null; // expired
  const { meta } = resolved;
  const [a, b] = await Promise.all([getSwipes(meta.id, "A"), getSwipes(meta.id, "B")]);
  const aDone = isComplete(meta.deck, a);
  if (aDone && isComplete(meta.deck, b)) return null;
  const size = meta.deck.length;
  if (partner.partner === deal.dealer) return { mine: true, size, href: `/s/${deal.creatorToken}` };
  return aDone ? { mine: false, size, href: `/s/${deal.inviteToken}` } : null;
}

export async function resolveToken(token: string): Promise<
  | { meta: SessionMeta & { inviteToken: string }; role: Role }
  | null
> {
  const store = getStore();
  const rec = await store.get<TokenRecord>(tokKey(token));
  if (!rec) return null;
  const meta = await store.get<SessionMeta & { inviteToken: string }>(metaKey(rec.id));
  if (!meta) return null; // token outlived meta — treat as expired
  return { meta, role: rec.role };
}

export async function getSwipes(id: string, role: Role, round: 1 | 2 = 1): Promise<Swipe[]> {
  return (await getStore().get<Swipe[]>(swipesKey(id, role, round))) ?? [];
}

/**
 * Idempotent full-array PUT with monotonic guard.
 * Returns the stored array, or null when rejected.
 * Fires deck_completed exactly once, on the write that crosses the threshold.
 */
export async function putSwipes(
  token: string,
  incoming: Swipe[],
  round: 1 | 2 = 1,
): Promise<{ swipes: Swipe[]; completed: boolean } | null> {
  const resolved = await resolveToken(token);
  if (!resolved) return null;
  const { meta, role } = resolved;
  const deck = round === 1 ? meta.deck : meta.round2?.deck;
  if (!deck) return null;

  const store = getStore();
  const stored = await getSwipes(meta.id, role, round);
  const guarded = guardSwipes(deck, stored, incoming);
  if (guarded === null) {
    // Monotonic rejection is not an error for the client — stored state wins.
    return { swipes: stored, completed: isComplete(deck, stored) };
  }

  const wasComplete = isComplete(deck, stored);
  await store.set(swipesKey(meta.id, role, round), guarded, SESSION_TTL_S);
  await logEvent(meta.id, "swipe_progress", role, { count: guarded.length, round });

  const completed = isComplete(deck, guarded);
  if (completed && !wasComplete) {
    await logEvent(meta.id, "deck_completed", role, { round });
    // The last finisher lands the matches on the Shortlist (no-op while the other is mid-deck).
    await landSessionMatches(meta);
  }
  return { swipes: guarded, completed };
}

/** B slot binds HERE — on the human start tap, never on GET (prefetch-safe). */
export async function startB(token: string): Promise<boolean> {
  const resolved = await resolveToken(token);
  if (!resolved || resolved.role !== "B") return false;
  const { meta } = resolved;
  // Idempotent — mints Partner 2 on the first tap, heals a lost mint on a retry.
  if (meta.shortlist) await mintPartner(meta.shortlist.id, meta.shortlist.B);
  if (meta.bStartedAt === null) {
    meta.bStartedAt = Date.now();
    await getStore().set(metaKey(meta.id), meta, SESSION_TTL_S);
    await logEvent(meta.id, "invite_opened", "B");
  }
  return true;
}

/** Either partner arms round 2 after a zero-match reveal. Idempotent. */
export async function armRound2(token: string): Promise<boolean> {
  const resolved = await resolveToken(token);
  if (!resolved) return false;
  const { meta, role } = resolved;
  if (meta.round2) return true; // already armed by the other partner
  const [a, b] = await Promise.all([
    getSwipes(meta.id, "A"),
    getSwipes(meta.id, "B"),
  ]);
  // Only a real zero-match, both-complete session can arm round 2.
  if (!isComplete(meta.deck, a) || !isComplete(meta.deck, b)) return false;
  if (intersection(meta.deck, a, b).length > 0) return false;
  const r2deck = buildRound2Deck(meta.deck, a, b);
  if (!r2deck) return false; // empty union or too few decoys → warm ending, no round 2
  meta.round2 = { deck: r2deck, armedAt: Date.now() };
  await getStore().set(metaKey(meta.id), meta, SESSION_TTL_S);
  await logEvent(meta.id, "round2_armed", role);
  return true;
}

/**
 * WRITES: marks the deck Seen and copies the server-computed matches (round 1, and round 2 once both
 * finish it) onto the couple's Shortlist. Idempotent; a no-op until both are done.
 */
export async function landSessionMatches(meta: SessionMeta): Promise<void> {
  if (!meta.shortlist) return;
  const [a, b] = await Promise.all([getSwipes(meta.id, "A"), getSwipes(meta.id, "B")]);
  if (!isComplete(meta.deck, a) || !isComplete(meta.deck, b)) return;
  // Both finished → every card is Seen, liked or not (direction-blind, so it leaks nothing).
  await markSeen(meta.shortlist.id, meta.deck.map((c) => c.id));
  const cards = intersection(meta.deck, a, b);
  if (meta.round2) {
    const [r2a, r2b] = await Promise.all([getSwipes(meta.id, "A", 2), getSwipes(meta.id, "B", 2)]);
    if (isComplete(meta.round2.deck, r2a) && isComplete(meta.round2.deck, r2b)) {
      cards.push(...intersection(meta.round2.deck, r2a, r2b));
    }
  }
  await landMatches(meta.shortlist.id, cards);
}

/**
 * The blindness boundary. Computes the reveal server-side and returns
 * ONLY what the product means to show. Raw swipe arrays never leave here.
 */
export async function getReveal(
  token: string,
  { logView = true } = {},
): Promise<RevealPayload | null> {
  const resolved = await resolveToken(token);
  if (!resolved) return null;
  const { meta, role } = resolved;
  const [a, b] = await Promise.all([
    getSwipes(meta.id, "A"),
    getSwipes(meta.id, "B"),
  ]);
  if (!isComplete(meta.deck, a) || !isComplete(meta.deck, b)) return null;

  const matches = intersection(meta.deck, a, b);
  const payload: RevealPayload = {
    matches,
    deckSize: meta.deck.length,
    // Same rule armRound2 applies — the button never offers a 409.
    round2Available: matches.length === 0 && buildRound2Deck(meta.deck, a, b) !== null,
    round2Armed: meta.round2 !== null,
    shortlistToken: null,
  };
  if (meta.round2) {
    const [r2a, r2b] = await Promise.all([
      getSwipes(meta.id, "A", 2),
      getSwipes(meta.id, "B", 2),
    ]);
    if (isComplete(meta.round2.deck, r2a) && isComplete(meta.round2.deck, r2b)) {
      payload.round2 = {
        matches: intersection(meta.round2.deck, r2a, r2b),
        deckSize: meta.round2.deck.length,
      };
    }
  }
  if (meta.shortlist) {
    await landSessionMatches(meta); // heals a landing lost at completion
    payload.shortlistToken = await partnerToken(meta.shortlist.id, meta.shortlist[role]);
  }
  if (logView) await logEvent(meta.id, "reveal_viewed", role);
  return payload;
}

// (older sessions created before multi-deck carry no deckTitle — handled at read)

/** Role-appropriate state view. NEVER includes the other partner's swipes. */
export async function getStateView(token: string) {
  const resolved = await resolveToken(token);
  if (!resolved) return null;
  const { meta, role } = resolved;
  const [a, b] = await Promise.all([
    getSwipes(meta.id, "A"),
    getSwipes(meta.id, "B"),
  ]);
  const aDone = isComplete(meta.deck, a);
  const bDone = isComplete(meta.deck, b);
  const own = role === "A" ? a : b;
  const ownDone = role === "A" ? aDone : bDone;
  const bothDone = aDone && bDone;

  let round2: { deck: NameCard[]; ownSwipes: Swipe[]; ownDone: boolean; otherDone: boolean } | null = null;
  if (meta.round2) {
    const [r2a, r2b] = await Promise.all([
      getSwipes(meta.id, "A", 2),
      getSwipes(meta.id, "B", 2),
    ]);
    round2 = {
      deck: meta.round2.deck,
      ownSwipes: role === "A" ? r2a : r2b,
      ownDone: isComplete(meta.round2.deck, role === "A" ? r2a : r2b),
      otherDone: isComplete(meta.round2.deck, role === "A" ? r2b : r2a),
    };
  }

  return {
    role,
    deck: meta.deck,
    deckId: meta.deckId,
    deckTitle: meta.deckTitle ?? "name deck",
    ownSwipes: own,
    ownDone,
    otherDone: role === "A" ? bDone : aDone,
    bothDone,
    bStarted: meta.bStartedAt !== null,
    // Invite surfaced ONLY to A, ONLY after A completes (handoff screen rule).
    inviteToken: role === "A" && aDone ? meta.inviteToken : null,
    round2,
  };
}
