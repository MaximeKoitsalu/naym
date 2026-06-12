import { Redis } from "@upstash/redis";

/*
  Storage adapter. Upstash when configured; in-memory Map otherwise (dev/test).

  Key layout — each writer owns its key, so partners never clobber each other:
    tok:{token}            → { id, role }            (TTL 30d)
    sess:{id}:meta         → SessionMeta JSON        (TTL 30d, refreshed on write)
    sess:{id}:swipes:A|B   → Swipe[] JSON            (TTL 30d)
    sess:{id}:r2:A|B       → Swipe[] JSON (round 2)  (TTL 30d)
    events:log             → append-only list, NO TTL (the kill metric outlives sessions)
*/

export const SESSION_TTL_S = 30 * 24 * 60 * 60;

export interface Store {
  get<T>(key: string): Promise<T | null>;
  /** Sets value and refreshes TTL (except durable keys, which never expire). */
  set(key: string, value: unknown, ttlS?: number): Promise<void>;
  /** Durable append — no TTL, survives session expiry. */
  append(key: string, value: unknown): Promise<void>;
  range(key: string): Promise<unknown[]>;
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
}

declare global {
  // eslint-disable-next-line no-var
  var __naymStore: Store | undefined;
}

export function getStore(): Store {
  if (globalThis.__naymStore) return globalThis.__naymStore;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const store =
    url && token
      ? new UpstashStore(new Redis({ url, token }))
      : new MemoryStore();
  globalThis.__naymStore = store;
  return store;
}
