import { getStore } from "./store";
import { ptokKey, shortlistKey, type PartnerRecord } from "./shortlist";
import { otherPartner, type NameCard, type Partner, type Shortlist } from "./types";

/*
  Duels (#22): each Partner privately answers "this or that" pairs drawn from
  the Shortlist; their ranking is built from the wins. When both are done the
  server combines the two rankings by least misery. Picks and per-partner
  rankings never leave the server — only the combined order does.
*/

/** Winner id per duel, keyed by pairKey. One key per Partner, so they never clobber each other. */
type Picks = Record<string, string>;

export type CombinedOrder = {
  /** Entry ids, best first. */
  ids: string[];
  topN: number;
  /** Names in BOTH partners' top N — derived, like a match. */
  bothTop: string[];
  /** The name the partners rank furthest apart; null when they agree everywhere. */
  split: string | null;
};

/** About 3 duels per name for small lists, tapering so the total stays near 15, never below 1. */
export const duelsPerName = (n: number) => Math.max(1, Math.min(3, Math.floor(30 / n)));

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Deterministic pairs: walk ring offsets (i, i+1), (i, i+2), … over the entry
 * order and keep a pair while both names are under duelsPerName; then give
 * any name still without a duel one against its ring neighbour.
 * shortcut: past ~30 names each gets one duel, a thin ranking; choose pairs
 * adaptively as lists grow (#13, open for later).
 */
export function duelPairs(ids: string[]): [string, string][] {
  const n = ids.length;
  const cap = duelsPerName(n);
  const count = new Map<string, number>();
  const seen = new Set<string>();
  const pairs: [string, string][] = [];
  const add = (a: string, b: string) => {
    seen.add(pairKey(a, b));
    count.set(a, (count.get(a) ?? 0) + 1);
    count.set(b, (count.get(b) ?? 0) + 1);
    pairs.push([a, b]);
  };
  for (let d = 1; d <= Math.floor(n / 2); d++) {
    for (let i = 0; i < n; i++) {
      const a = ids[i];
      const b = ids[(i + d) % n];
      if (seen.has(pairKey(a, b)) || (count.get(a) ?? 0) >= cap || (count.get(b) ?? 0) >= cap) continue;
      add(a, b);
    }
  }
  ids.forEach((a, i) => {
    const b = ids[(i + 1) % n];
    if (n > 1 && !count.get(a) && !seen.has(pairKey(a, b))) add(a, b);
  });
  return pairs;
}

export const isDone = (pairs: [string, string][], picks: Picks) =>
  pairs.every(([a, b]) => picks[pairKey(a, b)] !== undefined);

/** The combined order unlocks only when both partners have answered every duel. */
export const bothDone = (pairs: [string, string][], p1: Picks, p2: Picks) =>
  pairs.length > 0 && isDone(pairs, p1) && isDone(pairs, p2);

/** One partner's ranking: most wins first, ties kept in entry order. */
export function ranking(ids: string[], pairs: [string, string][], picks: Picks): string[] {
  const wins = new Map(ids.map((id) => [id, 0]));
  for (const [a, b] of pairs) {
    const w = picks[pairKey(a, b)];
    if (wins.has(w)) wins.set(w, wins.get(w)! + 1);
  }
  return [...ids].sort((x, y) => wins.get(y)! - wins.get(x)!);
}

/** Least misery: worst of the two ranks first, then their sum, then entry order. */
export function leastMisery(ids: string[], r1: string[], r2: string[]): CombinedOrder {
  const rows = ids.map((id, i) => ({ id, i, a: r1.indexOf(id) + 1, b: r2.indexOf(id) + 1 }));
  rows.sort((x, y) => Math.max(x.a, x.b) - Math.max(y.a, y.b) || x.a + x.b - (y.a + y.b) || x.i - y.i);
  const topN = Math.max(1, Math.min(3, Math.floor(ids.length / 2)));
  const gap = (r: (typeof rows)[number]) => Math.abs(r.a - r.b);
  // rows is already in combined order, so a tie on the gap keeps the better-ranked name.
  const widest = rows.reduce((best, r) => (gap(r) > gap(best) ? r : best), rows[0]);
  return {
    ids: rows.map((r) => r.id),
    topN,
    bothTop: rows.filter((r) => r.a <= topN && r.b <= topN).map((r) => r.id),
    split: widest && gap(widest) > 0 ? widest.id : null,
  };
}

const duelsKey = (id: string, p: Partner) => `duels:${id}:${p}`;
const orderKey = (id: string) => `duels:${id}:order`;

type DuelName = Pick<NameCard, "id" | "name" | "meaning">;

/** One partner's duel state. Carries nothing about the other partner's picks. */
export type DuelsView = {
  /** This partner's unanswered duels, in order. */
  remaining: [DuelName, DuelName][];
  total: number;
  partnerDone: boolean;
  /** Entries not covered by the last combined order. */
  newCount: number;
  order: CombinedOrder | null;
};

async function load(token: string) {
  const store = getStore();
  const rec = await store.get<PartnerRecord>(ptokKey(token));
  if (!rec) return null;
  const shortlist = await store.get<Shortlist>(shortlistKey(rec.shortlistId));
  if (!shortlist) return null;
  const id = rec.shortlistId;
  const other = otherPartner(rec.partner);
  const ids = shortlist.entries.map((e) => e.id);
  const [mine, theirs, order] = await Promise.all([
    store.get<Picks>(duelsKey(id, rec.partner)),
    store.get<Picks>(duelsKey(id, other)),
    store.get<CombinedOrder>(orderKey(id)),
  ]);
  return {
    id,
    partner: rec.partner,
    shortlist,
    ids,
    pairs: duelPairs(ids),
    mine: mine ?? {},
    theirs: theirs ?? {},
    order,
  };
}

type Loaded = NonNullable<Awaited<ReturnType<typeof load>>>;

/** Computes and stores the combined order once both partners are done. Only a pick POST calls this. */
async function settle(state: Loaded) {
  if (!bothDone(state.pairs, state.mine, state.theirs)) return;
  const [p1, p2] = state.partner === 1 ? [state.mine, state.theirs] : [state.theirs, state.mine];
  state.order = leastMisery(state.ids, ranking(state.ids, state.pairs, p1), ranking(state.ids, state.pairs, p2));
  await getStore().set(orderKey(state.id), state.order);
}

function view(state: Loaded): DuelsView {
  const byId = new Map(state.shortlist.entries.map((e) => [e.id, e]));
  const card = (id: string): DuelName => {
    const { name, meaning } = byId.get(id)!;
    return { id, name, meaning };
  };
  const ordered = new Set(state.order?.ids ?? []);
  return {
    remaining: state.pairs
      .filter(([a, b]) => state.mine[pairKey(a, b)] === undefined)
      .map(([a, b]) => [card(a), card(b)]),
    total: state.pairs.length,
    partnerDone: state.pairs.length > 0 && isDone(state.pairs, state.theirs),
    newCount: state.ids.filter((id) => !ordered.has(id)).length,
    order: state.order,
  };
}

/** A pure read — never writes, so a link prefetcher can't unlock anything. */
export async function getDuelsView(token: string): Promise<DuelsView | null> {
  const state = await load(token);
  return state && view(state);
}

/** Entries in combined order; entries the order doesn't cover yet trail in landing order. */
export function inCombinedOrder<T extends { id: string }>(entries: T[], order: CombinedOrder | null): T[] {
  const ids = order?.ids ?? [];
  const pos = (id: string) => (ids.includes(id) ? ids.indexOf(id) : ids.length);
  return [...entries].sort((x, y) => pos(x.id) - pos(y.id));
}

/**
 * Records one pick. Returns null for an unknown token, "invalid" for a pair
 * that isn't a current duel or is already answered — a pick is final, else a
 * partner could flip picks and read the other's ranks off the shifting order.
 * The pick that completes the second partner computes and stores the order.
 */
export async function recordPick(
  token: string,
  a: string,
  b: string,
  winner: string,
): Promise<DuelsView | null | "invalid"> {
  const state = await load(token);
  if (!state) return null;
  const k = pairKey(a, b);
  const current = state.pairs.some(([x, y]) => pairKey(x, y) === k);
  if (!current || state.mine[k] !== undefined || (winner !== a && winner !== b)) return "invalid";
  state.mine[k] = winner;
  await getStore().set(duelsKey(state.id, state.partner), state.mine);
  await settle(state);
  return view(state);
}
