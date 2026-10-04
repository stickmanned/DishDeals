/**
 * Devnet tip receipt controller (T-15B).
 *
 * Headless and dependency-injected: this module imports no Solana SDK and makes no network calls itself.
 * The runtime (components/TipQR.tsx) injects functions backed by the maintained `@solana/pay` merchant
 * helpers (`findReference`, `validateTransfer`) and `@solana/kit` RPC; tests inject synthetic ones.
 *
 * A tip is only "received" after ALL of these hold for a transaction found via the fresh reference:
 *  1. the RPC identifies as Devnet (genesis hash) before any polling starts,
 *  2. the SDK's `validateTransfer` accepts it (system transfer, exact recipient, reference accounts, no error),
 *  3. our own exact check of the parsed confirmed transaction: success meta, a System `transfer` to the
 *     recipient of exactly the requested lamports, and the reference among the account keys,
 *  4. the signature has not been accepted for an earlier tip request.
 * `findReference` alone is never a receipt. Timeout is reported as "unknown", never as a failed payment.
 */
import { encodeBase58, validateSolAmount, validateSolanaAddress } from "./tipRequest";

/** Official Devnet public RPC (https://solana.com/docs/references/clusters). Rate limited; no paid RPC. */
export const DEVNET_RPC_URL = "https://api.devnet.solana.com";
/**
 * Devnet genesis hash. Not stated on solana.com's cluster page; taken from RPC provider docs for
 * getGenesisHash (Infura/Helius/MetaMask) and checked at runtime against the endpoint. A mismatch fails closed.
 */
export const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const POLL_INTERVAL_MS = 2000;
export const POLL_MAX_MS = 120_000;
export const TIP_AMOUNT_SOL = "0.01";
export const LAMPORTS_PER_SOL = BigInt(1_000_000_000);

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/** Exact decimal SOL string to lamports without floats. */
export function solToLamports(amount: string): bigint {
  validateSolAmount(amount);
  const [whole, frac = ""] = amount.split(".");
  return BigInt(whole) * LAMPORTS_PER_SOL + BigInt(frac.padEnd(9, "0"));
}

/** Explorer link for a validated signature, Devnet only. */
export function devnetExplorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}

/**
 * Fresh public reference: 32 bytes from a cryptographically secure source, base58 encoded.
 * It is only an identifier account key, never a private key, and is not stored or logged.
 */
export function createFreshReference(
  fillRandom: (bytes: Uint8Array) => Uint8Array = (bytes) => globalThis.crypto.getRandomValues(bytes),
): string {
  const bytes = fillRandom(new Uint8Array(32));
  if (bytes.length !== 32 || bytes.every((b) => b === 0)) throw new Error("Secure random source unavailable");
  const reference = encodeBase58(bytes);
  validateSolanaAddress(reference, "reference");
  return reference;
}

export type TipFailureReason =
  | "wrong_network"
  | "rpc_unavailable"
  | "wrong_amount"
  | "wrong_recipient"
  | "wrong_reference"
  | "transaction_failed"
  | "reused_signature"
  | "invalid_transaction";

export type TipState =
  | { status: "idle" }
  | { status: "polling"; startedAt: number }
  | { status: "received"; signature: string; explorerUrl: string }
  | { status: "unknown"; message: string }
  | { status: "failed"; reason: TipFailureReason; message: string }
  | { status: "cancelled" };

export const TIP_MESSAGES: Record<TipFailureReason, string> = {
  wrong_network: "The connection is not Solana Devnet, so nothing was checked.",
  rpc_unavailable: "Devnet could not be reached. Nothing was confirmed; try again.",
  wrong_amount: "A transaction was found but the amount does not match.",
  wrong_recipient: "A transaction was found but the recipient does not match.",
  wrong_reference: "A transaction was found but the reference does not match.",
  transaction_failed: "A transaction was found but it did not succeed.",
  reused_signature: "That transaction was already used for another tip.",
  invalid_transaction: "A transaction was found but it is not a valid tip transfer.",
};

export const TIP_UNKNOWN_MESSAGE =
  "We could not confirm a tip yet. If you paid, it may still arrive; check your wallet and try again.";

/** Subset of the confirmed `jsonParsed` transaction response used for the exact check. */
export interface ParsedTipTransaction {
  meta: { err: unknown | null } | null;
  transaction: {
    message: {
      accountKeys: ReadonlyArray<string | { pubkey: string }>;
      instructions: ReadonlyArray<{
        program?: string;
        programId?: string;
        parsed?: { type?: string; info?: { destination?: string; lamports?: number | string | bigint } };
      }>;
    };
  };
}

