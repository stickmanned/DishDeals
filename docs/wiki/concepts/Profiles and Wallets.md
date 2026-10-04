---
title: "Profiles and Wallets"
type: concept
tags: [profile, users, solana]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["convex/users.ts", "lib/profile.ts", "lib/authReturn.ts"]
---

# Profiles and Wallets

## Overview

A minimal per-user profile — display name plus an optional Solana devnet wallet address for receiving tips (see [[Solana Devnet Tipping]]) — required before a user can publish a canonical deal (see [[Canonical Deal Publishing]]'s `authorWithProfile`).

## How It Works

- `convex/users.ts#me` / `upsertProfile` are thin wrappers around the pure core `lib/profile.ts`, which takes an injected `ProfileDb` interface (`getProfileByUser`, `insertProfile`, `patchProfile`) rather than a Convex `ctx` — see [[Pure Core Plus Thin Convex Shell]].
- `lib/profile.ts#validateDisplayName` enforces 2–24 characters.
- `upsertProfileCore`'s `walletAddress` semantics are deliberate: `undefined` in the args means "keep existing value," a non-empty string replaces it, and there is **no path to clear it to empty** once set.
- `lib/authReturn.ts#profileFlow` governs what happens after sign-in/profile-save — distinguishing "continue to the page the user was trying to reach" vs. "stay on the profile form" vs. "no redirect" — and specifically never discards an in-progress profile form by navigating away underneath the user.
- `lib/authReturn.ts#parseReturn` only allows an explicit allowlist of return routes (`/post`, `/reels[?item=]`, `/deal/<id>[/edit]`) from a `next` query param — deliberately excludes `/reels?shared=…` (which could carry private text) and any other query/fragment, preventing an open-redirect-style misuse of the sign-in return flow.

## Where It Lives

- `convex/users.ts` — `me`, `upsertProfile`.
- `lib/profile.ts` — `validateDisplayName`, `ProfileDb`, `upsertProfileCore`, `meCore`.
- `lib/authReturn.ts` — post-auth routing.
- `convex/schema.ts:46-50` — `profiles` table.
- `app/profile/page.tsx`, `app/signin/page.tsx` — the UI.

## Sources

- [[Canonical Deal Publishing]], [[Solana Devnet Tipping]]
