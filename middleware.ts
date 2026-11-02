import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { overLimit, ruleFor } from "@/lib/rate-limit";

/*
  Rate limits for the API: every write, plus the keepsake render. Production
  only — dev and the e2e suite run on an in-memory store from one IP.
*/
export async function middleware(req: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();
  const path = req.nextUrl.pathname;
  if (req.method === "GET" && path !== "/api/keepsake") return NextResponse.next();
  // Vercel sets x-real-ip to the client address; clients can't override it there.
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rule = ruleFor(path);
  try {
    if (await overLimit(getStore(), rule, ip)) {
      return NextResponse.json(
        { error: "too many requests" },
        { status: 429, headers: { "retry-after": String(rule.windowS) } },
      );
    }
  } catch {
    // The limiter must never take the app down: if the store is unreachable, let it through.
  }
  return NextResponse.next();
}

// Node, not Edge: it then runs in fra1 with the functions, next to the database (vercel.json).
export const config = { matcher: "/api/:path*", runtime: "nodejs" };
