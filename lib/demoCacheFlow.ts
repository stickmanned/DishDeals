// Browser-safe glue between the reviewed demo cache (lib/demoCache.ts) and the ImageDraftFlow controller (T-16B).
//
// Opt-in replay of a GENUINE saved capture: nothing here fetches anything unless the controller calls `load` after the
// user switched replay on and asked for analysis. It never creates fixtures, receipts or storage ids, and a hit is the
// same validated ExtractOutcome a live run returns, only labeled as cached. No React, window or Convex access.

import { currentPromptVersion, demoMaterial, loadDemoFixture, type DemoCacheResult, type DemoKey, type DemoMaterial } from "./demoCache";

/**
 * Default adapter for the page: the real same-origin loader with its own size and time bounds, as the two optional
 * FlowDeps functions (spread into the page's deps). Nothing is fetched until the controller calls `loadDemo`.
 */
export function browserDemoCache(fetcher?: typeof fetch): {
  demoPromptVersion: () => Promise<string>;
  loadDemo: (key: DemoKey, options: { signal: AbortSignal }) => Promise<DemoCacheResult>;
} {
  return {
    demoPromptVersion: currentPromptVersion,
    loadDemo: (key, { signal }) => loadDemoFixture(key, { signal, ...(fetcher ? { fetch: fetcher } : {}) }),
  };
}

/** Outer deadline the controller applies even to an injected loader that never settles (the loader's own is 3 s). */
export const DEMO_LOOKUP_DEADLINE_MS = 4000;

type ByteSource = { arrayBuffer?: () => Promise<ArrayBuffer>; type?: string };
async function bytesOf(blob: ByteSource): Promise<Uint8Array> {
  if (typeof blob?.arrayBuffer !== "function") throw new Error("Bytes unavailable.");
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Hash the ORIGINAL picked file and every prepared upload (bytes + MIME, in upload order). Returns null if any of it
 * cannot be read or is outside the cache's bounds; the caller then simply has no cache for this source. Only hashes
 * are kept, never the bytes.
 */
export async function buildDemoMaterial(original: ByteSource, prepared: ByteSource[]): Promise<DemoMaterial | null> {
  try {
    return await demoMaterial(await bytesOf(original), await Promise.all(prepared.map(async blob => ({ bytes: await bytesOf(blob), mimeType: String(blob.type ?? "").toLowerCase() }))));
  } catch {
    return null;
  }
}

/** What an offer records when it came from a saved capture. Absent on live analysis. */
export interface CachedOrigin {
  capturedAt: string;
  evidenceReference: string;
  model: string;
}

export const CACHED_COPY = {
  toggle: "Replay a saved demo capture instead of calling the live service",
  toggleHelp:
    "Off by default. When on, we check this device's same-origin demo captures for an exact match of your image (or the 4 frames of a recording) and details. If none matches, the normal live analysis runs once.",
  checking: "Checking for a saved demo capture…",
  badge: "Saved demo capture (cached), not a live analysis",
} as const;

/** One honest line for a cached offer. A capture's metadata is an operator assertion, not proof. */
export function cachedOfferNote(origin: CachedOrigin, source: "image" | "recording"): string {
  const when = /^\d{4}-\d{2}-\d{2}/.test(origin.capturedAt) ? origin.capturedAt.slice(0, 10) : "an earlier date";
  const what = source === "recording" ? "the 4 frames taken from your recording (no audio or video was analyzed)" : "this exact image";
  return `Replayed from a saved capture of ${what}, recorded ${when} with model ${origin.model}. This did not call the live service now, and every field still needs your review.`;
}
