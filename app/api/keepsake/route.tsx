import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getReveal, logEvent, resolveToken } from "@/lib/session";

export const runtime = "nodejs";

/*
  The keepsake — a server-rendered 4:5 PNG (design review D12).
  The server draws, the client downloads: renders identically in every
  webview, immune to html-to-canvas font quirks. Same data as the reveal —
  matches only, never raw swipes.
*/

const W = 1080;
const H = 1350;

// Bundled with the app (Fraunces SemiBold, SIL OFL), so a cold render never waits on Google.
let frauncesCache: Promise<ArrayBuffer | null> | null = null;
function loadFraunces(): Promise<ArrayBuffer | null> {
  frauncesCache ??= readFile(join(process.cwd(), "assets/fraunces-600.ttf"))
    .then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
    .catch(() => null); // missing file — render with default serif
  return frauncesCache;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return new Response("missing token", { status: 400 });
  const resolved = await resolveToken(token);
  if (!resolved) return new Response("expired", { status: 404 });
  // Rendering the keepsake is not a reveal view — keep the funnel honest.
  const reveal = await getReveal(token, { logView: false });
  if (!reveal) return new Response("not ready", { status: 409 });

  const final = reveal.round2 ?? reveal;
  const matches = final.matches;
  await logEvent(resolved.meta.id, "keepsake_saved", resolved.role);

  const fraunces = await loadFraunces();
  const date = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const nameSize = matches.length <= 2 ? 132 : matches.length <= 4 ? 104 : 72;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#faf7f2",
          color: "#221f1a",
          padding: 96,
          fontFamily: fraunces ? "Fraunces" : "serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 40, color: "#6f675c" }}>
            {`out of ${final.deckSize} names…`}
          </div>
          <div style={{ fontSize: 56, marginTop: 12 }}>
            {`we both chose ${matches.length === 1 ? "one" : matches.length}`}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: matches.length > 4 ? 18 : 36,
          }}
        >
          {matches.slice(0, 6).map((m) => (
            <div key={m.id} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: nameSize, fontWeight: 600, color: "#a85537" }}>
                {m.name}
              </div>
              <div style={{ fontSize: 32, color: "#6f675c" }}>{m.meaning}</div>
            </div>
          ))}
          {matches.length > 6 && (
            <div style={{ fontSize: 36, color: "#6f675c" }}>
              {`…and ${matches.length - 6} more`}
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div style={{ fontSize: 36, color: "#6f675c" }}>{date}</div>
          <div style={{ fontSize: 48, fontWeight: 600 }}>naym</div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: fraunces
        ? [{ name: "Fraunces", data: fraunces, weight: 600 as const }]
        : undefined,
    },
  );
}
