---
title: "Preview vs Canonical UI"
type: concept
tags: [frontend, architecture, routes]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["components/frontend/", "components/deals/", "components/maps/", "components/reels/", "app/"]
---

# Preview vs Canonical UI

## Overview

There are two parallel implementations of nearly every screen in this app: a **preview** tree (`components/frontend/*`) built early as an example/scaffold with local-only state, and a **canonical** tree (`components/deals/`, `components/maps/`, `components/reels/Canonical*`) that is the real, Convex-backed implementation the live app actually uses. This is a direct consequence of the project's parallel-development process ([[Source - Project Process Docs]]): the frontend scaffold and the backend were built concurrently by different people, then reconciled by keeping both rather than deleting the scaffold.

## Where It Lives

| Screen | Preview (local-only) | Canonical (real backend) |
|---|---|---|
| Deal feed | `components/frontend/Discover.tsx` + `DealCard.tsx` | `app/map/page.tsx` → `CanonicalDealMapPage.tsx` (map-first, not feed-first — see below) |
| Deal detail | `components/frontend/DealDetails.tsx` | `components/deals/CanonicalDealDetails.tsx` |
| Post a deal | `components/frontend/Post.tsx`, `DraftForm.tsx` | `components/deals/CanonicalPost.tsx` |
| Edit a deal | — (preview deals aren't editable) | `components/deals/CanonicalDealEdit.tsx` |
| Profile | `components/frontend/Profile.tsx` | `app/profile/page.tsx` |
| Sign-in | `components/frontend/SignIn.tsx` | `app/signin/page.tsx` |
| Reel review | `components/reels/LayoutPreview.tsx` (static fixture, dev-only) | `components/reels/CanonicalReelReview.tsx` |

`app/deal/[id]/page.tsx` and `app/deal/[id]/edit/page.tsx` dispatch between the two trees at the route level, based on `lib/mapPage.ts#isDemoDealId(id)` — a demo-id deal renders the preview `DealDetails`; any other id renders `CanonicalDealDetails`. `app/post/page.tsx` does the analogous dispatch via a `?preview=1` query param.

## Key Details

- `components/frontend/demoDeals.ts` is a static array of fictional deals, explicitly commented "Never submitted, mixed into, or labeled live" — this is the data the preview tree shows.
- `components/frontend/Shell.tsx#PreviewNote` renders the "you're exploring example deals" banner shown when the app is running in preview mode (see [[Three Mode Runtime]]).
- The preview tree's own backend switch (`CanonicalRuntime`/`LiveRuntime`/local `Runtime`) is a separate, smaller thing from this preview/canonical UI split — see [[Three Mode Runtime]] for that.
- `components/frontend/useClock.ts` pins its initial clock value to a fixed timestamp (`2026-10-03T19:00:00-07:00`) specifically to avoid SSR/hydration time mismatches in the preview tree — not a sign of a bug, a deliberate stability choice for a tree that's explicitly non-authoritative.

## Open Questions

- Whether the preview tree (`components/frontend/*`) will eventually be removed once the canonical tree is feature-complete, or kept permanently as a demo/offline mode, isn't settled in the code — see [[Source - Project Process Docs]] for the human product decisions this depends on.

## Sources

- [[Source - Project Process Docs]], [[Three Mode Runtime]]
