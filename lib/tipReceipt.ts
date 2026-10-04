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
import { createTipRequest, encodeBase58, validateSolAmount, validateSolanaAddress } from "./tipRequest";

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
  | "invalid_transaction"
  | "setup_failed";

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
  setup_failed: "Could not prepare the tip request. Nothing was sent.",
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
  /** Every call receives the controller's abort signal; implementations must stop work when it fires. */
  getGenesisHash(signal: AbortSignal): Promise<string>;
  /** Resolves the signature of the oldest transaction that includes the reference, or null if none yet. */
  findReference(reference: string, signal: AbortSignal): Promise<{ signature: string } | null>;
  /** SDK `validateTransfer`; rejects when the confirmed transaction does not match. */
  validateTransfer(
    signature: string,
    fields: { recipient: string; amount: number; reference: string },
    signal: AbortSignal,
  ): Promise<unknown>;
  /** Confirmed `jsonParsed` transaction, or null when unavailable. */
  getParsedTransaction(signature: string, signal: AbortSignal): Promise<ParsedTipTransaction | null>;
  now(): number;
  /** Resolves after `ms`, or rejects when `signal` aborts. */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}

export interface TipController {
  start(): Promise<TipState>;
  cancel(): void;
}

const TERMINAL = new Set<TipState["status"]>(["received", "unknown", "failed", "cancelled"]);
export const isTerminalTipState = (state: TipState): boolean => TERMINAL.has(state.status);

/**
 * Creates a controller for ONE tip request. `start` runs only because the caller explicitly started it.
 * The total budget (POLL_MAX_MS) is a hard deadline that also covers pending RPC promises: when it fires, or on
 * cancel, the abort signal is raised for every in-flight call, `start` settles at once, and the single terminal
 * state is "unknown" (deadline) or "cancelled". Nothing that settles later can emit a state or consume a signature.
 * `usedSignatures` is shared across requests to reject a reused transaction.
 */
