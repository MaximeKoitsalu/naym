import { otherPartner, type Partner } from "./types";

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

function readHolders(): Holders {
  try {
    return JSON.parse(localStorage.getItem(HOLDERS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeHolders(h: Holders) {
  try {
    localStorage.setItem(HOLDERS_KEY, JSON.stringify(h));
  } catch {
    /* private mode */
  }
}

/** The last link opened here, and — when `partner` is known — that Partner's own link. */
export function remember(token: string, partner?: Partner) {
  try {
    localStorage.setItem(LOCAL_KEY, `/shortlist/${token}`);
  } catch {
    /* private mode — the link still works, it just isn't remembered */
  }
  if (partner) writeHolders({ ...readHolders(), [partner]: token });
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
  return readHolders()[otherPartner(partner)] ?? null;
}

/** After a reissue: a shared phone holding the dead link gets the fresh one instead. */
export function replaceHolder(partner: Partner, fresh: string) {
  const h = readHolders();
  if (!h[partner]) return;
  writeHolders({ ...h, [partner]: fresh });
}
