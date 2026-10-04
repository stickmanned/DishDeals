---
title: "Canonical Deal Publishing"
type: concept
tags: [deals, crud, geospatial]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["convex/deals.ts", "lib/dealWrite.ts", "lib/dealEdit.ts", "convex/schema.ts"]
---

# Canonical Deal Publishing

## Overview

The real, persisted `deals` table CRUD — the thing every extraction pipeline ([[Reel Ingestion Workflow]], [[Screenshot and Flyer Extraction]]) ultimately feeds into once a user confirms a draft. This is what the map and feed actually read.

## How It Works

- **Who can write**: `authorWithProfile(ctx)` (`convex/deals.ts:102`) requires a signed-in user **and** an existing `profiles` row — publishing is blocked until the user has set a display name.
- **`create`** (`deals.ts:146`): validates fields via `lib/dealWrite.ts#validatePublishFields` (`clean()`, `deals.ts:110`), claims the attached image if any (`claimImage`, requires `convex/dealUploads.ts#requireOwnedImage`), inserts the row with `stillOnCount: 0, expiredCount: 0`, then inserts a point into the `@convex-dev/geospatial` index (`GeospatialIndex`, `deals.ts:16`) **in the same transaction** — if the index write fails, the publish rolls back.
- **`update`** (`deals.ts:162`): author-only full-field replacement; omitted optional fields are deliberately cleared, not left alone; re-inserts the geospatial point; releases the old image if swapped.
- **`remove`** (`deals.ts:183`): author-only; deletes associated votes first (refuses rather than partially delete if there are more than `MAX_VOTES_PER_DELETE`), removes the geospatial entry, deletes the deal, releases the image.
- **`get`** (`deals.ts:21`): enriches a raw deal with `authorName`/`authorWallet` (from `profiles`, via `unique()` — a duplicate profile row fails the read rather than guessing), `imageUrl` (signed storage URL), and `viewerVote` (derived server-side from the caller's auth, never trusted from the client).
- **`listNearby`** (`deals.ts:218`): validates `lat/lng/maxKm` (`lib/dealWrite.ts#validateNearbyArgs`), queries `geospatial.nearest()` (meters), and **falls back to a bounded scan of the newest deals, re-ranked by true haversine distance** (`lib/dealWrite.ts#rankByDistance`, using [[Deal Validity and Distance Math]]'s `distanceKm`) if the geospatial component call fails for any reason.
- Image lifecycle: `claimImage`/`releaseImage` (`deals.ts:118,124`) ensure a storage file is only ever referenced by its real owner's registry row (`convex/dealUploads.ts`) and is deleted once no deal references it — see [[Screenshot and Flyer Extraction]] for how an image gets uploaded in the first place.

## Where It Lives

- `convex/deals.ts` — all mutations/queries above.
- `convex/dealUploads.ts` — the private upload registry `claimImage`/`releaseImage` depend on.
- `lib/dealWrite.ts` — `validatePublishFields`, `validateNearbyArgs`, `rankByDistance`, `isAllowedImageType`, field-length/weekday/URL/lat-lng validators, `NEARBY_LIMIT`/`NEARBY_MAX_KM`.
- `lib/dealEdit.ts` — the author-edit/delete pure helpers behind `components/deals/CanonicalDealEdit.tsx`: `canEditDeal`/`editAccess`, `initDraftFromSavedDeal` (marks every field pre-reviewed, since it's the author's own saved data), `buildUpdateArgs`, `dealSignature`/`changedExternally` (warns rather than silently overwriting if the deal changed elsewhere while editing).
- `convex/schema.ts:52-69` — the `deals` table shape; `convex/schema.ts:73-78` — `dealUploads`.

## Key Details

- There is no soft-delete: `remove` is a real delete, bounded by the vote-count safety check.
- Price semantics: `priceCad` missing means "price varies," not zero or unknown — preserved end-to-end from extraction through to display ([[Deal Validity and Distance Math]] and the map adapter both honor this).
- `generateUploadUrl` (`deals.ts:134`) returns `${CONVEX_SITE_URL}/deal-image`, not a Convex storage upload URL — the server validates/stores/registers the file itself (see [[Screenshot and Flyer Extraction]]).

## Related Entities

- [[Voting and Crowd Signals]] — reads/writes `deals.stillOnCount`/`expiredCount`.
- [[Map Rendering]] — `lib/mapAdapter.ts` converts a canonical deal into the map package's shape.

## Sources

- [[Source - Project Process Docs]]
