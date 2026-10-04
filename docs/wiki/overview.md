---
title: Overview
type: concept
tags: [overview, architecture]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["app/", "convex/", "lib/", "components/"]
---

# Overview

DishDeals (brand name "Dinedeals" in the iOS app) is a StormHacks hackathon project: a Next.js + Convex web app, packaged as an installable iOS app, for saving and sharing restaurant deals. The core loop is:

1. A user finds a deal — in an **Instagram Reel**, a **screenshot/flyer photo**, or by **screen-recording** a Reel — and shares or uploads it to DishDeals.
2. An AI model (Google Gemini) extracts structured deal fields (restaurant, price, valid days/hours, expiry, conditions) from the video/image/text, with literal quoted evidence for every field it fills in.
3. The user reviews and edits an **editable draft** — nothing the model produces is ever silently published. Uncertain fields (future-dated start, unsupported conditions, unverified currency) are flagged and must be explicitly resolved.
4. The user confirms the restaurant's location on a map (geocoded via Nominatim, or dragged by hand).
5. The confirmed deal publishes to a shared `deals` table and appears on everyone's map, with crowd up/down voting ("still on" / "expired") and optional Solana-devnet tipping for the person who found it.

## Why the codebase looks the way it does

This repo was built by a human (Harry, frontend) plus a team of coding agents (Claude Code, Gemini, Codex) working in parallel Git worktrees under a coordinator ("Northstar"), with two other humans (William — product, Pinyuan — maps) directing scope. See [[Source - Project Process Docs]] for that process in detail; three consequences show up directly in the code:

- **Two independent extraction pipelines that never share code.** The Reel-video pipeline (`convex/reels.ts` + `lib/reels/*`) and a separately-authored "teammate workflow" pipeline (`convex/workflow/*` + `lib/workflow/*`, for text/URL/image sources with its own search/compare features) were built by different agents against different early assumptions about the product, then integrated side by side rather than merged — see [[Reel Ingestion Workflow]] and [[Teammate Workflow Pipeline]]. A **third** canonical pipeline (`convex/extract.ts` + `lib/extractCore.ts`) was added later specifically for the screenshot/flyer/recording path and is the one the live UI actually uses for that case — see [[Screenshot and Flyer Extraction]].
- **A "preview" UI and a "canonical" UI coexist.** `components/frontend/*` is the original local-state-only example UI (never touches a real backend); `components/deals/`, `components/maps/`, `components/reels/Canonical*` are the real, Convex-backed implementations. `lib/frontendConnection.ts` decides at runtime which mode the app is in. See [[Preview vs Canonical UI]] and [[Three Mode Runtime]].
- **Every file is honest about what it has and hasn't proven.** Comments throughout the codebase distinguish "synthetic/in-memory test evidence" from "live provider" from "real iPhone acceptance" — e.g. `lib/demoCache.ts`'s cached-replay notices explicitly say a cached result is "an operator assertion, not proof." This isn't incidental style; it's a project-wide discipline enforced by [[AGENTS.md](../../AGENTS.md)] and the process docs.

## Architecture at a glance

- **Frontend:** Next.js App Router (`app/`), React 19, Tailwind v4. See the route table in [[codemap]].
- **Backend:** Convex (reactive database + serverless functions), Convex Auth (password + anonymous), `@convex-dev/workflow` for durable step-functions, `@convex-dev/geospatial` for nearby-deal queries.
- **AI:** Google Gemini, called directly via `@google/genai` (Reel path) or REST (`lib/workflow/gemini.ts`, `lib/extractCore.ts`), always with a strict Zod/JSON-Schema response contract and literal-evidence grounding.
- **Geocoding:** Nominatim/OpenStreetMap for the canonical path (rate-limited to 1 req/s app-wide, cached), Geoapify for the teammate-workflow path — see [[Geocoding Providers]].
- **Map rendering:** a local workspace package `@restaurant-deals/map` (`map-component/`) wrapping MapLibre GL (primary) with a Leaflet raster fallback — see [[Map Rendering]].
- **Native shell:** a SwiftUI/WKWebView iOS app (`ios/`) that loads the deployed web app and bridges an Instagram share extension's payload into it via an App Group file queue; a parallel Android PWA share-target (`public/sw.js`) does the analogous thing for Android.
- **Payments:** an entirely optional, devnet-only Solana tipping feature (`lib/tipRequest.ts`, `lib/tipReceipt.ts`, `components/TipQR.tsx`) — never a real-money path.

## Dominant code idiom

Almost every feature is built as a **pure, dependency-injected core** (no Convex/DOM/network imports, fully unit-testable) wrapped by a **thin Convex function or UI controller** that does only auth, env-var gating, and wiring. See [[Pure Core Plus Thin Convex Shell]]. This is why `lib/` is large relative to `convex/` and `components/` — most business logic and validation lives there, not in the Convex handlers.

## Where to go next

- [[codemap]] — concrete file-path navigation by task.
- [[glossary]] — project-specific terms and acronyms.
- [[Source - Project Process Docs]] — the multi-agent build process, ticket IDs, and current known-pending items (useful for "is X actually finished" questions this wiki can't answer from code alone).
