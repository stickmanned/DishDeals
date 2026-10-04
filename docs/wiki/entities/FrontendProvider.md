---
title: "FrontendProvider"
type: entity
tags: [frontend, context, state]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["components/frontend/FrontendProvider.tsx"]
---

# FrontendProvider

## Overview

The central app-state context for the **preview** UI tree (`components/frontend/*`), exposing a single `useFrontend()` hook. The most architecturally significant file in that tree, since it's the composition point for [[Three Mode Runtime]].

## Location

`components/frontend/FrontendProvider.tsx` — main export `FrontendProvider` at line 339; the mode decision (`frontendConnection(...)`) at line 347.

## Details

- Calls `lib/frontendConnection.ts#frontendConnection(process.env.NEXT_PUBLIC_CONVEX_URL, url)` once to decide the runtime mode, then composes one of:
  - `CanonicalRuntime` — real Convex auth + `api.users.me`, used when a canonical backend is configured.
  - `LiveRuntime` — the legacy standalone [[Teammate Workflow Pipeline]] client (`lib/frontend/workflow.ts`).
  - a local-only `Runtime` — pure in-memory state (votes, previewPosts, drafts, profile), used in [[Three Mode Runtime]]'s `"preview"` case.
- All three expose the same shape through `useFrontend()`, so the rest of the preview component tree (`Discover.tsx`, `Post.tsx`, `Profile.tsx`, etc.) doesn't branch on mode itself.

## Related Entities

- [[Three Mode Runtime]] — the decision this file consumes.
- [[Preview vs Canonical UI]] — why this provider's tree exists alongside the canonical one.

## Sources

- [[Three Mode Runtime]], [[Preview vs Canonical UI]]
