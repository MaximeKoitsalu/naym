import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dynamic app by design: sessions, link tokens, server-side reveals.
  // Never set output:'export' — the blindness contract requires server compute.
  // The keepsake reads its font from disk; make sure it ships with that function.
  outputFileTracingIncludes: { "/api/keepsake": ["./assets/fraunces-600.ttf"] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // No framing: a hidden frame could trick a tap on "fresh link".
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          // Links carry tokens in their paths — never send them to another site.
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
