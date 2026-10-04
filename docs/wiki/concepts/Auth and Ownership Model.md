---
title: "Auth and Ownership Model"
type: concept
tags: [auth, convex-auth, ownership]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["convex/auth.ts", "convex/reels.ts", "convex/workflow/auth.ts", "convex/deals.ts"]
---

# Auth and Ownership Model

## Overview

Convex Auth (`@convex-dev/auth`) with two providers — Password (primary) and Anonymous (guest, "restored additively for the published guest history," `convex/auth.ts`). On top of that single auth system, **two different ownership idioms** coexist, one per pipeline family, because they were authored independently.

## How It Works

**Idiom A — `reels.ts`-style (typed, existence-hiding):**

```ts
async function owner(ctx) { /* getAuthUserId(ctx) or throw ConvexError("Not signed in") */ }
async function owned(ctx, itemId) { /* loads item, checks item.ownerId === owner, else "Item not found" */ }
```

Used by `convex/reels.ts`, `convex/deals.ts` (`authorWithProfile`), `convex/votes.ts`, `convex/users.ts`. Ownership comparisons are against a typed `Id<"users">`. Critically, a non-owner accessing someone else's item gets **"Item not found," never "forbidden"** — existence is hidden, not just access (proven in `convex/reels.test.ts`'s auth/ownership tests).

**Idiom B — `workflow/auth.ts`-style (string-subject):**

```ts
export function requireOwner(ctx) {
  const identity = ctx.auth.getUserIdentity() or throw ConvexError(...)
  return identity.subject.split("|")[0]; // the stable userId, not userId|sessionId
}
```

Used throughout `convex/workflow/*.ts` (`jobs.ts`, `deals.ts`, `compare.ts`, `search.ts`). `owner` is stored as a plain `string` on `workflowJobs`/`workflowDeals`, not a typed `Id<"users">` — this is a deliberate, independent convention from the Reel/canonical idiom, not a bug, chosen so ownership survives re-login/new devices by keying off the stable subject rather than the full session token.

## Where It Lives

- `convex/auth.ts`, `convex/auth.config.ts` — provider setup and JWT config.
- `convex/reels.ts:13-22` — Idiom A helpers.
- `convex/workflow/auth.ts` — Idiom B's `requireOwner`.
- `convex/deals.ts:102` — `authorWithProfile`, Idiom A plus an additional "must have a profile" requirement.

## Key Details

- These two idioms never need to interoperate — each pipeline's tables and functions use only their own idiom consistently. A wiki reader adding a new function should match the idiom already used by the file they're editing, not invent a third one.
- Publishing a canonical deal requires **both** a signed-in user and an existing `profiles` row (`deals.ts#authorWithProfile`) — sign-in alone is not sufficient.

## Sources

- [[Reel Ingestion Workflow]], [[Teammate Workflow Pipeline]], [[Canonical Deal Publishing]]
