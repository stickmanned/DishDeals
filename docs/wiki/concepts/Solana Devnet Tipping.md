---
title: "Solana Devnet Tipping"
type: concept
tags: [solana, payments, devnet]
created: 2026-10-04
updated: 2026-10-04
verified_commit: 6c69d94
paths: ["lib/tipRequest.ts", "lib/tipReceipt.ts", "components/TipQR.tsx"]
---

# Solana Devnet Tipping

## Overview

An entirely optional, explicitly **devnet-only** payment feature: a user can tip whoever posted a deal via a Solana Pay QR code, scoped so it can never move real money. This is a secondary feature relative to the core save/publish flow.

## How It Works

- **Request (`lib/tipRequest.ts`)**: a zero-dependency implementation of the Solana Pay v1 transfer-request URI spec. `createTipRequest`/`parseTipRequestUri` build/parse the URI; `validateSolanaAddress` is explicitly only a *syntactic* 32-byte check — it cannot and does not verify the address is funded or real; `validateSolAmount` enforces a strict decimal grammar (≤9 decimals, no sign, no scientific notation). `parseTipRequestUri` rejects any query parameter beyond `amount`/`reference`/`label`/`message` — "arbitrary callbacks and cluster bypass are prohibited." The standard URI itself carries **no network selector** — it cannot force a wallet onto devnet; that guarantee comes entirely from the confirmation side.
- **Confirmation (`lib/tipReceipt.ts`)**: a headless, dependency-injected state machine (`TipDeps`) with no direct Solana SDK import. `DEVNET_GENESIS_HASH` is checked **first**, before anything else, to confirm the connected cluster really is devnet. `createFreshReference` generates a crypto-secure 32-byte reference per tip attempt (never a private key). `createTipController` polls (`findReference` → `validateTransfer` → the app's own stricter `assertExactTipTransfer`) for up to `POLL_MAX_MS` (120s); `assertExactTipTransfer` (`tipReceipt.ts:124`) is an additional, stricter check beyond the SDK's own validation: it requires a successful transaction, a System Program `transfer` instruction to the exact recipient for exactly the requested lamport amount (`solToLamports`, exact-decimal, no floats), and the reference present among the transaction's account keys. A timed-out poll reports `"unknown"`, never `"failed"` — the transaction may still land later. A reused signature is rejected.
- `createTipSession` wraps the controller as a single-flight, generation-guarded session for a UI component; `createDevnetDeps` is the one place that wires in the real `@solana/pay`/`@solana/kit` SDKs.

## Where It Lives

- `lib/tipRequest.ts` — URI protocol (`createTipRequest`, `parseTipRequestUri`, address/amount validation).
- `lib/tipReceipt.ts` — confirmation controller (`createTipController`, `createTipSession`, `assertExactTipTransfer`, `createDevnetDeps`).
- `components/TipQR.tsx` — the QR-code UI.
- `convex/schema.ts:49` — `profiles.walletAddress` (the recipient address), see [[Profiles and Wallets]].

## Key Details

- `TIP_AMOUNT_SOL = "0.01"` is a fixed tip amount in this version (not user-adjustable at the protocol layer shown here).
- Every real-money safeguard here is layered (URI scope limits, genesis-hash check, exact-transfer re-verification) rather than relying on any single check — consistent with the project's broader "never imply something succeeded that didn't actually happen" discipline (see [[Source - Project Process Docs]]).

## Sources

- [[Profiles and Wallets]]
