import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/event/route";
import { createSession } from "@/lib/session";
import { getStore } from "@/lib/store";

/*
  app/api/event/route.ts — the handoff_mode_selected event (T1).
*/

beforeEach(() => {
  (globalThis as { __naymStore?: unknown }).__naymStore = undefined;
});

function postEvent(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("handoff_mode_selected", () => {
  it("valid mode logs the event with extra.mode and returns 200", async () => {
    const { creatorToken, sessionId } = (await createSession())!;
    const res = await postEvent({
      token: creatorToken,
      event: "handoff_mode_selected",
      mode: "same-device",
    });
    expect(res.status).toBe(200);

    const events = (await getStore().range("events:log")) as {
      session: string;
      event: string;
      mode?: string;
    }[];
    const logged = events.filter(
      (e) => e.session === sessionId && e.event === "handoff_mode_selected",
    );
    expect(logged).toHaveLength(1);
    expect(logged[0].mode).toBe("same-device");
  });

  it("invalid mode returns 400 and logs nothing", async () => {
    const { creatorToken, sessionId } = (await createSession())!;
    const res = await postEvent({
      token: creatorToken,
      event: "handoff_mode_selected",
      mode: "carrier-pigeon",
    });
    expect(res.status).toBe(400);

    const events = (await getStore().range("events:log")) as {
      session: string;
      event: string;
    }[];
    expect(
      events.filter((e) => e.session === sessionId && e.event === "handoff_mode_selected"),
    ).toHaveLength(0);
  });

  it("missing mode returns 400 and logs nothing", async () => {
    const { creatorToken, sessionId } = (await createSession())!;
    const res = await postEvent({ token: creatorToken, event: "handoff_mode_selected" });
    expect(res.status).toBe(400);

    const events = (await getStore().range("events:log")) as {
      session: string;
      event: string;
    }[];
    expect(
      events.filter((e) => e.session === sessionId && e.event === "handoff_mode_selected"),
    ).toHaveLength(0);
  });
});
