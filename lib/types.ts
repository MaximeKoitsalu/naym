export type NameCard = {
  id: string;
  name: string;
  say: string;
  origin: string;
  meaning: string;
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
  | "handoff_mode_selected";

export type RevealPayload = {
  /** Mutual likes only — raw per-role arrays NEVER serialize off the server. */
  matches: NameCard[];
  deckSize: number;
  /** Round-2 reveal, present only when round 2 completed. */
  round2?: { matches: NameCard[]; deckSize: number };
  /** True when round 2 can be offered (zero matches, non-empty union). */
  round2Available: boolean;
  round2Armed: boolean;
};
