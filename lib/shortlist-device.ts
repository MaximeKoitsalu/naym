import type { Partner } from "./types";

/*
  Which Shortlist links this device remembers. LOCAL_KEY is the last link
  opened (the landing's "Back to our Shortlist"); HOLDERS_KEY keeps each
  Partner's own link so one shared phone can hold both (#26). Every access
  is wrapped: private mode just means nothing is remembered.
*/

const LOCAL_KEY = "naym:shortlist";
const HOLDERS_KEY = "naym:shortlist:partners";

// shortcut: keyed by Partner number only, so a device holding two different
// couples' links would pair them; key by Shortlist id if that ever happens.
type Holders = Partial<Record<Partner, string>>;

function holders(): Holders {
  try {
    return JSON.parse(localStorage.getItem(HOLDERS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function save(h: Holders) {
  try {
    localStorage.setItem(HOLDERS_KEY, JSON.stringify(h));
  } catch {
    /* private mode */
  }
}

/** The last link opened here; `partner` is known on the Shortlist page, not the reveal. */
export function remember(token: string, partner?: Partner) {
  try {
    localStorage.setItem(LOCAL_KEY, `/shortlist/${token}`);
  } catch {
    /* private mode — the link still works, it just isn't remembered */
  }
  if (partner) save({ ...holders(), [partner]: token });
}

export function lastShortlist(): string | null {
  try {
    return localStorage.getItem(LOCAL_KEY);
  } catch {
    return null;
  }
}

/** The other Partner's link, when this device holds both. */
export function otherHolder(partner: Partner): string | null {
  return holders()[partner === 1 ? 2 : 1] ?? null;
}

/** After a reissue the other's stored link no longer opens. */
export function forgetHolder(partner: Partner) {
  const h = holders();
  delete h[partner];
  save(h);
}
