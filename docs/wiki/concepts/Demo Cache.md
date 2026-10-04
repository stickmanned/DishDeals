---
title: "Demo Cache"
type: concept
tags: [demo, offline, fixtures]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["lib/demoCache.ts", "lib/demoCacheFlow.ts", "fixtures/demo/"]
---

# Demo Cache

## Overview

An opt-in mechanism to replay a previously-captured real extraction result instead of calling Gemini live — for demoing the screenshot/flyer extraction flow ([[Screenshot and Flyer Extraction]]) without a configured API key, or without spending a real call on a known input. This is explicitly **not** a mock or fabricated result: it only replays genuine past model output, and the UI is required to be honest that it's cached.

## How It Works

- `lib/demoCache.ts#demoKey`/`demoKeyFromMaterial` derive a cache key from content hashes only — raw image/text bytes are never part of the key itself, only their SHA-256 digests (`demoMaterial`).
- `currentPromptVersion()` hashes the *current* `SYSTEM_PROMPT` + `RESPONSE_JSON_SCHEMA` + context-builder + the envelope contract string (`EXTRACT_ENVELOPE_CONTRACT = "extract-outcome-v1"`). **Any edit to the extraction prompt or schema invalidates every existing cached fixture** — a stale fixture can never be served as if it reflects the current model contract.
- `loadDemoFixture` fetches a same-origin static file (`/fixtures/demo/${sourceSha256}.json`), validates it with a strict Zod schema, and **re-validates** it through the same `lib/extractionDraft.ts#validateExtractOutcome` a live result would go through — a demo fixture gets no less scrutiny than a live Gemini response.
- `lib/demoCacheFlow.ts#buildDemoMaterial`/`CACHED_COPY`/`cachedOfferNote` wire this into the UI with explicit "this is an operator assertion, not proof" language — the cached badge is never allowed to read as equivalent to a verified live result.
- Integration point: `lib/imageDraftFlow.ts#lookupCache` (`ImageDraftFlow`'s method, see [[Screenshot and Flyer Extraction]]) is tried **before** falling back to a real `extract` call exactly once, under a bounded outer deadline (`DEMO_LOOKUP_DEADLINE_MS = 4000`) even if the injected loader misbehaves.

## Where It Lives

- `lib/demoCache.ts` — key derivation, prompt-version hashing, fixture loading/validation.
- `lib/demoCacheFlow.ts` — the `ImageDraftFlow`-facing adapter and UI copy.
- `fixtures/demo/` — the static fixture files served from `/fixtures/demo/`.
- `lib/imageDraftFlow.ts#lookupCache` — the call site.

## Sources

- [[Screenshot and Flyer Extraction]], [[Seeding and Fixtures]]
