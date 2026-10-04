---
title: "Convex Schema"
type: entity
tags: [schema, data-model]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["convex/schema.ts", "convex/workflowTables.ts"]
---

# Convex Schema

## Overview

The single `defineSchema` call that declares every table in the app. It explicitly spreads in two other table sets rather than defining everything inline, so a reader must check two files to see the full picture.

## Location

`convex/schema.ts` (86 lines). Spreads `workflowTables` from `convex/workflowTables.ts:4-16` and `authTables` from `@convex-dev/auth/server`.

## Details

| Table | Key fields | Indexes | Owning concept |
|---|---|---|---|
| `...workflowTables` (`workflowJobs`, `workflowRestaurants`, `workflowDeals`, `workflowLimits`, `workflowSearchLimits`) | see `convex/workflowTables.ts` | — | [[Teammate Workflow Pipeline]] |
| `...authTables` (includes `users`) | — | — | [[Auth and Ownership Model]] |
| `reelItems` | `ownerId`, `sourceUrl`, `status`, `generation`, `attempts`, `expiresAt`, `extractionJson`, `draftJson`, `sourceKind`, `nativeContext` (private) | `by_owner_url`, `by_owner`, `by_expiry` | [[Reel Ingestion Workflow]] |
| `reelLimits` | `ownerId`, `windowStart`, `count` | `by_owner` | [[Rate Limiting Patterns]] |
| `geocodeGate` | `key` (`"nominatim"`), `lastGrantedAt` | `by_key` | [[Geocoding Providers]] |
| `geocodeCache` | `cacheKey` (SHA-256; raw query never stored), `results`, `expiresAt` | `by_key`, `by_expiry` | [[Geocoding Providers]] |
| `profiles` | `userId`, `displayName`, `walletAddress?` | `by_user` | [[Profiles and Wallets]] |
| `deals` | `authorId`, `restaurant`, `address?`, `dealText`, `priceCad?` (missing = varies), `validDays`, `validStart?`/`validEnd?`, `expiresOn?`, `conditions`, `lat`/`lng`, `imageId?`, `sourceUrl?`, `stillOnCount`, `expiredCount` | `by_author`, `by_image` | [[Canonical Deal Publishing]] |
| `dealUploads` | `ownerId`, `storageId`, `expiresAt`, `published` | `by_storage`, `by_expiry`, `by_owner_pending` | [[Screenshot and Flyer Extraction]] |
| `votes` | `dealId`, `userId`, `value` (`"still_on"`/`"expired"`) | `by_deal_user` | [[Voting and Crowd Signals]] |

`nativeContextValidator` (lines 8-11) is a shared validator object (not a table) used by `reelItems.nativeContext` — see [[Native and Android Share Integration]].

A comment at line 14 explains the spread order isn't arbitrary: "Published teammate workflow collections … preserved so a later sync cannot drop them" — a reminder that `workflowTables` belongs to a separately-maintained branch (see [[Source - Project Process Docs]]).

## Related Entities

Every concept page above's "Where It Lives" section links back to this schema for its table's exact shape.

## Sources

- [[Source - Project Process Docs]]