export function createTipController(
  deps: TipDeps,
  expected: TipExpectation,
  onState: (state: TipState) => void,
  usedSignatures: Set<string> = new Set(),
): TipController {
  const abort = new AbortController();
  const deadlineAbort = new AbortController();
  let started = false;
  let terminal: TipState | null = null;
  let wake!: () => void;
  const stopped = new Promise<void>((resolve) => (wake = resolve));
  const STOP = Symbol("stop");

  /** First terminal state wins; later calls return it unchanged and emit nothing. */
  const finish = (state: TipState): TipState => {
    if (terminal) return terminal;
    terminal = state;
    deadlineAbort.abort();
    abort.abort();
    wake();
    onState(state);
    return state;
  };
  const fail = (reason: TipFailureReason) => finish({ status: "failed", reason, message: TIP_MESSAGES[reason] });

  /** Races a dependency call against stop. Late rejections of the abandoned call are swallowed. */
  async function call<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T | typeof STOP> {
    if (terminal) return STOP;
    const pending = fn(abort.signal);
    pending.catch(() => undefined);
    return Promise.race([pending, stopped.then(() => STOP)]) as Promise<T | typeof STOP>;
  }

  async function run(): Promise<TipState> {
    validateSolanaAddress(expected.recipient, "recipient");
    validateSolanaAddress(expected.reference, "reference");
    solToLamports(expected.amount);
    const startedAt = deps.now();
    // Hard deadline: its timer is owned by deps.sleep and cleared through deadlineAbort when we finish.
    deps.sleep(POLL_MAX_MS, deadlineAbort.signal).then(
      () => void finish({ status: "unknown", message: TIP_UNKNOWN_MESSAGE }),
      () => undefined,
    );
    onState({ status: "polling", startedAt });

    let genesis: string | typeof STOP;
    try {
      genesis = await call((signal) => deps.getGenesisHash(signal));
    } catch {
      return fail("rpc_unavailable");
    }
    if (genesis === STOP) return terminal as unknown as TipState;
    if (genesis !== DEVNET_GENESIS_HASH) return fail("wrong_network");

    while (!terminal) {
      let found: { signature: string } | null | typeof STOP;
      try {
        found = await call((signal) => deps.findReference(expected.reference, signal));
      } catch {
        return fail("rpc_unavailable");
      }
      if (found === STOP || terminal) break;
      if (found) return await validate(found.signature);
      const slept = await call((signal) => deps.sleep(POLL_INTERVAL_MS, signal)).catch(() => STOP);
      if (slept === STOP) break;
    }
    return terminal ?? finish({ status: "cancelled" });
  }

  async function validate(signature: string): Promise<TipState> {
    if (usedSignatures.has(signature)) return fail("reused_signature");
    const fields = { recipient: expected.recipient, amount: Number(expected.amount), reference: expected.reference };
    try {
      const sdk = await call((signal) => deps.validateTransfer(signature, fields, signal));
      if (sdk === STOP) return terminal as unknown as TipState;
    } catch (error) {
      // An RPC outage during validation is not evidence about the payment.
      const outage =
        error instanceof Error && /fetch|network|rpc|timeout/i.test(error.name + error.message) && !/invalid|amount|reference/i.test(error.message);
      return fail(outage ? "rpc_unavailable" : reasonFromSdkError(error));
    }
    try {
      const parsed = await call((signal) => deps.getParsedTransaction(signature, signal));
      if (parsed === STOP) return terminal as unknown as TipState;
      assertExactTipTransfer(parsed, expected);
    } catch (error) {
      return fail(error instanceof TipValidationError ? error.reason : "rpc_unavailable");
    }
    // Synchronous from here: a stop that happened during the awaits above has already set `terminal`.
    if (terminal) return terminal;
    usedSignatures.add(signature);
    return finish({ status: "received", signature, explorerUrl: devnetExplorerUrl(signature) });
  }

  return {
    start() {
      if (started) throw new Error("Tip controller already started; create a new request");
      started = true;
      return run();
    },
    cancel() {
      finish({ status: "cancelled" });
    },
  };
}

export interface TipView {
  status: "idle" | "preparing" | "active";
  /** The wallet link and QR source. Non-null only while a request is being tracked. */
  uri: string | null;
  state: TipState;
}

export interface TipSession {
  /** Returns false when a request is already preparing or active (single flight). */
  begin(): boolean;
  /** User cancel of the current request: stops tracking and clears the URI. No-op when idle. */
  cancel(): void;
  /** Silently invalidates everything (acknowledgement removed, recipient changed). */
  reset(): void;
  /** reset(), and no further callbacks ever. */
  dispose(): void;
}

/**
 * Owns single flight and generations around the controller. `begin` claims the slot synchronously, so a double
 * activation cannot start two requests, and an SDK import that finishes after cancel/reset/dispose is dropped.
 * The URI is exposed only while its request is tracked and is cleared at start, cancel, reset, setup failure and
 * every terminal state, so the UI can never invite payment to an untracked request.
 */
