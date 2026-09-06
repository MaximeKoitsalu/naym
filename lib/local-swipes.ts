/**
 * The one place that names the client-side swipe-progress storage key —
 * shared so a security-relevant format (see the T3 same-device privacy fix
 * in components/Handoff.tsx) can't drift out of sync between call sites.
 */
export const swipesLocalKey = (token: string, round: 1 | 2) =>
  `naym:swipes:${token}:r${round}`;
