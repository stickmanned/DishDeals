import { describe, expect, it } from "vitest";
import * as pay from "@solana/pay";
import {
  AccountRole,
  address,
  appendTransactionMessageInstruction,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  lamports,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { encodeBase58 } from "../../lib/tipRequest";
import {
  DEVNET_GENESIS_HASH,
  POLL_INTERVAL_MS,
  POLL_MAX_MS,
  TIP_AMOUNT_SOL,
  assertExactTipTransfer,
  createDevnetDeps,
  createFreshReference,
  createTipController,
  devnetExplorerUrl,
  solToLamports,
  type ParsedTipTransaction,
  type TipDeps,
  type TipState,
} from "../../lib/tipReceipt";

const key = (n: number) => encodeBase58(new Uint8Array(32).fill(n));
const RECIPIENT = key(7);
const PAYER = key(9);
const REFERENCE = key(11);
const expected = { recipient: RECIPIENT, reference: REFERENCE, amount: TIP_AMOUNT_SOL };

function parsedTx(over: { err?: unknown; to?: string; lamports?: number | string; refs?: string[] } = {}): ParsedTipTransaction {
  return {
    meta: { err: over.err ?? null },
    transaction: {
      message: {
        accountKeys: [PAYER, over.to ?? RECIPIENT, ...(over.refs ?? [REFERENCE]), "11111111111111111111111111111111"].map((pubkey) => ({ pubkey })),
        instructions: [
          { program: "system", parsed: { type: "transfer", info: { destination: over.to ?? RECIPIENT, lamports: over.lamports ?? 10_000_000 } } },
        ],
      },
    },
  };
}

/** Fake clock + deps; sleep advances the clock instead of waiting. */
function harness(over: Partial<TipDeps> = {}) {
  let clock = 0;
  const calls = { find: 0, validate: 0, sleep: 0 };
  const deps: TipDeps = {
    getGenesisHash: async () => DEVNET_GENESIS_HASH,
    findReference: async () => {
      calls.find++;
      return null;
    },
    validateTransfer: async () => {
      calls.validate++;
      return {};
    },
    getParsedTransaction: async () => parsedTx(),
    now: () => clock,
    sleep: async (ms) => {
      calls.sleep++;
      clock += ms;
    },
    ...over,
  };
  const states: TipState[] = [];
  return { deps, calls, states, onState: (s: TipState) => states.push(s), advance: (ms: number) => (clock += ms) };
}

describe("lamport precision and URI inputs", () => {
  it("converts exact decimals without floats", () => {
    expect(solToLamports("0.01")).toBe(BigInt(10_000_000));
    expect(solToLamports("0.000000001")).toBe(BigInt(1));
    expect(solToLamports("1.1")).toBe(BigInt(1_100_000_000));
    expect(() => solToLamports("0.0000000001")).toThrow();
    expect(() => solToLamports("0")).toThrow();
    expect(() => solToLamports("1e-2")).toThrow();
  });
  it("builds a Devnet explorer link for a signature only", () => {
    expect(devnetExplorerUrl("abc")).toBe("https://explorer.solana.com/tx/abc?cluster=devnet");
  });
});

describe("fresh reference", () => {
  it("uses secure random bytes, is 32 bytes, and differs per request", () => {
    const a = createFreshReference();
    const b = createFreshReference();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });
  it("rejects a dead or short random source", () => {
    expect(() => createFreshReference((bytes) => bytes)).toThrow(/random/);
    expect(() => createFreshReference(() => new Uint8Array(16).fill(1))).toThrow();
  });
});

describe("exact transaction check", () => {
  it("accepts the exact transfer", () => expect(() => assertExactTipTransfer(parsedTx(), expected)).not.toThrow());
  it.each([
    ["wrong amount (less)", parsedTx({ lamports: 9_999_999 }), "wrong_amount"],
    ["wrong amount (more)", parsedTx({ lamports: 10_000_001 }), "wrong_amount"],
    ["wrong recipient", parsedTx({ to: key(8) }), "wrong_recipient"],
    ["missing reference", parsedTx({ refs: [key(12)] }), "wrong_reference"],
    ["failed transaction", parsedTx({ err: { InstructionError: [0, "Custom"] } }), "transaction_failed"],
    ["no meta", { meta: null, transaction: parsedTx().transaction }, "invalid_transaction"],
  ] as const)("rejects %s", (_n, tx, reason) => {
    expect(() => assertExactTipTransfer(tx as ParsedTipTransaction, expected)).toThrowError(expect.objectContaining({ reason }));
  });
});

describe("controller", () => {
  it("received only after find + SDK + exact check, with a genuine explorer link", async () => {
    const h = harness({ findReference: async () => ({ signature: "SIG1" }) });
    const result = await createTipController(h.deps, expected, h.onState).start();
    expect(result).toEqual({ status: "received", signature: "SIG1", explorerUrl: devnetExplorerUrl("SIG1") });
    expect(h.calls.validate).toBe(1);
  });

  it("findReference alone is not a receipt: SDK rejection fails closed", async () => {
    const h = harness({
      findReference: async () => ({ signature: "SIG1" }),
      validateTransfer: async () => {
        throw new Error("amount not transferred");
      },
    });
    expect(await createTipController(h.deps, expected, h.onState).start()).toMatchObject({ status: "failed", reason: "wrong_amount" });
  });

  it("our exact check rejects an overpayment the SDK would accept", async () => {
    const h = harness({
      findReference: async () => ({ signature: "SIG1" }),
      getParsedTransaction: async () => parsedTx({ lamports: 20_000_000 }),
    });
    expect(await createTipController(h.deps, expected, h.onState).start()).toMatchObject({ status: "failed", reason: "wrong_amount" });
  });

  it("fails closed on the wrong network without finding anything", async () => {
    const h = harness({ getGenesisHash: async () => "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" });
    expect(await createTipController(h.deps, expected, h.onState).start()).toMatchObject({ status: "failed", reason: "wrong_network" });
    expect(h.calls.find).toBe(0);
  });

  it("fails closed when the RPC is unavailable, at identity and at poll", async () => {
    const a = harness({ getGenesisHash: async () => Promise.reject(new Error("down")) });
    expect(await createTipController(a.deps, expected, a.onState).start()).toMatchObject({ reason: "rpc_unavailable" });
    const b = harness({ findReference: async () => Promise.reject(new Error("down")) });
    expect(await createTipController(b.deps, expected, b.onState).start()).toMatchObject({ reason: "rpc_unavailable" });
  });

  it("rejects a reused signature", async () => {
    const used = new Set(["SIG1"]);
    const h = harness({ findReference: async () => ({ signature: "SIG1" }) });
    expect(await createTipController(h.deps, expected, h.onState, used).start()).toMatchObject({ reason: "reused_signature" });
    expect(h.calls.validate).toBe(0);
  });

  it("marks a signature used after a receipt so a second request cannot reuse it", async () => {
    const used = new Set<string>();
    const h = harness({ findReference: async () => ({ signature: "SIG1" }) });
    await createTipController(h.deps, expected, h.onState, used).start();
    expect(await createTipController(h.deps, expected, h.onState, used).start()).toMatchObject({ reason: "reused_signature" });
  });

  it("polls every 2s and times out as unknown after 2 minutes, never failed", async () => {
    const h = harness();
    const result = await createTipController(h.deps, expected, h.onState).start();
    expect(result.status).toBe("unknown");
    expect(h.calls.find).toBe(POLL_MAX_MS / POLL_INTERVAL_MS);
    expect(h.states.some((s) => s.status === "failed")).toBe(false);
  });

  it("finds a payment that arrives on a later poll", async () => {
    let n = 0;
    const h = harness({ findReference: async () => (++n === 3 ? { signature: "LATE" } : null) });
    expect(await createTipController(h.deps, expected, h.onState).start()).toMatchObject({ status: "received", signature: "LATE" });
    expect(h.calls.sleep).toBe(2);
  });

  it("cancel stops polling and emits no stale result", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const h = harness({
      findReference: async () => {
        await gate;
        return { signature: "STALE" };
      },
    });
    const controller = createTipController(h.deps, expected, h.onState);
    const done = controller.start();
    await Promise.resolve();
    controller.cancel();
    release();
    expect(await done).toEqual({ status: "cancelled" });
    expect(h.states.at(-1)).toEqual({ status: "cancelled" });
    expect(h.states.some((s) => s.status === "received")).toBe(false);
    expect(h.calls.validate).toBe(0);
  });

  it("cancel during sleep ends the loop", async () => {
    const ref: { controller?: ReturnType<typeof createTipController> } = {};
    const h = harness({
      sleep: async (_ms, signal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
          queueMicrotask(() => ref.controller?.cancel());
        }),
    });
    ref.controller = createTipController(h.deps, expected, h.onState);
    expect(await ref.controller.start()).toEqual({ status: "cancelled" });
    expect(h.calls.find).toBe(1);
  });

  it("starts at most once and rejects invalid inputs before any RPC", async () => {
    const h = harness();
    const c = createTipController(h.deps, expected, h.onState);
    void c.start();
    expect(() => c.start()).toThrow(/already started/);
    c.cancel();
    const bad = harness();
    await expect(createTipController(bad.deps, { ...expected, amount: "0.0000000001" }, bad.onState).start()).rejects.toThrow();
    expect(bad.calls.find).toBe(0);
  });
});

