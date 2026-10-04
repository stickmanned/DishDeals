import { describe, expect, it } from "vitest";
import * as pay from "@solana/pay";
import {
  AccountRole,
  address,
  createSolanaRpcFromTransport,
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
  createTipSession,
  isTerminalTipState,
  withAbortSignal,
  type TipView,
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

/** Deps with a fake clock: sleep registers a timer, `advance` fires due timers in order and flushes microtasks. */
function harness(over: Partial<TipDeps> = {}) {
  let clock = 0;
  const timers: { at: number; fire: () => void }[] = [];
  const calls = { find: 0, validate: 0, sleep: 0 };
  const signals: AbortSignal[] = [];
  const flush = async () => {
    for (let i = 0; i < 25; i++) await Promise.resolve();
  };
  const deps: TipDeps = {
    getGenesisHash: async (signal) => (signals.push(signal), DEVNET_GENESIS_HASH),
    findReference: async (_r, signal) => {
      calls.find++;
      signals.push(signal);
      return null;
    },
    validateTransfer: async (_s, _f, signal) => {
      calls.validate++;
      signals.push(signal);
      return {};
    },
    getParsedTransaction: async () => parsedTx(),
    now: () => clock,
    sleep: (ms, signal) =>
      new Promise<void>((resolve, reject) => {
        calls.sleep++;
        if (signal.aborted) return reject(new Error("aborted"));
        const timer = { at: clock + ms, fire: resolve };
        timers.push(timer);
        signal.addEventListener(
          "abort",
          () => {
            timers.splice(timers.indexOf(timer), 1);
            reject(new Error("aborted"));
          },
          { once: true },
        );
      }),
    ...over,
  };
  const states: TipState[] = [];
  return {
    deps,
    calls,
    states,
    signals,
    timers,
    flush,
    onState: (s: TipState) => states.push(s),
    async advance(ms: number) {
      const target = clock + ms;
      await flush();
      for (;;) {
        const due = timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers.splice(timers.indexOf(due), 1);
        clock = due.at;
        due.fire();
        await flush();
      }
      clock = target;
      await flush();
    },
  };
}

const hang = <T,>() => new Promise<T>(() => undefined);

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
  const found = { findReference: async () => ({ signature: "SIG1" }) };

  it("received only after find + SDK + exact check, with a genuine explorer link", async () => {
    const h = harness(found);
    const result = await createTipController(h.deps, expected, h.onState).start();
    expect(result).toEqual({ status: "received", signature: "SIG1", explorerUrl: devnetExplorerUrl("SIG1") });
    expect(h.calls.validate).toBe(1);
    expect(h.timers).toHaveLength(0); // deadline timer cleared
  });

  it("findReference alone is not a receipt: SDK rejection fails closed", async () => {
    const h = harness({ ...found, validateTransfer: async () => Promise.reject(new Error("amount not transferred")) });
    expect(await createTipController(h.deps, expected, h.onState).start()).toMatchObject({ status: "failed", reason: "wrong_amount" });
  });

  it("our exact check rejects an overpayment the SDK would accept", async () => {
    const h = harness({ ...found, getParsedTransaction: async () => parsedTx({ lamports: 20_000_000 }) });
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

  it("rejects a reused signature, and marks a signature used after a receipt", async () => {
    const h = harness(found);
    expect(await createTipController(h.deps, expected, h.onState, new Set(["SIG1"])).start()).toMatchObject({ reason: "reused_signature" });
    expect(h.calls.validate).toBe(0);
    const used = new Set<string>();
    await createTipController(h.deps, expected, h.onState, used).start();
    expect(await createTipController(h.deps, expected, h.onState, used).start()).toMatchObject({ reason: "reused_signature" });
  });

  it("polls every 2s and ends as unknown at the 2 minute deadline, never failed", async () => {
    const h = harness();
    const done = createTipController(h.deps, expected, h.onState).start();
    await h.advance(POLL_MAX_MS);
    expect(await done).toMatchObject({ status: "unknown" });
    expect(h.calls.find).toBe(POLL_MAX_MS / POLL_INTERVAL_MS);
    expect(h.states.some((s) => s.status === "failed")).toBe(false);
    expect(h.states.filter(isTerminalTipState)).toHaveLength(1);
    expect(h.timers).toHaveLength(0);
  });

  it("finds a payment that arrives on a later poll", async () => {
    let n = 0;
    const h = harness({ findReference: async () => (++n === 3 ? { signature: "LATE" } : null) });
    const done = createTipController(h.deps, expected, h.onState).start();
    await h.advance(POLL_INTERVAL_MS * 2);
    expect(await done).toMatchObject({ status: "received", signature: "LATE" });
  });

  describe.each([
    ["genesis check", { getGenesisHash: () => hang<string>() }],
    ["findReference", { findReference: () => hang<null>() }],
    ["SDK validateTransfer", { findReference: async () => ({ signature: "SIG1" }), validateTransfer: () => hang<unknown>() }],
    ["parsed getTransaction", { findReference: async () => ({ signature: "SIG1" }), getParsedTransaction: () => hang<null>() }],
  ] as const)("a hanging %s", (_name, over) => {
    it("ends as unknown at the deadline, aborts the in-flight call, and consumes no signature", async () => {
      const h = harness(over as Partial<TipDeps>);
      const used = new Set<string>();
      const done = createTipController(h.deps, expected, h.onState, used).start();
      await h.advance(POLL_MAX_MS - 1);
      expect(h.states.filter(isTerminalTipState)).toHaveLength(0);
      await h.advance(1);
      expect(await done).toMatchObject({ status: "unknown" });
      expect(h.states.at(-1)).toMatchObject({ status: "unknown" });
      expect(used.size).toBe(0);
    });

    it("cancel settles start promptly without advancing time", async () => {
      const h = harness(over as Partial<TipDeps>);
      const controller = createTipController(h.deps, expected, h.onState);
      const done = controller.start();
      await h.flush();
      controller.cancel();
      expect(await done).toEqual({ status: "cancelled" });
      expect(h.timers).toHaveLength(0);
    });
  });

  it("passes an abort signal to every call and aborts it on cancel and on deadline", async () => {
    const h = harness({ findReference: async (_r, signal) => (h.signals.push(signal), hang<null>()) });
    const controller = createTipController(h.deps, expected, h.onState);
    const done = controller.start();
    await h.flush();
    expect(h.signals.length).toBeGreaterThan(0);
    expect(h.signals.every((s) => !s.aborted)).toBe(true);
    controller.cancel();
    await done;
    expect(h.signals.every((s) => s.aborted)).toBe(true);
  });

  it("a validation that completes after cancel or deadline cannot emit received or consume the signature", async () => {
    for (const how of ["cancel", "deadline"] as const) {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const h = harness({
        findReference: async () => ({ signature: "SIG1" }),
        validateTransfer: async () => {
          await gate;
          return {};
        },
      });
      const used = new Set<string>();
      const controller = createTipController(h.deps, expected, h.onState, used);
      const done = controller.start();
      await h.flush();
      if (how === "cancel") controller.cancel();
      else await h.advance(POLL_MAX_MS);
      release();
      await h.flush();
      expect(await done).toMatchObject({ status: how === "cancel" ? "cancelled" : "unknown" });
      expect(h.states.some((s) => s.status === "received")).toBe(false);
      expect(used.size).toBe(0);
    }
  });

  it("cancel during the poll sleep ends the loop and clears the timers", async () => {
    const h = harness();
    const controller = createTipController(h.deps, expected, h.onState);
    const done = controller.start();
    await h.advance(POLL_INTERVAL_MS);
    controller.cancel();
    expect(await done).toEqual({ status: "cancelled" });
    expect(h.timers).toHaveLength(0);
    expect(h.states.filter(isTerminalTipState)).toHaveLength(1);
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

describe("session: single flight, generations, QR/URI lifetime", () => {
  function sessionHarness(recipient = RECIPIENT) {
    const loads: { resolve: (d: TipDeps) => void; reject: (e: Error) => void }[] = [];
    const views: TipView[] = [];
    let refs = 0;
    const h = harness({ findReference: async () => null });
    const session = createTipSession({
      recipient,
      loadDeps: () => new Promise<TipDeps>((resolve, reject) => loads.push({ resolve, reject })),
      newReference: () => key(20 + refs++),
      onChange: (v) => views.push(v),
    });
    return { session, loads, views, h, last: () => views.at(-1) as TipView, flush: h.flush };
  }

  it("claims the slot synchronously: a double activation loads and starts once", async () => {
    const s = sessionHarness();
    expect(s.session.begin()).toBe(true);
    expect(s.session.begin()).toBe(false);
    expect(s.loads).toHaveLength(1);
    expect(s.last()).toMatchObject({ status: "preparing", uri: null });
  });

  it("exposes the URI only while the request is tracked and clears it on every terminal state", async () => {
    const s = sessionHarness();
    s.session.begin();
    s.loads[0].resolve(s.h.deps);
    await s.flush();
    expect(s.last().status).toBe("active");
    expect(s.last().uri).toMatch(/^solana:/);
    await s.h.advance(POLL_MAX_MS);
    expect(s.last()).toMatchObject({ status: "idle", uri: null, state: { status: "unknown" } });
    expect(s.session.begin()).toBe(true); // slot released after the terminal state
  });

  it("an SDK import that finishes after cancel is dropped: no controller, no QR", async () => {
    const s = sessionHarness();
    s.session.begin();
    s.session.cancel();
    expect(s.last()).toMatchObject({ status: "idle", uri: null, state: { status: "cancelled" } });
    s.loads[0].resolve(s.h.deps);
    await s.flush();
    expect(s.views.some((v) => v.status === "active")).toBe(false);
    expect(s.h.calls.find).toBe(0);
  });

  it("a stale import cannot take over after cancel + a new begin; only the new request is tracked", async () => {
    const s = sessionHarness();
    s.session.begin();
    s.session.cancel();
    expect(s.session.begin()).toBe(true);
    s.loads[0].resolve(s.h.deps); // stale
    await s.flush();
    expect(s.views.some((v) => v.status === "active")).toBe(false);
    s.loads[1].resolve(s.h.deps);
    await s.flush();
    const active = s.views.filter((v) => v.status === "active");
    expect(new Set(active.map((v) => v.uri)).size).toBe(1);
    expect(active[0].uri).toContain(key(21)); // second fresh reference, not the cancelled first
  });

  it("reset (recipient change / acknowledgement removed) clears the URI and aborts the active request", async () => {
    const s = sessionHarness();
    s.session.begin();
    s.loads[0].resolve(s.h.deps);
    await s.flush();
    expect(s.last().uri).not.toBeNull();
    s.session.reset();
    expect(s.last()).toMatchObject({ status: "idle", uri: null });
    expect(s.h.signals.every((sig) => sig.aborted)).toBe(true);
    await s.h.advance(POLL_MAX_MS);
    expect(s.last().uri).toBeNull();
  });

  it("dispose (unmount) during preparing or active emits nothing afterwards", async () => {
    const s = sessionHarness();
    s.session.begin();
    s.session.dispose();
    const before = s.views.length;
    s.loads[0].resolve(s.h.deps);
    await s.flush();
    expect(s.views.length).toBe(before);
    expect(s.session.begin()).toBe(false);
    const t = sessionHarness();
    t.session.begin();
    t.loads[0].resolve(t.h.deps);
    await t.flush();
    t.session.dispose();
    const count = t.views.length;
    await t.h.advance(POLL_MAX_MS);
    expect(t.views.length).toBe(count);
    expect(t.h.signals.every((sig) => sig.aborted)).toBe(true);
  });

  it("setup failure clears the URI, reports setup_failed, and allows a retry", async () => {
    const s = sessionHarness();
    s.session.begin();
    s.loads[0].reject(new Error("chunk failed"));
    await s.flush();
    expect(s.last()).toMatchObject({ status: "idle", uri: null, state: { status: "failed", reason: "setup_failed" } });
    expect(s.session.begin()).toBe(true);
  });
});

describe("production createDevnetDeps over real @solana/kit RPC transport shapes (no network)", () => {
  type Seen = { method: string; signal?: AbortSignal; params: unknown[] };
  const sig64 = encodeBase58(new Uint8Array(64).fill(3));

  async function wire(amount: bigint, destination = RECIPIENT) {
    const ix = getTransferSolInstruction({ source: createNoopSigner(address(PAYER)), destination: address(destination), amount: lamports(amount) });
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayer(address(PAYER), m),
      (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: key(5) as never, lastValidBlockHeight: BigInt(1) }, m),
      (m) => appendTransactionMessageInstruction({ ...ix, accounts: [...ix.accounts, { address: address(REFERENCE), role: AccountRole.READONLY }] }, m),
    );
    return getBase64EncodedWireTransaction(compileTransaction(message));
  }

  /** Transport that records each request and answers per method; "hang" answers never, but honours `signal`. */
  function transportFor(answers: Record<string, unknown | "hang">, seen: Seen[] = []) {
    const transport = (async ({ payload, signal }: { payload: unknown; signal?: AbortSignal }) => {
      const { method, params, id } = payload as { method: string; params: unknown[]; id: string };
      seen.push({ method, signal, params });
      const answer = answers[method];
      if (answer === "hang") {
        return new Promise((_resolve, reject) => {
          if (signal?.aborted) return reject(new Error("aborted"));
          signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      }
      return { jsonrpc: "2.0", id, result: answer };
    }) as never;
    return { transport, seen };
  }

  /** getTransaction answers by requested encoding, as the real RPC does. */
  function answerFn(b64: string, pre: number, post: number, parsed: ParsedTipTransaction | null, base: Record<string, unknown> = {}) {
    const seen: Seen[] = [];
    const transport = (async ({ payload, signal }: { payload: unknown; signal?: AbortSignal }) => {
      const { method, params, id } = payload as { method: string; params: [string, { encoding: string }]; id: string };
      seen.push({ method, signal, params });
      if (method in base) {
        if (base[method] === "hang") {
          return new Promise((_r, reject) => {
            if (signal?.aborted) return reject(new Error("aborted"));
            signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          });
        }
        return { jsonrpc: "2.0", id, result: base[method] };
      }
      if (method === "getGenesisHash") return { jsonrpc: "2.0", id, result: DEVNET_GENESIS_HASH };
      if (method === "getSignaturesForAddress") {
        return { jsonrpc: "2.0", id, result: [{ signature: sig64, slot: 1, err: null, memo: null, blockTime: null, confirmationStatus: "confirmed" }] };
      }
      if (method === "getTransaction") {
        const result =
          params[1].encoding === "base64"
            ? { slot: 1, blockTime: null, transaction: [b64, "base64"], meta: { err: null, fee: 5000, preBalances: [1e9, pre, 1, 0], postBalances: [1e9, post, 1, 0], logMessages: [], rewards: [], status: { Ok: null } } }
            : parsed;
        return { jsonrpc: "2.0", id, result };
      }
      throw new Error(`unexpected method ${method}`);
    }) as never;
    return { rpc: createSolanaRpcFromTransport(transport), seen };
  }

  const okParsed = parsedTx();

  it("sends the abort signal to the Kit transport for every method, through pay's own helpers", async () => {
    const b64 = await wire(BigInt(10_000_000));
    const { rpc, seen } = answerFn(b64, 0, 10_000_000, okParsed);
    const deps = createDevnetDeps({ rpc, pay, toAddress: address });
    const ac = new AbortController();
    expect(await deps.getGenesisHash(ac.signal)).toBe(DEVNET_GENESIS_HASH);
    expect(await deps.findReference(REFERENCE, ac.signal)).toEqual({ signature: sig64 });
    await expect(deps.validateTransfer(sig64, { recipient: RECIPIENT, amount: 0.01, reference: REFERENCE }, ac.signal)).resolves.toBeTruthy();
    expect(await deps.getParsedTransaction(sig64, ac.signal)).toMatchObject({ meta: { err: null } });
    expect(seen.map((r) => r.method)).toEqual(["getGenesisHash", "getSignaturesForAddress", "getTransaction", "getTransaction"]);
    expect(seen.every((r) => r.signal === ac.signal)).toBe(true);
  });

  it("aborting the signal rejects a hanging real Kit request", async () => {
    const seen: Seen[] = [];
    const { transport } = transportFor({ getGenesisHash: "hang" }, seen);
    const deps = createDevnetDeps({ rpc: createSolanaRpcFromTransport(transport), pay, toAddress: address });
    const ac = new AbortController();
    const pending = deps.getGenesisHash(ac.signal);
    ac.abort();
    await expect(pending).rejects.toThrow();
    expect(seen[0].signal?.aborted).toBe(true);
  });

  it("findReference with no signatures resolves null (not an error)", async () => {
    const { rpc } = answerFn("", 0, 0, null, { getSignaturesForAddress: [] });
    const deps = createDevnetDeps({ rpc, pay, toAddress: address });
    expect(await deps.findReference(REFERENCE, new AbortController().signal)).toBeNull();
  });

  it("end to end: controller + production deps + real SDK validate -> received", async () => {
    const b64 = await wire(BigInt(10_000_000));
    const { rpc } = answerFn(b64, 0, 10_000_000, okParsed);
    const result = await createTipController(createDevnetDeps({ rpc, pay, toAddress: address }), expected, () => undefined).start();
    expect(result).toMatchObject({ status: "received", signature: sig64 });
  });

  it("end to end: wrong recipient on chain, underpayment, and overpayment each fail closed", async () => {
    const wrongTo = answerFn(await wire(BigInt(10_000_000), key(8)), 0, 10_000_000, parsedTx({ to: key(8) }));
    expect(await createTipController(createDevnetDeps({ rpc: wrongTo.rpc, pay, toAddress: address }), expected, () => undefined).start()).toMatchObject({ status: "failed" });
    const under = answerFn(await wire(BigInt(5_000_000)), 0, 5_000_000, parsedTx({ lamports: 5_000_000 }));
    expect(await createTipController(createDevnetDeps({ rpc: under.rpc, pay, toAddress: address }), expected, () => undefined).start()).toMatchObject({ status: "failed", reason: "wrong_amount" });
    const over = answerFn(await wire(BigInt(20_000_000)), 0, 20_000_000, parsedTx({ lamports: 20_000_000 }));
    expect(await createTipController(createDevnetDeps({ rpc: over.rpc, pay, toAddress: address }), expected, () => undefined).start()).toMatchObject({ status: "failed", reason: "wrong_amount" });
  });

  it("end to end: wrong network fails closed through the real transport", async () => {
    const { rpc } = answerFn("", 0, 0, null, { getGenesisHash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" });
    expect(await createTipController(createDevnetDeps({ rpc, pay, toAddress: address }), expected, () => undefined).start()).toMatchObject({ reason: "wrong_network" });
  });

  it("end to end: a hanging real transport call settles promptly on cancel and aborts the transport", async () => {
    const { rpc, seen } = answerFn("", 0, 0, null, { getSignaturesForAddress: "hang" });
    const controller = createTipController(createDevnetDeps({ rpc, pay, toAddress: address }), expected, () => undefined);
    const done = controller.start();
    for (let i = 0; i < 25; i++) await Promise.resolve();
    expect(seen.some((r) => r.method === "getSignaturesForAddress")).toBe(true);
    controller.cancel();
    expect(await done).toEqual({ status: "cancelled" });
    expect(seen.every((r) => r.signal?.aborted)).toBe(true);
  });

  it("withAbortSignal forwards the signal and preserves other send options", async () => {
    const calls: unknown[] = [];
    const fake = { getSlot: () => ({ send: async (o?: object) => calls.push(o) }) };
    const ac = new AbortController();
    await (withAbortSignal(fake, ac.signal) as { getSlot(): { send(o?: object): Promise<unknown> } }).getSlot().send({ x: 1 });
    expect(calls).toEqual([{ x: 1, abortSignal: ac.signal }]);
  });
});
