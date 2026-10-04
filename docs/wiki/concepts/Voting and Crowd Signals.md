---
title: "Voting and Crowd Signals"
type: concept
tags: [voting, deals]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["convex/votes.ts", "convex/schema.ts"]
---

# Voting and Crowd Signals

## Overview

A simple crowd-sourced "is this deal still on?" signal: one vote per user per deal, toggleable between `"still_on"` and `"expired"`, tallied as denormalized counters directly on the `deals` row.

## How It Works

- `convex/votes.ts#cast` (the only function in this area) derives the voter's identity from auth — never trusts a client-supplied user id.
- Looks up any existing vote via the `by_deal_user` index (`.unique()` — throws if duplicate rows already exist, rather than picking one).
- Validates the deal's current counters are safe, non-negative integers (`validCounter`) before touching them; refuses to proceed if they're already corrupt rather than silently "fixing" them.
- Re-casting the same value is idempotent (no-op, no error). Switching value decrements the old counter field and increments the new one in the same transaction as updating the `votes` row — a mutation is one transaction, so a rejected cast can never leave a partial counter change.
- Never writes a counter that would exceed `Number.isSafeInteger` range.

## Where It Lives

- `convex/votes.ts#cast` — the sole mutation.
- `convex/schema.ts:80-84` — `votes` table (`dealId`, `userId`, `value`, indexed `by_deal_user`).
- `convex/schema.ts:67-68` — `deals.stillOnCount`/`expiredCount`, the denormalized tallies.
- `convex/deals.ts#get` (`viewerVote` field) — surfaces the caller's own vote back to the UI; see [[Canonical Deal Publishing]].

## Sources

- [[Canonical Deal Publishing]]