describe("real @solana/pay validateTransfer on a synthetic transaction (no RPC)", () => {
  async function wireTx(amount: bigint, destination = RECIPIENT, reference = REFERENCE) {
    const ix = getTransferSolInstruction({
      source: createNoopSigner(address(PAYER)),
      destination: address(destination),
      amount: lamports(amount),
    });
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayer(address(PAYER), m),
      (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: key(5) as never, lastValidBlockHeight: BigInt(1) }, m),
      (m) =>
        appendTransactionMessageInstruction(
          { ...ix, accounts: [...ix.accounts, { address: address(reference), role: AccountRole.READONLY }] },
          m,
        ),
    );
    return getBase64EncodedWireTransaction(compileTransaction(message));
  }

  function sdkFor(base64: string, balances: { pre: bigint; post: bigint }) {
    const rpc = {
      getGenesisHash: () => ({ send: async () => DEVNET_GENESIS_HASH }),
      getSignaturesForAddress: () => ({ send: async () => [{ signature: "SIG1" }] }),
      getTransaction: (_sig: unknown, config: { encoding: string }) => ({
        send: async () =>
          config.encoding === "base64"
            ? {
                slot: BigInt(1),
                blockTime: null,
                transaction: [base64, "base64"],
                // account order: payer(0, writable signer), recipient(1), system program, reference
                meta: { err: null, fee: BigInt(5000), preBalances: [BigInt(1e9), balances.pre, BigInt(1), BigInt(0)], postBalances: [BigInt(1e9), balances.post, BigInt(1), BigInt(0)], logMessages: [], rewards: [], status: { Ok: null } },
              }
            : null,
      }),
    };
    return { rpc, pay, toAddress: address } as unknown as Parameters<typeof createDevnetDeps>[0];
  }

  it("accepts a real System transfer of exactly 0.01 SOL with the reference", async () => {
    const deps = createDevnetDeps(sdkFor(await wireTx(BigInt(10_000_000)), { pre: BigInt(0), post: BigInt(10_000_000) }));
    await expect(deps.validateTransfer("SIG1", { recipient: RECIPIENT, amount: 0.01, reference: REFERENCE })).resolves.toBeTruthy();
    expect(await deps.findReference(REFERENCE)).toEqual({ signature: "SIG1" });
  });

  it("rejects a different recipient, a different reference, and an underpayment", async () => {
    const good = sdkFor(await wireTx(BigInt(10_000_000)), { pre: BigInt(0), post: BigInt(10_000_000) });
    const deps = createDevnetDeps(good);
    await expect(deps.validateTransfer("SIG1", { recipient: key(8), amount: 0.01, reference: REFERENCE })).rejects.toThrow();
    await expect(deps.validateTransfer("SIG1", { recipient: RECIPIENT, amount: 0.01, reference: key(12) })).rejects.toThrow();
    const under = createDevnetDeps(sdkFor(await wireTx(BigInt(5_000_000)), { pre: BigInt(0), post: BigInt(5_000_000) }));
    await expect(under.validateTransfer("SIG1", { recipient: RECIPIENT, amount: 0.01, reference: REFERENCE })).rejects.toThrow(/amount/);
  });
});
