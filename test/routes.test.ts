import { expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as start } from "@/app/api/start/route";
import { POST as round2 } from "@/app/api/round2/route";

const garbage = () =>
  new NextRequest("http://localhost/api/x", { method: "POST", body: "not json" });

it("POST routes answer malformed bodies with 400, not a crash", async () => {
  expect((await start(garbage())).status).toBe(400);
  expect((await round2(garbage())).status).toBe(400);
});
