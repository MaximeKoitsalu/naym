import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bothDone,
  duelPairs,
  getDuelsView,
  leastMisery,
  pairKey,
  ranking,
  recordPick,
} from "@/lib/duels";
import { createShortlist, landMatches, mintPartner } from "@/lib/shortlist";
import { getStore } from "@/lib/store";
import type { NameCard } from "@/lib/types";

beforeEach(() => {
  (globalThis as { __naymStore?: unknown }).__naymStore = undefined;
});

const ids = (n: number) => Array.from({ length: n }, (_, i) => `n${i}`);

describe("duelPairs", () => {
  it("puts each name in about 3 duels, with no repeats", () => {
    for (const n of [4, 6, 8, 10]) {
      const pairs = duelPairs(ids(n));
      const count = new Map<string, number>();
      for (const [a, b] of pairs) for (const id of [a, b]) count.set(id, (count.get(id) ?? 0) + 1);
      expect(new Set(pairs.map(([a, b]) => pairKey(a, b))).size).toBe(pairs.length);
      for (const c of count.values()) expect(c).toBeGreaterThanOrEqual(2);
      for (const c of count.values()) expect(c).toBeLessThanOrEqual(3);
    }
  });
  it("is deterministic and capped", () => {
    expect(duelPairs(ids(8))).toEqual(duelPairs(ids(8)));
    expect(duelPairs(ids(3))).toHaveLength(3);
    expect(duelPairs(ids(2))).toHaveLength(1);
    expect(duelPairs(ids(1))).toHaveLength(0);
  });
  it("gives every name at least one duel on big lists, keeping the total near 15", () => {
    for (const n of [11, 16, 17, 20, 31, 40]) {
      const pairs = duelPairs(ids(n));
      expect(new Set(pairs.flat()).size).toBe(n);
      expect(pairs.length).toBeLessThanOrEqual(Math.max(15, Math.ceil(n / 2)));
    }
    expect(duelPairs(ids(16))).toHaveLength(8);
    expect(duelPairs(ids(20))).toHaveLength(10);
  });
});

describe("least misery", () => {
  it("ranks by the worse of the two ranks — a lukewarm name can't top the list", () => {
    // n0 is partner 1's #1 but partner 2's last (worse rank 4); n1 is #2 and #1 (worse 2).
    // n0 and n3 both have worse rank 4; n0's sum (5) beats n3's (7).
    const order = leastMisery(["n0", "n1", "n2", "n3"], ["n0", "n1", "n2", "n3"], ["n1", "n2", "n3", "n0"]);
    expect(order.ids).toEqual(["n1", "n2", "n0", "n3"]);
    expect(order.split).toBe("n0");
    expect(order.topN).toBe(2);
    expect(order.bothTop).toEqual(["n1"]);
  });
  it("breaks a full tie (worse rank and sum) by entry order", () => {
    // n0 (1,3) and n2 (3,1) tie on worse rank 3 and sum 4; n1 (2,2) wins outright.
    const order = leastMisery(["n0", "n1", "n2"], ["n0", "n1", "n2"], ["n2", "n1", "n0"]);
    expect(order.ids).toEqual(["n1", "n0", "n2"]);
  });
  it("has no split when the partners agree", () => {
    const r = ["n0", "n1", "n2"];
    expect(leastMisery(r, r, r)).toMatchObject({ ids: r, split: null, bothTop: ["n0"] });
  });
  it("ranks a partner by wins, ties in entry order", () => {
    const list = ids(4);
    const pairs = duelPairs(list);
    const picks = Object.fromEntries(pairs.map(([a, b]) => [pairKey(a, b), b > a ? b : a]));
    expect(ranking(list, pairs, picks)[0]).toBe("n3");
    expect(ranking(list, pairs, {})).toEqual(list);
  });
});

