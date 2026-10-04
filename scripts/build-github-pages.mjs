import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/DishDeals";
if (!/^\/[A-Za-z0-9_-]+$/.test(basePath)) {
  throw new Error("Set NEXT_PUBLIC_BASE_PATH to the repository path, such as /DishDeals.");
}
if (!process.env.NEXT_PUBLIC_CONVEX_URL?.startsWith("https://")) {
  throw new Error("Set NEXT_PUBLIC_CONVEX_URL to the public HTTPS Convex deployment URL before building.");
}
execFileSync(process.execPath, [require.resolve("next/dist/bin/next"), "build"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_BASE_PATH: basePath },
});
// GitHub Pages must serve Next.js's _next directory without Jekyll processing.
writeFileSync("out/.nojekyll", "");
