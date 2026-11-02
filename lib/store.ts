import { Redis } from "@upstash/redis";

/*
  Storage adapter. Upstash when configured; in-memory Map otherwise (dev/test).

  Key layout — each writer owns its key, so partners never clobber each other:
    tok:{token}            → { id, role }            (TTL 30d)
    sess:{id}:meta         → SessionMeta JSON        (TTL 30d)
    sess:{id}:swipes:A|B   → Swipe[] JSON            (TTL 30d)
    sess:{id}:r2:A|B       → Swipe[] JSON (round 2)  (TTL 30d)
    events:log             → append-only list, NO TTL (the kill metric outlives sessions)
    shortlist:{id}         → Shortlist JSON          NO TTL once matched (partner tokens, expecting, entries)
    ptok:{token}           → { shortlistId, partner } NO TTL (a Partner's Shortlist link; deleted on reissue)
    shortlist:{id}:seen    → string[] card ids       NO TTL (names in sessions both completed)
    shortlist:{id}:deal    → DealRecord              NO TTL (latest deck dealt from the Shortlist)
    shortlist:{id}:wishes  → Wish[] (≤ 25)           NO TTL (queued wishes; leave when their deck completes)
    rl:{rule}:{ip}:{window} → number                 TTL = the rule's window (rate limits, lib/rate-limit.ts)

  A Shortlist's keys (shortlist:*, ptok:*) expire like a session (30d) until its
  first match lands, then lose their TTL for good (lib/shortlist.ts lifetime).
    duels:{id}:1|2         → { pairKey: winnerId }  NO TTL (a Partner's duel picks — server-only)
    duels:{id}:order       → CombinedOrder JSON     NO TTL (least-misery order, both partners)
*/

export const SESSION_TTL_S = 30 * 24 * 60 * 60;

export interface Store {
  get<T>(key: string): Promise<T | null>;
  /** Sets value and refreshes TTL (except durable keys, which never expire). */
  set(key: string, value: unknown, ttlS?: number): Promise<void>;
  /** Durable append — no TTL, survives session expiry. */
  append(key: string, value: unknown): Promise<void>;
  range(key: string): Promise<unknown[]>;
  del(key: string): Promise<void>;
  /** Counter for rate limits: +1, expiring `ttlS` after its first hit. Returns the new count. */
  incr(key: string, ttlS: number): Promise<number>;
}

class MemoryStore implements Store {
  private kv = new Map<string, { v: unknown; exp: number | null }>();
  private lists = new Map<string, unknown[]>();

  async get<T>(key: string): Promise<T | null> {
    const e = this.kv.get(key);
    if (!e) return null;
    if (e.exp !== null && Date.now() > e.exp) {
      this.kv.delete(key);
      return null;
    }
    return e.v as T;
  }
  async set(key: string, value: unknown, ttlS?: number): Promise<void> {
    this.kv.set(key, { v: value, exp: ttlS ? Date.now() + ttlS * 1000 : null });
  }
  async append(key: string, value: unknown): Promise<void> {
    const l = this.lists.get(key) ?? [];
    l.push(value);
    this.lists.set(key, l);
  }
  async range(key: string): Promise<unknown[]> {
    return this.lists.get(key) ?? [];
  }
  async del(key: string): Promise<void> {
    this.kv.delete(key);
  }
  async incr(key: string, ttlS: number): Promise<number> {
    const n = ((await this.get<number>(key)) ?? 0) + 1;
    const e = this.kv.get(key);
    this.kv.set(key, { v: n, exp: e?.exp ?? Date.now() + ttlS * 1000 });
    return n;
  }
}

class UpstashStore implements Store {
  constructor(private r: Redis) {}
  async get<T>(key: string): Promise<T | null> {
    return (await this.r.get<T>(key)) ?? null;
  }
  async set(key: string, value: unknown, ttlS?: number): Promise<void> {
    if (ttlS) await this.r.set(key, JSON.stringify(value), { ex: ttlS });
    else await this.r.set(key, JSON.stringify(value));
  }
  async append(key: string, value: unknown): Promise<void> {
    await this.r.rpush(key, JSON.stringify(value));
  }
  async range(key: string): Promise<unknown[]> {
    return await this.r.lrange(key, 0, -1);
  }
  async del(key: string): Promise<void> {
    await this.r.del(key);
  }
  async incr(key: string, ttlS: number): Promise<number> {
    const n = await this.r.incr(key);
    if (n === 1) await this.r.expire(key, ttlS);
    return n;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __naymStore: Store | undefined;
}

export function getStore(): Store {
  if (globalThis.__naymStore) return globalThis.__naymStore;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  // A per-process Map in production splits sessions across instances —
  // every invite would read as expired. Fail loudly instead.
  if (!(url && token) && process.env.NODE_ENV === "production") {
    throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in production");
  }
  const store =
    url && token
      ? new UpstashStore(new Redis({ url, token }))
      : new MemoryStore();
  globalThis.__naymStore = store;
  return store;
}
