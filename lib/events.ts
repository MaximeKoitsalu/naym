import { getStore } from "./store";
import type { EventName, Role } from "./types";

export async function logEvent(
  /** Null for Shortlist events, which outlive every session. */
  sessionId: string | null,
  event: EventName,
  role?: Role,
  extra?: Record<string, unknown>,
) {
  // Durable key, no TTL — slow recruitment must never delete the kill metric.
  await getStore().append("events:log", {
    session: sessionId,
    event,
    role: role ?? null,
    ts: Date.now(),
    ...extra,
  });
}