export function createTipSession(options: {
  recipient: string;
  amount?: string;
  loadDeps: () => Promise<TipDeps>;
  newReference?: () => string;
  usedSignatures?: Set<string>;
  onChange: (view: TipView) => void;
}): TipSession {
  const amount = options.amount ?? TIP_AMOUNT_SOL;
  const usedSignatures = options.usedSignatures ?? new Set<string>();
  let generation = 0;
  let busy = false;
  let disposed = false;
  let controller: TipController | null = null;

  const emit = (view: TipView) => {
    if (!disposed) options.onChange(view);
  };
  const idle = (state: TipState): TipView => ({ status: "idle", uri: null, state });
  const invalidate = () => {
    generation++;
    busy = false;
    const current = controller;
    controller = null;
    current?.cancel();
  };

  return {
    begin() {
      if (busy || disposed) return false;
      busy = true;
      const mine = ++generation;
      const live = () => mine === generation && !disposed;
      emit({ status: "preparing", uri: null, state: { status: "idle" } });
      void (async () => {
        try {
          const request = createTipRequest({ recipient: options.recipient, reference: (options.newReference ?? createFreshReference)(), amount });
          const deps = await options.loadDeps();
          if (!live()) return;
          const next = createTipController(
            deps,
            { recipient: request.recipient, reference: request.reference, amount: request.amount },
            (state) => {
              if (!live() || controller !== next) return;
              if (isTerminalTipState(state)) {
                busy = false;
                controller = null;
                emit(idle(state));
              } else {
                emit({ status: "active", uri: request.uri, state });
              }
            },
            usedSignatures,
          );
          controller = next;
          emit({ status: "active", uri: request.uri, state: { status: "idle" } });
          await next.start();
        } catch {
          if (!live()) return;
          busy = false;
          controller = null;
          emit(idle({ status: "failed", reason: "setup_failed", message: TIP_MESSAGES.setup_failed }));
        }
      })();
      return true;
    },
    cancel() {
      if (!busy) return;
      invalidate();
      emit(idle({ status: "cancelled" }));
    },
    reset() {
      const wasBusy = busy;
      invalidate();
      if (wasBusy) emit(idle({ status: "idle" }));
    },
    dispose() {
      invalidate();
      disposed = true;
    },
  };
}

/** Structural view of the pieces of `@solana/kit` RPC and `@solana/pay` that the Devnet wiring uses. */
export interface DevnetSdk {
  rpc: object;
  pay: {
    findReference(rpc: never, reference: never, options?: never): Promise<{ signature: string }>;
    validateTransfer(rpc: never, signature: never, fields: never, options?: never): Promise<unknown>;
    FindReferenceError: abstract new (...args: never[]) => Error;
  };
  /** `address()` from `@solana/kit`: validates and brands a base58 string. */
  toAddress(value: string): unknown;
}

/**
 * Returns an RPC view whose every request `send()` carries `abortSignal`. Installed `@solana/rpc-spec` supports
 * `send({ abortSignal })` and passes it to the transport as `signal`; `@solana/pay`'s `findReference` and
 * `validateTransfer` accept no signal themselves, so the signal is injected at the RPC layer.
 */
export function withAbortSignal<T extends object>(rpc: T, signal: AbortSignal): T {
  return new Proxy({} as T, {
    get: (_target, method) => (...args: unknown[]) => {
      const request = (rpc as Record<string | symbol, (...a: unknown[]) => { send(options?: object): Promise<unknown> }>)[method](...args);
      return { send: (options?: object) => request.send({ ...options, abortSignal: signal }) };
    },
  });
}

type SignalledRpc = {
  getGenesisHash(): { send(): Promise<string> };
  getTransaction(signature: never, config: never): { send(): Promise<unknown> };
};

/** Runtime deps backed by the maintained SDK. Only use with a Devnet RPC; the genesis check enforces it. */
export function createDevnetDeps(sdk: DevnetSdk): TipDeps {
  const scoped = (signal: AbortSignal) => withAbortSignal(sdk.rpc, signal) as unknown as SignalledRpc;
  return {
    getGenesisHash: (signal) => scoped(signal).getGenesisHash().send(),
    async findReference(reference, signal) {
      try {
        const found = await sdk.pay.findReference(scoped(signal) as never, sdk.toAddress(reference) as never, { commitment: "confirmed" } as never);
        return { signature: found.signature };
      } catch (error) {
        if (error instanceof sdk.pay.FindReferenceError) return null;
        throw error;
      }
    },
    validateTransfer: (signature, fields, signal) =>
      sdk.pay.validateTransfer(
        scoped(signal) as never,
        signature as never,
        { recipient: sdk.toAddress(fields.recipient), amount: fields.amount, reference: sdk.toAddress(fields.reference) } as never,
        { commitment: "confirmed" } as never,
      ),
    async getParsedTransaction(signature, signal) {
      const tx = await scoped(signal)
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
