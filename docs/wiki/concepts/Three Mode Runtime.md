---
title: "Three Mode Runtime"
type: concept
tags: [runtime, configuration, frontend]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["lib/frontendConnection.ts", "components/frontend/FrontendProvider.tsx"]
---

# Three Mode Runtime

## Overview

The app can run against three (really four) different backend configurations, decided once at startup by a single pure function, and the choice cascades through the whole frontend's data layer.

## How It Works

`lib/frontendConnection.ts#frontendConnection(canonical, workflow)` returns one of:

- **`"canonical"`** — a real `NEXT_PUBLIC_CONVEX_URL` is configured. If a *different*-origin legacy workflow URL is also configured, this becomes **`"canonical_conflict"`** instead — the function explicitly refuses to let a canonical session accidentally talk to another deployment (file header comment: "never send a canonical session to another deployment").
- **`"standalone"`** — no canonical URL, but a legacy workflow-pipeline URL is configured. Used only by the old [[Teammate Workflow Pipeline]] standalone client (`lib/frontend/workflow.ts`).
- **`"preview"`** — no backend configured at all (or the human user is deliberately browsing example data). Everything is local state; see [[Preview vs Canonical UI]].

`origin()` (line 4) strictly validates each URL: must be `https:`, no credentials/query/hash, and root path only — a URL failing this check is treated as absent, not as a looser match.

`components/frontend/FrontendProvider.tsx:347` calls `frontendConnection(process.env.NEXT_PUBLIC_CONVEX_URL, url)` once, and composes one of three runtime implementations based on the result: `CanonicalRuntime` (real Convex auth + `api.users.me`), `LiveRuntime` (the legacy standalone workflow client), or a local-only `Runtime` (pure preview state: votes, previewPosts, drafts, profile) — all exposed through the same `useFrontend()` hook so the rest of the preview UI tree doesn't need to know which mode it's in.

## Where It Lives

- `lib/frontendConnection.ts` — the decision function.
- `components/frontend/FrontendProvider.tsx` — the composition point (`useFrontend()`), line 339 onward.

## Key Details

- This only governs the **preview UI tree** (`components/frontend/*`). The canonical UI (`components/deals/`, `components/maps/`, `components/reels/Canonical*`) always talks directly to the real Convex client from `components/ConvexClientProvider.tsx` and doesn't go through this switch at all — see [[Preview vs Canonical UI]] for why both trees exist.

## Sources

- [[Preview vs Canonical UI]]
