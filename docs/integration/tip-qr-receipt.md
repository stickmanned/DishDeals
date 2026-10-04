# Devnet Tip QR and receipt (T-15B)

Scope: `components/TipQR.tsx` (minimal controls), `lib/tipReceipt.ts` (injectable controller), binding in `components/deals/CanonicalDealDetails.tsx`. Reuses `lib/tipRequest.ts` for URI, address and decimal validation. Real wallet tip on a phone is **not done** (human acceptance pending).

## When it shows
Only for a signed-in viewer (`useConvexAuth().isAuthenticated`) on a deal whose `authorWallet` actually exists (from the author's profile `walletAddress`, unchanged). No wallet is invented; no wallet, no tip UI. The profile wallet field and its permissions are untouched.

## Flow
1. Viewer ticks "My wallet is set to Solana Devnet". The Solana Pay URI has no cluster selector (spec v1), so this human acknowledgement is required before the QR, wallet link or any RPC call.
2. "Show tip QR": fresh 32-byte reference from `crypto.getRandomValues` (never `Math.random`; public identifier, not stored or logged), exactly `0.01` SOL, URI from `createTipRequest`, QR from `@solana/pay` `createQR`. SDK modules are loaded on demand with `import()` (the lazy-loading pattern in the installed Next docs).
3. The controller starts only from that click: one `getGenesisHash` identity check, then `findReference` every 2 s for at most 2 min. Cancel, a new request, or unmount aborts it. No background polling.
4. A tip is "received" only when `findReference` finds a signature **and** SDK `validateTransfer` accepts it **and** our exact check of the confirmed `jsonParsed` transaction passes (success meta, System `transfer` to the recipient of exactly 10,000,000 lamports, reference among account keys) **and** the signature was not accepted before. The explorer link shown is the validated signature on `?cluster=devnet`.
5. Fail closed with a reason: wrong network, RPC unavailable, wrong amount/recipient/reference, failed transaction, reused signature, invalid transaction. Timeout is shown as unknown ("could not confirm yet, it may still arrive"), never as a failed payment.

## SDK facts verified
- Docs read: Solana Pay transfer-requests quickstart and spec v1 (no cluster selector; decimals max 9; multiple `reference`). The quickstart uses `encodeURL`, `createQR`, `findReference`, `validateTransfer` from `@solana/pay` with `@solana/kit`; its examples use a mainnet RPC.
- `@solana/pay@1.0.26` (published 2026-07-31, node >=20, ESM + CJS, `sideEffects: false`) peers on `@solana/kit ^6.9`, `@solana/keys`, `@solana/rpc-subscriptions-api/spec ^6.9`, `@solana-program/{memo,system,token,token-2022}` and `@solana/kit-plugin-{instruction-plan,rpc,signer}`; all are installed as direct dependencies (peers are not optional). Newest `@solana/kit` on npm is 8.x, but pay requires 6.x. Types read from the package: `findReference(rpc, reference)` and `validateTransfer(rpc, signature, {recipient, amount: number, reference})`.
- `validateTransfer` accepts `post - pre >= expected` and takes `amount` as a JS `number`; that is why `lib/tipReceipt.ts` adds the exact lamport check. `findReference` returns the oldest match and only proves a signature mentions the reference.
- Default RPC `https://api.devnet.solana.com` (official Devnet endpoint, rate-limited: https://solana.com/docs/references/clusters). No paid RPC, key, faucet, account or transaction.
- Devnet genesis hash `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` is **not** on solana.com's cluster page; it comes from RPC provider docs (Infura/Helius/MetaMask `getGenesisHash`). It is compared at runtime and a mismatch fails closed. Treat it as unverified against an official Solana source until someone confirms.

## Human acceptance still pending
Real iPhone wallet on Devnet: scan, pay 0.01 devnet SOL, see "Tip received" with a working explorer link; also wrong-network wallet and cancel behaviour.
