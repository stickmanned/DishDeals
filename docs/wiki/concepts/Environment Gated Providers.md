---
title: "Environment Gated Providers"
type: concept
tags: [configuration, providers, safety]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["convex/convex.config.ts", "convex/reelActions.ts", "convex/extract.ts", "convex/geocode.ts", "convex/trial.ts"]
---

# Environment Gated Providers

## Overview

Every call to an external/paid provider (Gemini video, Gemini image, Gemini text, Nominatim, Geoapify, the retired Instagram-scraping API) is gated behind an explicit `*_USAGE_AUTHORIZED === "true"` environment flag, checked **separately from** whether the corresponding API key is configured. A key being present never implies permission to use it — both must be true, and the check happens before any network call or byte is read.

## How It Works

- `convex/convex.config.ts` declares the full typed `env` map Convex expects, including pairs like `REEL_MEDIA_USAGE_AUTHORIZED`/`GEMINI_API_KEY`, `IMAGE_PROVIDER_USAGE_AUTHORIZED`/`GEMINI_IMAGE_MODEL`, `GEOCODE_USAGE_AUTHORIZED`/`GEOCODE_USER_AGENT`, `REEL_PROVIDER_USAGE_AUTHORIZED`/`SCRAPECREATORS_API_KEY`, and the teammate-workflow set `WORKFLOW_PROVIDER_USAGE_AUTHORIZED`/`GEMINI_MODEL`/`GEOAPIFY_API_KEY`.
- Each call site has its own small `configured()`-style guard that fails closed with a typed, user-safe error (e.g. `convex/reelActions.ts#configuredForSupplied()` throws `RetrievalError("CONFIGURATION", ...)`; `convex/extract.ts:51` throws `ConvexError({code: "CONFIGURATION", ...})`; `lib/workflow/workflow.ts#liveDependencies()` throws if `GEMINI_API_KEY`/`GEOAPIFY_API_KEY`/the usage flag/`GEMINI_MODEL` are missing).
- `convex/trial.ts#status` (a public query) exposes only the **boolean readiness** of each integration (`geminiConfigured`, `geoapifyConfigured`, `reelsConfigured`) to the client — never the underlying key or flag value — so the UI can show "not configured" states honestly without leaking configuration.

## Where It's Used

- `convex/reelActions.ts` — `configured()`/`configuredForSupplied()`.
- `convex/extract.ts:51` — inline gate before any image byte is read.
- `convex/geocode.ts` — `GEOCODE_USAGE_AUTHORIZED`/`GEOCODE_USER_AGENT`.
- `lib/workflow/workflow.ts#providerUsageAuthorized()`/`liveDependencies()` — the teammate-workflow pipeline's single choke point, also gating `lib/workflow/config.ts`'s `searchProviders()`/`comparisonProvider()`.
- `convex/trial.ts` — the client-facing readiness summary.

## How to Extend This

Adding a new paid-provider integration should: declare its key *and* its own `*_USAGE_AUTHORIZED` flag in `convex/convex.config.ts`'s `env` map; write a small `configured()`-style guard checked before any network call; throw a typed, sanitized error (never leak the raw provider error/response, per `lib/workflow/network.ts`'s explicit "never expose secrets in error messages" convention) on failure; optionally surface a boolean (not the raw values) via `convex/trial.ts` if the UI needs to show a readiness state.

## Sources

- [[Source - Project Process Docs]] — this pattern exists specifically so the project never implies a live provider ran when it was actually disabled/unconfigured.
