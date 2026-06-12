import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dynamic app by design: sessions, link tokens, server-side reveals.
  // Never set output:'export' — the blindness contract requires server compute.
};

export default nextConfig;
