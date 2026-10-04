#!/usr/bin/env node
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Inspection utility to verify MapLibre worker asset packaging
 * across the child map-component distribution and Next.js static build.
 * Strictly asserts presence and byte count parity between child and production builds.
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
  const distWorkers = distFiles.filter(f => f.startsWith("maplibre-gl-worker") && f.endsWith(".js"));
  const distWorker = distWorkers.length === 1 ? distWorkers[0] : undefined;
  if (!distWorker) {
    console.error("FAIL: No maplibre-gl-worker-*.js found in map-component/dist/assets.");
    process.exit(1);
  }

  const distWorkerPath = join(distAssetsDir, distWorker);
  const distWorkerStat = statSync(distWorkerPath);
  console.log(`PASS: Found child worker asset: ${distWorker} (${distWorkerStat.size} bytes)`);

  if (distWorkerStat.size < 100000) {
    console.error(`FAIL: Child worker asset is unexpectedly small (${distWorkerStat.size} bytes).`);
    process.exit(1);
  }

  // 2. Strictly verify Next.js production build media worker
  const nextMediaDir = join(root, ".next", "static", "media");
  if (!existsSync(nextMediaDir)) {
    console.error("FAIL: Next.js static media directory (.next/static/media) does not exist. Run npm run build first.");
    process.exit(1);
  }

  const nextFiles = readdirSync(nextMediaDir);
  const nextWorkers = nextFiles.filter(f => f.startsWith("maplibre-gl-worker") && f.endsWith(".js"));
  const nextWorker = nextWorkers.length === 1 ? nextWorkers[0] : undefined;
  if (!nextWorker) {
    console.error("FAIL: Expected production worker asset (maplibre-gl-worker-*.js) not found in .next/static/media.");
    process.exit(1);
  }

  const nextWorkerPath = join(nextMediaDir, nextWorker);
  const nextWorkerStat = statSync(nextWorkerPath);
  console.log(`PASS: Found Next.js static media worker: ${nextWorker} (${nextWorkerStat.size} bytes)`);

  if (nextWorkerStat.size !== distWorkerStat.size || !readFileSync(nextWorkerPath).equals(readFileSync(distWorkerPath))) {
    console.error(
      `FAIL: Worker byte count mismatch! Expected ${distWorkerStat.size} bytes from child build, but found ${nextWorkerStat.size} bytes in .next/static/media.`
    );
    process.exit(1);
  }

  // Verify non-empty and valid JS content
  const content = readFileSync(nextWorkerPath, "utf8");
  if (content.length === 0) {
    console.error("FAIL: Emitted Next.js worker asset is empty.");
    process.exit(1);
  }
  console.log(
    `PASS: Worker bytes verified (${content.length} characters). Next.js serves real worker bytes at /_next/static/media/${nextWorker}`
  );

  if (!readFileSync(join(root, "map-component/dist/index.js"), "utf8").includes(`assets/${distWorker}`)) {
    console.error("FAIL: Child bundle does not reference the actual worker asset."); process.exit(1);
  }
  const chunks = join(root, ".next/static/chunks");
  const referenced = readdirSync(chunks, {recursive: true}).filter(f => f.endsWith(".js")).some(f => readFileSync(join(chunks, f), "utf8").includes(`/_next/static/media/${nextWorker}`));
  if (!referenced) { console.error("FAIL: No production chunk references the real emitted worker URL."); process.exit(1); }
  console.log("PASS: Child and production chunks reference the verified worker assets.");
  console.log("All MapLibre asset packaging checks passed.");
}

verifyMapAssets();
