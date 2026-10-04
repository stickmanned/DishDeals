import type { NextConfig } from "next";

// Headers for the share-target service worker script only (T-13B). public/sw.js must always be revalidated
// (so a fixed worker reaches phones promptly), served as JavaScript, never sniffed, and limited by a strict
// CSP. This adds no offline or cache behavior and touches no other route, so Next's defaults and the auth,
// provider and layout boundaries are unchanged. (Next evaluates `headers()` before /public files.)
const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