describe("unlock", () => {
  it("needs both partners to finish every duel", () => {
    const pairs = duelPairs(ids(4));
    const all = Object.fromEntries(pairs.map(([a, b]) => [pairKey(a, b), a]));
    const [first] = pairs;
    const partial = { [pairKey(...first)]: first[0] };
    expect(bothDone(pairs, all, all)).toBe(true);
    expect(bothDone(pairs, all, partial)).toBe(false);
    expect(bothDone(pairs, {}, all)).toBe(false);
    expect(bothDone([], {}, {})).toBe(false);
  });
});

const card = (id: string): NameCard => ({ id, name: id.toUpperCase(), say: "", origin: "", meaning: "m" });

async function couple(n: number) {
  const { id, token: t1 } = await createShortlist();
  const t2 = (await mintPartner(id, 2))!;
  await landMatches(id, ids(n).map(card));
  return { id, t1, t2 };
}

async function duelAll(token: string, pick: (a: string, b: string) => string) {
  let v = (await getDuelsView(token))!;
  while (v.remaining.length) {
    const [a, b] = v.remaining[0];
    const next = await recordPick(token, a.id, b.id, pick(a.id, b.id));
    if (!next || next === "invalid") throw new Error("pick failed");
    v = next;
  }
  return v;
}

describe("duels over the store", () => {
  it("unlocks the combined order only after both partners finish", async () => {
    const { t1, t2 } = await couple(4);
    const v0 = (await getDuelsView(t1))!;
    expect(v0).toMatchObject({ total: 6, newCount: 4, partnerDone: false, order: null });

    const done1 = await duelAll(t1, (a, b) => (a < b ? a : b));
    expect(done1).toMatchObject({ remaining: [], order: null, partnerDone: false });
    expect((await getDuelsView(t2))!.partnerDone).toBe(true);

    const done2 = await duelAll(t2, (a, b) => (a < b ? b : a));
    expect(done2.order).not.toBeNull();
    expect((await getDuelsView(t1))!.order).toEqual(done2.order);
    expect(done2.newCount).toBe(0);
  });

  it("never serializes one partner's picks to the other", async () => {
    const { t1, t2 } = await couple(4);
    await duelAll(t1, (a, b) => (a < b ? a : b));
    const json = JSON.stringify(await getDuelsView(t2));
    expect(json).not.toContain("|");
    expect(json).not.toContain(t1);
  });

  it("makes a pick final — re-picking a duel can't shift the order", async () => {
    const { t1, t2 } = await couple(4);
    await duelAll(t1, (a) => a);
    const done = await duelAll(t2, (a) => a);
    const [a, b] = duelPairs(ids(4))[0];
    expect(await recordPick(t1, a, b, b)).toBe("invalid");
    expect((await getDuelsView(t1))!.order).toEqual(done.order);
  });

  it("never writes on a read", async () => {
    const { t1 } = await couple(4);
    const set = vi.spyOn(getStore(), "set");
    await getDuelsView(t1);
    expect(set).not.toHaveBeenCalled();
  });

  it("a new match on a big list prompts duels, never slips into the order", async () => {
    const { id, t1, t2 } = await couple(16);
    await duelAll(t1, (a) => a);
    await duelAll(t2, (a) => a);
    await landMatches(id, [card("n99")]);
    const v = (await getDuelsView(t1))!;
    expect(v.order!.ids).not.toContain("n99");
    expect(v.remaining.flat().some((n) => n.id === "n99")).toBe(true);
  });

  it("rejects a pair that isn't a current duel", async () => {
    const { t1 } = await couple(4);
    const [a, b] = duelPairs(ids(4))[0];
    expect(await recordPick(t1, a, "nope", a)).toBe("invalid");
    expect(await recordPick(t1, a, b, "nope")).toBe("invalid");
    expect(await recordPick("bad-token", a, b, a)).toBeNull();
  });

  it("new matches reopen duels and count as new", async () => {
    const { id, t1, t2 } = await couple(4);
    await duelAll(t1, (a) => a);
    await duelAll(t2, (a) => a);
    await landMatches(id, [card("n9")]);
    const v = (await getDuelsView(t1))!;
    expect(v.newCount).toBe(1);
    expect(v.remaining.length).toBeGreaterThan(0);
    expect(v.order).not.toBeNull(); // the last order stays until both re-duel
  });
});
