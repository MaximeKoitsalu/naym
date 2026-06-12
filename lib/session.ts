import { nanoid } from "nanoid";
import { DEFAULT_DECK_ID, getDeckEntry } from "./decks";
import { getStore, SESSION_TTL_S } from "./store";
import {
  buildRound2Deck,
  guardSwipes,
  intersection,
  isComplete,
  union,
} from "./reveal";
import type {
  EventName,
  NameCard,
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
  deckId: string = DEFAULT_DECK_ID,
): Promise<{ creatorToken: string; sessionId: string } | null> {
  const entry = getDeckEntry(deckId);
  if (!entry) return null; // unknown deck — route turns this into a 400
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
    inviteToken,
  };
  await store.set(metaKey(id), meta, SESSION_TTL_S);
  await store.set(tokKey(creatorToken), { id, role: "A" } satisfies TokenRecord, SESSION_TTL_S);
  await store.set(tokKey(inviteToken), { id, role: "B" } satisfies TokenRecord, SESSION_TTL_S);
  await logEvent(id, "session_created");
  return { creatorToken, sessionId: id };
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
  // Refresh meta TTL alongside writes so an active session never expires mid-deck.
  await store.set(metaKey(meta.id), meta, SESSION_TTL_S);
  await logEvent(meta.id, "swipe_progress", role, { count: guarded.length, round });

  const completed = isComplete(deck, guarded);
  if (completed && !wasComplete) {
    await logEvent(meta.id, "deck_completed", role, { round });
  }
  return { swipes: guarded, completed };
}

/** B slot binds HERE — on the human start tap, never on GET (prefetch-safe). */
export async function startB(token: string): Promise<boolean> {
  const resolved = await resolveToken(token);
  if (!resolved || resolved.role !== "B") return false;
  const { meta } = resolved;
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
  if (!r2deck) return false; // empty union → warm ending, no round 2
  meta.round2 = { deck: r2deck, armedAt: Date.now() };
  await getStore().set(metaKey(meta.id), meta, SESSION_TTL_S);
  await logEvent(meta.id, "round2_armed", role);
  return true;
}

/**
 * The blindness boundary. Computes the reveal server-side and returns
 * ONLY what the product means to show. Raw swipe arrays never leave here.
 */
export async function getReveal(token: string): Promise<RevealPayload | null> {
  const resolved = await resolveToken(token);
  if (!resolved) return null;
  const { meta, role } = resolved;
  const [a, b] = await Promise.all([
    getSwipes(meta.id, "A"),
    getSwipes(meta.id, "B"),
  ]);
  if (!isComplete(meta.deck, a) || !isComplete(meta.deck, b)) return null;

  const matches = intersection(meta.deck, a, b);
  const u = union(meta.deck, a, b);
  const payload: RevealPayload = {
    matches,
    deckSize: meta.deck.length,
    round2Available: matches.length === 0 && u.length > 0,
    round2Armed: meta.round2 !== null,
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
  await logEvent(meta.id, "reveal_viewed", role);
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
