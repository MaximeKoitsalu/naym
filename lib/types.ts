import type { DeckGender } from "./deck-manifest";

export type NameCard = {
  id: string;
  name: string;
  say: string;
  origin: string;
  meaning: string;
  /** As the name is used in this card's culture; absent on decks pinned before tags. */
  gender?: "girl" | "boy" | "unisex";
};

export type Swipe = { id: string; liked: boolean };

export type Role = "A" | "B";

/** How a couple moved from A's sealed deck to B's — logged via handoff_mode_selected. */
export const HANDOFF_MODES = ["link", "same-device"] as const;
export type HandoffMode = (typeof HANDOFF_MODES)[number];

/*
  Session state machine (see design doc):

      created
        │ A starts swiping
      a_swiping ──── full-array PUTs (monotonic guard)
        │ swipes.length == deck.length (derived)
      awaiting_b ─── A sees handoff → waiting; invite surfaced HERE only
        │ B taps "Start swiping" (slot binds on tap, never on GET)
      b_swiping
        │ derived completion
      complete ───── per-partner reveal (intersection computed server-side)
        ├─ matches ≥ 1 → keepsake
        └─ matches = 0 ┬─ union ≠ ∅ → round_2 (decoy-padded, either-partner opt-in)
                       └─ union = ∅ → warm ending
*/
export type SessionMeta = {
  id: string;
  deckId: string;
  /** Display title ("greek deck"); optional on pre-multi-deck sessions. */
  deckTitle?: string;
  deckVersion: string;
  /** Full deck snapshot pinned at creation — the session replays exactly this deck. */
  deck: NameCard[];
  contract: "love";
  createdAt: number;
  /** B slot binds on explicit start tap, never on GET (prefetch-safe). */
  bStartedAt: number | null;
  /** Round 2: armed by either partner after a zero-match reveal. */
  round2: { deck: NameCard[]; armedAt: number } | null;
  /** The couple's Shortlist and which Partner holds each role; absent on pre-Shortlist sessions. */
  shortlist?: { id: string; A: Partner; B: Partner };
};

export type Stage =
  | "a_swiping"
  | "awaiting_b" // A done; B not finished (B may be mid-deck)
  | "b_landing" // B's view before tapping start
  | "b_swiping"
  | "complete"
  | "round2_swiping"
  | "round2_waiting"
  | "expired";

export type EventName =
  | "session_created"
  | "invite_opened"
  | "swipe_progress"
  | "deck_completed"
  | "reveal_viewed"
  | "keepsake_saved"
  | "reveal_shared"
  | "round2_armed"
  | "handoff_mode_selected"
  | "shortlist_link_reissued";

export type RevealPayload = {
  /** Mutual likes only — raw per-role arrays NEVER serialize off the server. */
  matches: NameCard[];
  deckSize: number;
  /** Round-2 reveal, present only when round 2 completed. */
  round2?: { matches: NameCard[]; deckSize: number };
  /** True when round 2 can be offered (zero matches, non-empty union, enough decoys). */
  round2Available: boolean;
  round2Armed: boolean;
  /** The viewer's OWN Shortlist link token — never the other partner's. */
  shortlistToken: string | null;
};

/** A lasting identity on a Shortlist — distinct from the per-session roles A/B. */
export type Partner = 1 | 2;

/** A Match copied onto the Shortlist: full card snapshot, so it outlives its session. */
export type ShortlistEntry = NameCard & { matchedAt: number };

export type Shortlist = {
  id: string;
  /** Partner tokens; Partner 2 is minted on B's start tap, never on GET. */
  partners: Record<Partner, string | null>;
  /** Who the couple is naming — the default for later decks and the list filter. */
  expecting: DeckGender;
  entries: ShortlistEntry[];
};
