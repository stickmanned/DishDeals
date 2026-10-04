# Solana Devnet Tip Integration Specification & Verification Gates (T-15A)

This document specifies the on-chain tipping architecture for DishDeals on Solana Devnet, clarifies the boundary between the pure protocol request helper (`lib/tipRequest.ts`) and future native mobile integration, and outlines the required verification gates for confirming transactions on-chain.

---

## 1. Overview & Architectural Scope

DishDeals includes an optional micro-tipping protocol that allows community members to tip deal posters directly in SOL for discovering and sharing valid deals.

### Implemented vs. Pending Scope (T-15A vs. Full T-15)
- **Implemented in T-15A (`lib/tipRequest.ts`)**:
  - Headless, pure TypeScript helper to construct and parse Solana Pay v1 transfer request URIs (`createTipRequest`, `parseTipRequestUri`).
  - Syntactic 32-byte Base58 address validation (`validateSolanaAddress`, `isValidSolanaAddress`).
  - Strict SOL decimal amount string validation (`validateSolAmount`, `isValidSolAmount`), enforcing positive amounts up to 9 decimal places with no floating-point arithmetic.
  - Zero external dependencies; self-contained Base58 codec.
- **Pending in Future Tasks (T-15 Full Integration)**:
  - Mobile QR code rendering and deep-link handoff in Harry's native iOS / React Native frontend.
  - Runtime SDK selection and installation (`@solana/web3.js` / `@solana/kit`).
  - Integration with authenticated user profile (`authorWallet` / `walletAddress`).
  - Devnet RPC querying, signature confirmation, and on-chain transfer validation (`validateTransfer`).
  - Physical iPhone mobile wallet testing, transaction signing, and explorer record-keeping.

---

## 2. Solana Pay Transfer Request Protocol Specification

Official Reference: [Solana Pay Transfer Request Specification v1](https://solana.com/docs/tools/solana-pay/specification/version1)

### Standard URI Format
```text
solana:<recipient>?amount=<amount>&reference=<reference>&label=<label>&message=<message>
```

Example generated URI:
```text
solana:TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA?amount=0.01&reference=MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr&label=DishDeals&message=Thanks%20for%20the%20deal
```

### Critical Protocol Limitations
1. **No Cluster / Network Selector in URI**:
   Standard Solana Pay transfer request URIs carry **no cluster or network parameter** (e.g. `cluster=devnet` is not part of the standard v1 transfer request specification and is strictly rejected by our parser to prevent arbitrary query injection).
2. **Cannot Force Wallet Network**:
   A Solana Pay URI **cannot programmatically force or switch a user's mobile wallet to Devnet**. The mobile wallet (Phantom, Solflare, etc.) will submit the transaction to whatever RPC network cluster the user has currently configured in their wallet settings.
3. **Network Target is Documented as Expected**:
   The helper returns `expectedNetwork: "devnet"` for documentation and UI prompting, but physical testing requires the user to manually switch their mobile wallet to Devnet.

---

## 3. Reference Architecture & Security Rules

1. **What is the Reference?**:
   - The `reference` parameter is a public Ed25519 public key (32 bytes) added as an account key to the transfer transaction by the paying wallet.
   - It acts as an on-chain search index / correlation ID, enabling lightweight RPC clients to find the transaction via `getSignaturesForAddress(reference)`.
2. **Non-Secret Identifier**:
   - The reference is **public** and **non-secret**. It is never a private key, seed phrase, or secret token.
3. **Freshness per Tip Request**:
   - Every tip request **must use a fresh, unique reference public key**.
   - Reusing reference keys prevents reliable 1-to-1 payment correlation.
4. **Secure Randomness Source**:
   - Fresh reference keypairs or public keys must be generated using cryptographically secure runtime entropy (`crypto.getRandomValues()` in browser / Node.js, or native `SecRandomCopyBytes` on iOS).
   - The helper intentionally does not generate weak pseudo-random keys.

---

## 4. On-Chain Verification Pipeline (Preventing False Receipts)

In future tasks, confirming that a tip was received cannot rely on optimistic client state or shallow lookups. The following verification pipeline must be implemented:

```
[User Wallet Submits TX]
          │
          ▼
1. Query Devnet RPC for Signatures: `getSignaturesForAddress(reference)`
          │
          ├─► No signatures found ──► Status: PENDING (poll with timeout)
          ▼
2. Fetch Transaction Details: `getTransaction(signature, { commitment: 'confirmed' })`
          │
          ├─► Transaction failed / errored on-chain ──► Status: REJECTED (failed on-chain)
          ▼
3. Validate Transfer via Official Rules (`validateTransfer`):
   ├── Check Cluster: Configured Devnet RPC endpoint verified
   ├── Check Recipient: Output account matches deal author's `walletAddress`
   ├── Check Amount: Transferred lamports >= requested tip amount
   └── Check Reference: Reference public key is in transaction account keys
          │
          ├─► Mismatch (wrong recipient / wrong amount / wrong reference) ──► Status: REJECTED
          ▼
4. Prevent Signature Replay:
   Ensure `signature` has not already been credited in the DishDeals database
          │
          ├─► Already recorded ──► Status: REJECTED (replay attempt)
          ▼
5. State Mutation:
   Mark tip as "Tip Received" in database with immutable proof:
   - On-chain Transaction Signature
   - Solana Explorer Devnet URL: `https://explorer.solana.com/tx/<signature>?cluster=devnet`
```

> **IMPORTANT**: Calling `findReference` alone is **NOT proof of payment**. A malicious or misconfigured transaction might include the reference key while sending 0 lamports or transferring funds to a different address. Full transfer validation (`validateTransfer`) is mandatory before declaring success.

---

## 5. Runtime SDK Selection & Harry Handoff

- **Recommended Modern SDK**:
  - Official current Solana JavaScript/TypeScript SDK: `@solana/web3.js` v1 / v2 or the modern `@solana/kit` suite.
  - Official Solana Pay client library: `@solana/pay` (provides standard `createQR`, `encodeURL`, `findReference`, `validateTransfer`).
- **Integration Boundary**:
  - Selection and installation of runtime packages is deferred until Harry provides the native iOS or web frontend integration context.
  - No SDK packages are installed in T-15A to keep the worktree zero-dependency and protect project lockfiles.

---

## 6. Human Physical Onboarding & Testing Checklist (Unexecuted)

Physical testing of Solana Devnet tips requires human setup on a real mobile device. These steps are outlined for review and have not been executed autonomously:

1. **Install Mobile Wallet**:
   - Install a Solana-compatible mobile wallet app (e.g. Phantom or Solflare) on the physical iPhone.
2. **Switch to Devnet**:
   - Open Wallet Settings > **Developer Settings** > Change Network to **Devnet**.
3. **Obtain Devnet SOL**:
   - Request test SOL from the official faucet:
     - Web faucet: [Solana Faucet](https://faucet.solana.com)
     - Or CLI: `solana airdrop 1 <WALLET_ADDRESS> --url devnet`
4. **Author Profile Wallet**:
   - Ensure the deal author's DishDeals profile contains a valid 32-byte Base58 Devnet public key.
5. **Scan & Authorize Tip**:
   - Open DishDeals on device, navigate to a deal, and tap Tip Author.
   - Deep-link into mobile wallet via `solana:` URI or scan rendered QR code.
   - Review transaction details (0.01 SOL to deal author) and approve.
6. **Record Verification Proof**:
   - Record the genuine on-chain transaction signature and Solana Explorer Devnet URL.
   - Offline mocks, synthetic fixtures, or local simulated states must never be used to claim successful tip receipt.