export interface TipExpectation {
  recipient: string;
  reference: string;
  amount: string;
}

export class TipValidationError extends Error {
  constructor(
    readonly reason: TipFailureReason,
    message = TIP_MESSAGES[reason],
  ) {
    super(message);
    this.name = "TipValidationError";
  }
}

/** Our own exact check of the parsed transaction. Throws TipValidationError. */
export function assertExactTipTransfer(tx: ParsedTipTransaction | null, expected: TipExpectation): void {
  if (!tx || !tx.meta) throw new TipValidationError("invalid_transaction");
  if (tx.meta.err !== null && tx.meta.err !== undefined) throw new TipValidationError("transaction_failed");
  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === "string" ? k : k.pubkey));
  if (!keys.includes(expected.reference)) throw new TipValidationError("wrong_reference");
  const transfers = tx.transaction.message.instructions.filter(
    (ix) => (ix.program === "system" || ix.programId === SYSTEM_PROGRAM) && ix.parsed?.type === "transfer",
  );
  if (transfers.length === 0) throw new TipValidationError("invalid_transaction");
  const toRecipient = transfers.filter((ix) => ix.parsed?.info?.destination === expected.recipient);
  if (toRecipient.length === 0) throw new TipValidationError("wrong_recipient");
  const wanted = solToLamports(expected.amount);
  let paid = BigInt(0);
  for (const ix of toRecipient) {
    const lamports = ix.parsed?.info?.lamports;
    if (lamports === undefined) throw new TipValidationError("invalid_transaction");
    try {
      paid += BigInt(lamports);
    } catch {
      throw new TipValidationError("invalid_transaction");
    }
  }
  if (paid !== wanted) throw new TipValidationError("wrong_amount");
}

/** Maps an SDK `ValidateTransferError` message to a reason. Anything unrecognised fails as invalid. */
export function reasonFromSdkError(error: unknown): TipFailureReason {
  const message = error instanceof Error ? error.message : String(error);
  if (/amount/i.test(message)) return "wrong_amount";
  if (/reference/i.test(message)) return "wrong_reference";
  if (/recipient|invalid transfer/i.test(message)) return "wrong_recipient";
  if (/err|InstructionError|Failed/i.test(message) && message.startsWith("{")) return "transaction_failed";
  return "invalid_transaction";
}

