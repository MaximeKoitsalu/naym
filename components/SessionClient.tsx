"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NameCard, Swipe } from "@/lib/types";
import SwipeDeck from "./SwipeDeck";
import InviteLanding from "./InviteLanding";
import Handoff from "./Handoff";
import Waiting from "./Waiting";
import Reveal from "./Reveal";
import { ExpiredScreen, LoadingScreen } from "./Screens";
import { swipesLocalKey } from "@/lib/local-swipes";

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

function readLocal(token: string, round: 1 | 2): Swipe[] {
  try {
    const raw = localStorage.getItem(swipesLocalKey(token, round));
    return raw ? (JSON.parse(raw) as Swipe[]) : [];
  } catch {
    return [];
  }
}

export default function SessionClient({ token }: { token: string }) {
  const [view, setView] = useState<StateView | null>(null);
  const [expired, setExpired] = useState(false);
  const [bLandingDismissed, setBLandingDismissed] = useState(false);

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

  // Waiting-state poll: 5s, backing off to 15s after 5 minutes of waiting.
  const waiting =
    view !== null &&
    ((view.ownDone && !view.otherDone) ||
      (view.round2 !== null && view.round2.ownDone && !view.round2.otherDone));
  useEffect(() => {
    if (!waiting) return;
    const since = Date.now();
    let stopped = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      t = setTimeout(
        async () => {
          await refresh().catch(() => null);
          if (!stopped) tick();
        },
        Date.now() - since > 5 * 60_000 ? 15_000 : 5_000,
      );
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(t);
    };
  }, [waiting, refresh]);

  /**
   * Sync protocol (eng review D2/D7): localStorage is the source of truth
   * mid-deck; every sync PUTs the FULL array (idempotent, self-healing);
   * the server's monotonic guard rejects shrinking writes, so an empty
   * webview localStorage can never wipe real progress.
   */
  const putQueue = useRef<Promise<unknown>>(Promise.resolve());
  const syncSwipes = useCallback(
    async (swipes: Swipe[], round: 1 | 2, awaitIt = false) => {
      try {
        localStorage.setItem(swipesLocalKey(token, round), JSON.stringify(swipes));
      } catch {
        /* private mode — server still gets the array */
      }
      // One PUT in flight at a time: overlapping PUTs race the server's
      // read-then-write and an older, shorter array can land last.
      const put = (putQueue.current = putQueue.current.then(() =>
        fetch("/api/swipes", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, swipes, round }),
        }).catch(() => null),
      ));
      if (awaitIt) {
        await put;
        await refresh();
      }
    },
    [token, refresh],
  );

  // Heal a lost final PUT: when local leads the server after a refresh,
  // re-send it (capped, backing off) — otherwise the deck sits on "Sealed"
  // forever and the partner never sees completion.
  const resyncs = useRef(0);
  useEffect(() => {
    if (!view || resyncs.current >= 5) return;
    const round = view.round2 ? 2 : 1;
    const server = view.round2 ? view.round2.ownSwipes : view.ownSwipes;
    const local = readLocal(token, round);
    if (local.length <= server.length) return;
    const t = setTimeout(() => syncSwipes(local, round, true), resyncs.current * 2000);
    resyncs.current++;
    return () => clearTimeout(t);
  }, [view, token, syncSwipes]);

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
    return <Handoff inviteToken={view.inviteToken} creatorToken={token} />;
  }
  return <Waiting />;
}
