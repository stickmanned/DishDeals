---
title: "Rate Limiting Patterns"
type: concept
tags: [rate-limit, abuse-prevention]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["convex/reels.ts", "convex/workflow/jobs.ts", "convex/workflow/search.ts", "convex/geocodeState.ts", "convex/dealUploads.ts"]
---

# Rate Limiting Patterns

## Overview

Two distinct rate-limiting shapes recur across the codebase, implemented independently in each location (no shared helper) rather than with a single generic limiter:

1. **Per-owner sliding-hour-window counter** — "at most N actions per owner per rolling hour."
2. **Single global durable gate** — "at most one request per second for the whole application," used only for the Nominatim geocoder.

## Where It's Used

| Table/row | Limit | Used by |
|---|---|---|
| `reelLimits` | 10 submissions/retries per owner per hour | `convex/reels.ts#rateLimit` (lines 23-30) |
| `workflowLimits` | 20 job submissions per owner per hour | `convex/workflow/jobs.ts#rateLimit` (lines 9-16) |
| `workflowSearchLimits` | 60 search **and** compare calls per owner per hour (shared bucket) | `convex/workflow/search.ts#reserve` (lines 23-30), also called from `convex/workflow/compare.ts#run` |
| `geocodeGate` | 1 request/second, app-wide (not per-owner) | `convex/geocodeState.ts#reserveSlot` — see [[Geocoding Providers]] |
| `dealUploads` (`by_owner_pending`) | 20 pending (unpublished, unexpired) image uploads per owner | `convex/dealUploads.ts#register` (lines 32-46) — a quota, not a time-window rate limit |

## How It Works

Every sliding-window implementation follows the same shape: a table keyed by `(ownerId, windowStart, count)`; the mutation reads the current window, resets `count` to 0 if `windowStart` has rolled over, otherwise increments and rejects if `count` would exceed the limit — all inside one Convex transaction, so concurrent requests from the same owner serialize correctly.

The global gate (`geocodeGate`) is structurally different: one durable row holds only `lastGrantedAt`; a request is granted only if at least `MIN_INTERVAL_MS` (1000ms) has passed since the last grant, and a backwards-reading clock fails closed (nothing granted, nothing changed) rather than risk a bypass — see [[Geocoding Providers]] for the full mechanism.

## How to Extend This

A new feature needing its own per-owner rate limit should add its own table (following the `{ownerId, windowStart, count}` shape) and its own small `rateLimit()`/`reserve()` function colocated with the feature's other Convex functions — this codebase deliberately does not have one shared "rate limiter" abstraction; each limiter is independently reviewable and testable.

## Sources

- [[Reel Ingestion Workflow]], [[Teammate Workflow Pipeline]], [[Geocoding Providers]]