export interface TipDeps {
  getGenesisHash(): Promise<string>;
  /** Resolves the signature of the oldest transaction that includes the reference, or null if none yet. */
  findReference(reference: string): Promise<{ signature: string } | null>;
  /** SDK `validateTransfer`; rejects when the confirmed transaction does not match. */
  validateTransfer(signature: string, fields: { recipient: string; amount: number; reference: string }): Promise<unknown>;
  /** Confirmed `jsonParsed` transaction, or null when unavailable. */
  getParsedTransaction(signature: string): Promise<ParsedTipTransaction | null>;
  now(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

export interface TipController {
  start(): Promise<TipState>;
  cancel(): void;
}

/**
 * Creates a controller for ONE tip request. `start` polls only because the caller explicitly started it;
 * it does one Devnet identity check, then polls every 2 s for at most 2 minutes, stops on cancel, and ends in
 * exactly one terminal state. `usedSignatures` is shared across requests to reject a reused transaction.
 */
export function createTipController(
  deps: TipDeps,
  expected: TipExpectation,
  onState: (state: TipState) => void,
  usedSignatures: Set<string> = new Set(),
): TipController {
  const abort = new AbortController();
  let started = false;
  let finished = false;

  const emit = (state: TipState): TipState => {
    // Stale output: nothing after cancel or after the terminal state.
    if (!finished && !(abort.signal.aborted && state.status !== "cancelled")) onState(state);
    if (state.status !== "polling") finished = true;
    return state;
  };
  const fail = (reason: TipFailureReason) => emit({ status: "failed", reason, message: TIP_MESSAGES[reason] });

  async function run(): Promise<TipState> {
    validateSolanaAddress(expected.recipient, "recipient");
    validateSolanaAddress(expected.reference, "reference");
    solToLamports(expected.amount);
    const startedAt = deps.now();
    emit({ status: "polling", startedAt });
    try {
      if ((await deps.getGenesisHash()) !== DEVNET_GENESIS_HASH) return fail("wrong_network");
    } catch {
      return abort.signal.aborted ? emit({ status: "cancelled" }) : fail("rpc_unavailable");
    }
    while (!abort.signal.aborted) {
      if (deps.now() - startedAt >= POLL_MAX_MS) return emit({ status: "unknown", message: TIP_UNKNOWN_MESSAGE });
      let found: { signature: string } | null;
      try {
        found = await deps.findReference(expected.reference);
      } catch {
        return abort.signal.aborted ? emit({ status: "cancelled" }) : fail("rpc_unavailable");
      }
      if (abort.signal.aborted) break;
      if (found) return await validate(found.signature);
      try {
        await deps.sleep(POLL_INTERVAL_MS, abort.signal);
      } catch {
        break;
      }
    }
    return emit({ status: "cancelled" });
  }

  async function validate(signature: string): Promise<TipState> {
    if (usedSignatures.has(signature)) return fail("reused_signature");
    try {
      await deps.validateTransfer(signature, {
        recipient: expected.recipient,
        amount: Number(expected.amount),
        reference: expected.reference,
      });
    } catch (error) {
      if (abort.signal.aborted) return emit({ status: "cancelled" });
      // An RPC outage during validation is not evidence about the payment.
      return fail(error instanceof Error && /fetch|network|rpc|timeout/i.test(error.name + error.message) && !/invalid|amount|reference/i.test(error.message)
        ? "rpc_unavailable"
        : reasonFromSdkError(error));
    }
    try {
      assertExactTipTransfer(await deps.getParsedTransaction(signature), expected);
    } catch (error) {
      if (abort.signal.aborted) return emit({ status: "cancelled" });
      return fail(error instanceof TipValidationError ? error.reason : "rpc_unavailable");
    }
    if (abort.signal.aborted) return emit({ status: "cancelled" });
    usedSignatures.add(signature);
    return emit({ status: "received", signature, explorerUrl: devnetExplorerUrl(signature) });
  }

  return {
    start() {
      if (started) throw new Error("Tip controller already started; create a new request");
      started = true;
      return run();
    },
    cancel() {
      if (finished || abort.signal.aborted) return;
      abort.abort();
      onState({ status: "cancelled" });
      finished = true;
    },
  };
}

/** Structural view of the pieces of `@solana/kit` RPC and `@solana/pay` that the Devnet wiring uses. */
export interface DevnetSdk {
  rpc: {
    getGenesisHash(): { send(): Promise<string> };
    getTransaction(signature: never, config: never): { send(): Promise<unknown> };
  };
  pay: {
    findReference(rpc: never, reference: never, options?: never): Promise<{ signature: string }>;
    validateTransfer(rpc: never, signature: never, fields: never, options?: never): Promise<unknown>;
    FindReferenceError: abstract new (...args: never[]) => Error;
  };
  /** `address()` from `@solana/kit`: validates and brands a base58 string. */
  toAddress(value: string): unknown;
}

/** Runtime deps backed by the maintained SDK. Only call with a Devnet RPC; the genesis check enforces it. */
export function createDevnetDeps(sdk: DevnetSdk): TipDeps {
  const rpc = sdk.rpc as never;
  return {
    getGenesisHash: () => sdk.rpc.getGenesisHash().send(),
    async findReference(reference) {
      try {
        const found = await sdk.pay.findReference(rpc, sdk.toAddress(reference) as never, { commitment: "confirmed" } as never);
        return { signature: found.signature };
      } catch (error) {
        if (error instanceof sdk.pay.FindReferenceError) return null;
        throw error;
      }
    },
    validateTransfer: (signature, fields) =>
      sdk.pay.validateTransfer(
        rpc,
        signature as never,
        { recipient: sdk.toAddress(fields.recipient), amount: fields.amount, reference: sdk.toAddress(fields.reference) } as never,
        { commitment: "confirmed" } as never,
      ),
    async getParsedTransaction(signature) {
      const tx = await sdk.rpc
        .getTransaction(signature as never, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 } as never)
        .send();
      return (tx ?? null) as ParsedTipTransaction | null;
    },
    now: () => Date.now(),
    sleep: (ms, signal) =>
      new Promise<void>((resolve, reject) => {
        if (signal.aborted) return reject(new Error("aborted"));
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        }, ms);
        const onAbort = () => {
          clearTimeout(timer);
          reject(new Error("aborted"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
      }),
  };
}
