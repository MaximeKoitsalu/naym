"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NameCard, Swipe } from "@/lib/types";
import SwipeDeck from "./SwipeDeck";
import InviteLanding from "./InviteLanding";
import Handoff from "./Handoff";
import Waiting from "./Waiting";
import Reveal from "./Reveal";
import { ExpiredScreen, LoadingScreen } from "./Screens";

type StateView = {
  role: "A" | "B";
  deck: NameCard[];
  deckTitle: string;
  ownSwipes: Swipe[];
  ownDone: boolean;
  otherDone: boolean;
  bothDone: boolean;
  bStarted: boolean;
  inviteToken: string | null;
  round2: {
    deck: NameCard[];
    ownSwipes: Swipe[];
    ownDone: boolean;
    otherDone: boolean;
  } | null;
};

const localKey = (token: string, round: 1 | 2) => `naym:swipes:${token}:r${round}`;

function readLocal(token: string, round: 1 | 2): Swipe[] {
  try {
    const raw = localStorage.getItem(localKey(token, round));
    return raw ? (JSON.parse(raw) as Swipe[]) : [];
  } catch {
    return [];
  }
}

export default function SessionClient({ token }: { token: string }) {
  const [view, setView] = useState<StateView | null>(null);
  const [expired, setExpired] = useState(false);
  const [bLandingDismissed, setBLandingDismissed] = useState(false);
  const pollStart = useRef(Date.now());

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/state?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    if (res.status === 404) {
      setExpired(true);
      return null;
    }
    const v = (await res.json()) as StateView;
    setView(v);
    return v;
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Waiting-state poll: 5s, backing off to 15s after 5 minutes.
  const waiting =
    view !== null &&
    ((view.ownDone && !view.otherDone) ||
      (view.round2 !== null && view.round2.ownDone && !view.round2.otherDone));
  useEffect(() => {
    if (!waiting) return;
    const interval = Date.now() - pollStart.current > 5 * 60_000 ? 15_000 : 5_000;
    const t = setInterval(refresh, interval);
    return () => clearInterval(t);
  }, [waiting, refresh]);

  /**
   * Sync protocol (eng review D2/D7): localStorage is the source of truth
   * mid-deck; every sync PUTs the FULL array (idempotent, self-healing);
   * the server's monotonic guard rejects shrinking writes, so an empty
   * webview localStorage can never wipe real progress.
   */
  const syncSwipes = useCallback(
    async (swipes: Swipe[], round: 1 | 2, awaitIt = false) => {
      try {
        localStorage.setItem(localKey(token, round), JSON.stringify(swipes));
      } catch {
        /* private mode — server still gets the array */
      }
      const put = fetch("/api/swipes", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, swipes, round }),
      }).catch(() => null);
      if (awaitIt) {
        await put;
        await refresh();
      }
    },
    [token, refresh],
  );

  if (expired) return <ExpiredScreen />;
  if (!view) return <LoadingScreen />;

  // Hydrate-then-merge: adopt whichever swipe state is longer.
  const merged = (round: 1 | 2, server: Swipe[]) => {
    const local = readLocal(token, round);
    return local.length > server.length ? local : server;
  };

  // ---- Round 2 flow (armed by either partner after a zero-match reveal) ----
  if (view.round2 && !view.round2.ownDone) {
    return (
      <SwipeDeck
        key="round2"
        deck={view.round2.deck}
        initial={merged(2, view.round2.ownSwipes)}
        round={2}
        onSync={(s, done) => syncSwipes(s, 2, done)}
      />
    );
  }
  if (view.round2 && view.round2.ownDone && !view.round2.otherDone) {
    return <Waiting round2 />;
  }

  // ---- Both done → the reveal (round 2 results included server-side) ----
  if (view.bothDone) {
    return <Reveal token={token} role={view.role} onArmedRound2={refresh} />;
  }

  // ---- Partner B: passive landing until the explicit start tap ----
  if (view.role === "B" && !view.bStarted && !bLandingDismissed) {
    return (
      <InviteLanding
        deckSize={view.deck.length}
        deckTitle={view.deckTitle}
        onStart={async () => {
          await fetch("/api/start", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token }),
          }).catch(() => null);
          setBLandingDismissed(true);
        }}
      />
    );
  }

  // ---- Own deck not finished → swipe ----
  if (!view.ownDone) {
    return (
      <SwipeDeck
        key="round1"
        deck={view.deck}
        initial={merged(1, view.ownSwipes)}
        round={1}
        onSync={(s, done) => syncSwipes(s, 1, done)}
      />
    );
  }

  // ---- A done, B not: handoff (until B starts), then waiting ----
  if (view.role === "A" && view.inviteToken && !view.bStarted) {
    return <Handoff inviteToken={view.inviteToken} />;
  }
  return <Waiting />;
}
