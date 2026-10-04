import type { NextConfig } from "next";

// Headers for the share-target service worker script only (T-13B). public/sw.js must always be revalidated
// (so a fixed worker reaches phones promptly), served as JavaScript, never sniffed, and limited by a strict
// CSP. This adds no offline or cache behavior and touches no other route, so Next's defaults and the auth,
// provider and layout boundaries are unchanged. (Next evaluates `headers()` before /public files.)
// Deal photos are served from this deployment's Convex storage (`/api/storage/<id>`). next/image only loads a
// remote host that is listed here, so without this every deal photo fails with INVALID_IMAGE_OPTIMIZE_REQUEST.
// Exactly one host and path, taken from the same public URL the app already uses: no wildcards, so the optimizer
// cannot be used to proxy anyone else's storage.
function convexStoragePatterns(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_CONVEX_URL ?? "");
    if (url.protocol !== "https:") return [];
    return [{ protocol: "https", hostname: url.hostname, pathname: "/api/storage/**" }];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  images: { remotePatterns: convexStoragePatterns() },
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
