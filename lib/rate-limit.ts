import type { Store } from "./store";

/*
  Per-IP limits on the public API (fixed windows). Generous for a couple
  swiping fast; tight where a request creates lasting data or is expensive.
*/
type Rule = { name: string; max: number; windowS: number };

const RULES: [RegExp, Rule][] = [
  [/^\/api\/session$/, { name: "session", max: 20, windowS: 600 }], // every call creates keys
  [/^\/api\/shortlist\/reissue$/, { name: "reissue", max: 10, windowS: 3600 }],
  [/^\/api\/keepsake$/, { name: "keepsake", max: 30, windowS: 600 }], // renders a PNG
];
const DEFAULT: Rule = { name: "api", max: 300, windowS: 60 };

export const ruleFor = (path: string) => RULES.find(([re]) => re.test(path))?.[1] ?? DEFAULT;

/** True once `ip` has used up `rule` in the current window. */
export async function overLimit(store: Store, rule: Rule, ip: string, now = Date.now()): Promise<boolean> {
  const window = Math.floor(now / 1000 / rule.windowS);
  return (await store.incr(`rl:${rule.name}:${ip}:${window}`, rule.windowS)) > rule.max;
}
