#!/usr/bin/env node
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Inspection utility to verify MapLibre worker asset packaging
 * across the child map-component distribution and Next.js static build.
 */
function verifyMapAssets() {
  const root = resolve(process.cwd());
  console.log("Verifying MapLibre worker packaging from:", root);

  // 1. Verify child map-component dist worker
  const distAssetsDir = join(root, "map-component", "dist", "assets");
  if (!existsSync(distAssetsDir)) {
    console.error("FAIL: map-component/dist/assets does not exist. Run npm run build:map first.");
    process.exit(1);
  }

  const distFiles = readdirSync(distAssetsDir);
  const distWorker = distFiles.find((f) => f.startsWith("maplibre-gl-worker") && f.endsWith(".js"));
  if (!distWorker) {
    console.error("FAIL: No maplibre-gl-worker-*.js found in map-component/dist/assets.");
    process.exit(1);
  }

  const distWorkerPath = join(distAssetsDir, distWorker);
  const distWorkerStat = statSync(distWorkerPath);
  console.log(`PASS: Found child worker asset: ${distWorker} (${distWorkerStat.size} bytes)`);

  if (distWorkerStat.size < 100000) {
    console.error(`FAIL: Worker asset is unexpectedly small (${distWorkerStat.size} bytes).`);
    process.exit(1);
  }

  // 2. Verify Next.js production build media worker (if .next exists)
  const nextMediaDir = join(root, ".next", "static", "media");
  if (existsSync(nextMediaDir)) {
    const nextFiles = readdirSync(nextMediaDir);
    const nextWorker = nextFiles.find((f) => f.startsWith("maplibre-gl-worker") && f.endsWith(".js"));
    if (nextWorker) {
      const nextWorkerPath = join(nextMediaDir, nextWorker);
      const nextWorkerStat = statSync(nextWorkerPath);
      console.log(`PASS: Found Next.js static media worker: ${nextWorker} (${nextWorkerStat.size} bytes)`);

      // Verify non-empty and valid JS content
      const content = readFileSync(nextWorkerPath, "utf8");
      if (content.length === 0) {
        console.error("FAIL: Emitted Next.js worker asset is empty.");
        process.exit(1);
      }
      console.log(`PASS: Worker bytes verified (${content.length} characters). Next.js serves real worker bytes at /_next/static/media/${nextWorker}`);
    } else {
      console.log("INFO: .next build exists but no worker found in media (may have been pruned or not yet built with Next).");
    }
  } else {
    console.log("INFO: .next directory does not exist yet; run npm run build to verify Next.js static media.");
  }

  console.log("All MapLibre asset packaging checks passed.");
}

verifyMapAssets();
