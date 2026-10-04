// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// In-memory convex-test of the native supplied-context path (N-SOURCE-D): storage atomicity, immutability, privacy,
// bounds, model passthrough, evidence validation and the truncated-source block. All identities, recordings and the
// Gemini transport are SYNTHETIC. This is not live Convex, a real model, the Swift bridge, Instagram or a phone.
import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import { NATIVE_CONTEXT_REJECTED, NATIVE_CONTEXT_TRUNCATED_CODE, type NativeContext } from "../../lib/reels/nativeContext";

const sdk = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = sdk; } }));
const modules = import.meta.glob(["../../convex/**/*.ts", "!../../convex/**/*.test.ts"]);
const link = "https://www.instagram.com/reel/AbCdEf123/";
const T0 = new Date("2026-10-04T12:00:00Z").getTime();
const FRAGMENTS = ["Cafe Aroma lunch special", "$8 bowl, Mon to Fri"];
const context = (over: Partial<NativeContext> = {}): NativeContext => ({ version: 1, textFragments: FRAGMENTS, registeredTypes: ["public.url", "public.plain-text"], receivedAt: T0 / 1000 - 60, truncated: false, ...over });
const enableModel = () => { for (const [k, v] of Object.entries({ REEL_MEDIA_USAGE_AUTHORIZED: "true", GEMINI_API_KEY: "synthetic", GEMINI_REEL_MODEL: "synthetic-model" })) vi.stubEnv(k, v); };
const draft = { restaurant: null, address: null, dealText: "$8 bowl", price: 8, currency: null, validDays: null, validStart: null, validEnd: null, expiresOn: null, conditions: null };
const modelAnswer = (quote: string) => ({ candidates: [{ finishReason: "STOP" }], text: JSON.stringify({ isDeal: true, drafts: [draft], transcript: "", warnings: [], evidence: [
  { draftIndex: 0, field: "dealText", channel: "caption", quote, timestampSeconds: null }, { draftIndex: 0, field: "price", channel: "caption", quote: "$8", timestampSeconds: null }] }) });

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); sdk.generateContent.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

async function setup() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  const [a, b] = await t.run(async ctx => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  const alice = t.withIdentity({ subject: `${a}|session` }), bob = t.withIdentity({ subject: `${b}|session` });
  const row = (itemId: string) => t.run(ctx => ctx.db.get(itemId as never) as Promise<Record<string, unknown> | null>);
  const settle = async () => { for (let i = 0; i < 40; i++) { vi.advanceTimersByTime(200); await t.finishInProgressScheduledFunctions(); } };
  const attach = async (itemId: never, ownerId: never, expectedGeneration: number, caption: string | null = null) => {
    const videoId = await t.run(ctx => ctx.storage.store(new Blob(["synthetic recording bytes"], { type: "video/mp4" })));
    return { videoId, result: await t.mutation(internal.reels.attachSupplied, { itemId, ownerId, expectedGeneration, videoId, mediaMime: "video/mp4", mediaBytes: 25, duration: 12, caption, publishedAt: null }) };
  };
  return { t, a, b, alice, bob, row, settle, attach };
}
type S = Awaited<ReturnType<typeof setup>>;
const submitWith = async (s: S, nativeContext?: NativeContext) => (await s.alice.mutation(api.reels.submit, { text: link, ...(nativeContext ? { nativeContext } : {}) })).itemId;

describe("atomic private storage", () => {
  it("stores the context in the same insert as the item, with first-receipt fields intact", async () => {
    const s = await setup();
    const itemId = await submitWith(s, context());
    expect((await s.row(itemId))!.nativeContext).toEqual(context());
    expect(await s.alice.query(api.reels.get, { itemId })).toMatchObject({ nativeContext: context() });
  });
  it("leaves the field absent for an ordinary or old context-less submit, which is never read as complete context", async () => {
    const s = await setup();
    const itemId = await submitWith(s);
    expect("nativeContext" in (await s.row(itemId))!).toBe(false);
  });
  it("is private: another account sees neither the item nor the context, and its own same-URL save has none", async () => {
    const s = await setup();
    const itemId = await submitWith(s, context());
    await expect(s.bob.query(api.reels.get, { itemId })).rejects.toThrow("Item not found");
    expect(await s.bob.query(api.reels.list, {})).toEqual([]);
    const bobItem = (await s.bob.mutation(api.reels.submit, { text: link })).itemId;
    expect(bobItem).not.toBe(itemId);
    expect("nativeContext" in (await s.row(bobItem))!).toBe(false);
    expect((await s.alice.query(api.reels.list, {}))[0].nativeContext).toEqual(context());
    await expect(s.t.query(api.reels.get, { itemId })).rejects.toThrow("Not signed in");
  });
  it("never reaches canonical public deals or any table other than the owner's reel item", async () => {
    const s = await setup();
    await submitWith(s, context());
    expect(await s.t.run(ctx => ctx.db.query("deals").collect())).toEqual([]);
    expect(await s.t.run(ctx => ctx.db.query("dealUploads").collect())).toEqual([]);
    const dumps = await s.t.run(async ctx => JSON.stringify([await ctx.db.query("reelLimits").collect(), await ctx.db.query("profiles").collect(), await ctx.db.query("votes").collect()]));
    expect(dumps).not.toContain("Cafe Aroma");
  });
  it("expires with the owned item: its context is deleted with it", async () => {
    const s = await setup();
    const itemId = await s.alice.mutation(api.reels.submit, { text: link, retentionDays: 1, nativeContext: context() }).then(r => r.itemId);
    const expiresAt = (await s.row(itemId))!.expiresAt as number;
    vi.setSystemTime(expiresAt + 1);
    await s.t.mutation(internal.reels.expire, { itemId, expiresAt });
    expect(await s.row(itemId)).toBeNull();
    expect(await s.alice.query(api.reels.list, {})).toEqual([]);
  });
  it("the workflow work item omits the private text; only the extraction source query returns it", async () => {
    const s = await setup();
    const itemId = await submitWith(s, context());
    expect(await s.t.query(internal.reels.workItem, { itemId, generation: 1 })).not.toHaveProperty("nativeContext");
    expect(await s.t.query(internal.reels.workSource, { itemId, generation: 1 })).toMatchObject({ nativeContext: context() });
  });
});

describe("immutable first receipt", () => {
  it("a duplicate submit never overwrites the existing context or the manual caption, and creates nothing", async () => {
    const s = await setup();
    const itemId = await submitWith(s, context());
    const ownerId = (await s.row(itemId))!.ownerId as never;
    await s.attach(itemId as never, ownerId, 1, "My edited caption");
    const before = await s.row(itemId);
    const other = context({ textFragments: ["Different text"], truncated: true, receivedAt: T0 / 1000 - 5 });
    const again = await s.alice.mutation(api.reels.submit, { text: link, nativeContext: other });
    expect(again).toEqual({ itemId, duplicate: true });
    expect(await s.row(itemId)).toEqual(before);
    expect((await s.row(itemId))!.caption).toBe("My edited caption");
    expect(await s.t.run(ctx => ctx.db.query("reelItems").collect())).toHaveLength(1);
  });
  it("a context-less first save is not retroactively given context by a later duplicate", async () => {
    const s = await setup();
    const itemId = await submitWith(s);
    const again = await s.alice.mutation(api.reels.submit, { text: link, nativeContext: context() });
    expect(again).toEqual({ itemId, duplicate: true });
    expect("nativeContext" in (await s.row(itemId))!).toBe(false);
  });
  it("an invalid context on a duplicate is rejected too, leaving the first receipt untouched", async () => {
    const s = await setup();
    const itemId = await submitWith(s, context());
    const before = await s.row(itemId);
    await expect(s.alice.mutation(api.reels.submit, { text: link, nativeContext: context({ receivedAt: T0 }) })).rejects.toThrow(NATIVE_CONTEXT_REJECTED);
    expect(await s.row(itemId)).toEqual(before);
  });
  it("an expired item is replaced by the new save with its new context", async () => {
    const s = await setup();
    const itemId = await s.alice.mutation(api.reels.submit, { text: link, retentionDays: 1, nativeContext: context() }).then(r => r.itemId);
    vi.setSystemTime(T0 + 2 * 86400000);
    const fresh = context({ textFragments: ["Fresh text"], receivedAt: (T0 + 2 * 86400000) / 1000 - 1 });
    const again = await s.alice.mutation(api.reels.submit, { text: link, nativeContext: fresh });
    expect(again.duplicate).toBe(false);
    expect((await s.row(again.itemId))!.nativeContext).toEqual(fresh);
    expect(await s.row(itemId)).toBeNull();
  });
});

describe("strict bounded rejection (no raw internal errors, nothing saved)", () => {
  const bad: [string, NativeContext][] = [
    ["nine fragments", context({ textFragments: Array.from({ length: 9 }, (_, i) => `fragment ${i}`) })],
    ["oversized fragment", context({ textFragments: ["a".repeat(4097)] })],
    ["oversized combined text", context({ textFragments: ["a".repeat(4000), "b".repeat(4000), "c".repeat(4001)] })],
    ["33 types", context({ registeredTypes: Array.from({ length: 33 }, (_, i) => `public.t${i}`) })],
    ["oversized type", context({ registeredTypes: ["t".repeat(201)] })],
    ["duplicate fragments", context({ textFragments: ["same", "same"] })],
    ["empty fragment", context({ textFragments: [""] })],
    ["lone surrogate", context({ textFragments: ["bad \uD800"] })],
    ["future clock", context({ receivedAt: T0 })],
    ["negative clock", context({ receivedAt: -1 })],
    ["NaN clock", context({ receivedAt: NaN })],
    ["Infinity clock", context({ receivedAt: Infinity })],
    ["whole JSON over 24000 bytes", context({ textFragments: ["\u0001".repeat(4000), "\u0002".repeat(4000), "\u0003".repeat(4000)] })],
  ];
  it.each(bad)("rejects %s with the safe message and saves nothing", async (_name, nativeContext) => {
    const s = await setup();
    const error = await s.alice.mutation(api.reels.submit, { text: link, nativeContext }).then(() => null, (e: Error) => e);
    expect(error?.message).toContain(NATIVE_CONTEXT_REJECTED);
    expect(error?.message).not.toContain("Cafe Aroma");
    expect(error?.message).not.toMatch(/stack|Id<|at /i);
    expect(await s.t.run(ctx => ctx.db.query("reelItems").collect())).toEqual([]);
    expect(await s.t.run(ctx => ctx.db.query("reelLimits").collect())).toEqual([]); // no rate-limit charge for a rejected save
  });
  it("rejects shapes the runtime validator forbids (extra key, wrong version, string clock) without saving", async () => {
    const s = await setup();
    for (const nativeContext of [{ ...context(), sourceUrl: link }, { ...context(), version: 2 }, { ...context(), receivedAt: "1" }, { ...context(), truncated: "no" }])
      await expect(s.alice.mutation(api.reels.submit, { text: link, nativeContext: nativeContext as never })).rejects.toThrow();
    expect(await s.t.run(ctx => ctx.db.query("reelItems").collect())).toEqual([]);
  });
  it("accepts the exact bounds (8 fragments, 12000 combined bytes, 32 types)", async () => {
    const s = await setup();
    const fragments = [..."abc"].map(c => c.repeat(4000));
    const itemId = await submitWith(s, context({ textFragments: fragments, registeredTypes: Array.from({ length: 32 }, (_, i) => `public.t${i}`) }));
    expect(((await s.row(itemId))!.nativeContext as NativeContext).textFragments).toEqual(fragments);
    const s2 = await setup();
    const eight = Array.from({ length: 8 }, (_, i) => `fragment ${i}`);
    expect(((await s2.row(await submitWith(s2, context({ textFragments: eight }))))!.nativeContext as NativeContext).textFragments).toEqual(eight);
  });
});

describe("model passthrough and evidence (labeled mock transport; not a live VLM)", () => {
  it("sends the actual recording, the editable caption and the supplied text as separate labeled parts, never merged", async () => {
    const s = await setup(); enableModel();
    const itemId = await submitWith(s, context());
    const { result, videoId } = await s.attach(itemId as never, (await s.row(itemId))!.ownerId as never, 1, "My manual caption");
    expect(result).toEqual({ attached: true, generation: 2 });
    sdk.generateContent.mockResolvedValueOnce(modelAnswer("$8 bowl"));
    const net = vi.spyOn(globalThis, "fetch");
    await s.settle();
    expect(sdk.generateContent).toHaveBeenCalledTimes(1);
    const parts = sdk.generateContent.mock.calls[0][0].contents[0].parts;
    expect(parts).toHaveLength(3);
    expect(parts[0].inlineData).toMatchObject({ mimeType: "video/mp4", data: expect.any(String) });
    expect(JSON.parse(parts[1].text)).toMatchObject({ caption: "My manual caption" });
    expect(parts[1].text).not.toContain("Cafe Aroma");
    expect(JSON.parse(parts[2].text).nativeSuppliedSource).toMatchObject({ complete: true, textFragments: FRAGMENTS });
    expect(JSON.stringify(parts)).not.toContain("public.url");
    expect(JSON.stringify(parts)).not.toContain(String(T0 / 1000 - 60));
    expect(net).not.toHaveBeenCalled();
    const done = await s.row(itemId);
    expect(done).toMatchObject({ status: "ready", caption: "My manual caption" }); // the editable caption is untouched
    expect((done!.nativeContext as NativeContext).textFragments).toEqual(FRAGMENTS); // every fragment retained, unflattened
    expect(await s.t.run(ctx => ctx.storage.get(videoId))).toBeNull(); // success deletes the recording as before
  });
  it("retains every fragment even when the combined text exceeds the 2200-character caption limit", async () => {
    const s = await setup(); enableModel();
    const long = [..."abc"].map(c => `${c}${"x".repeat(3999)}`);
    const itemId = await submitWith(s, context({ textFragments: long }));
    await s.attach(itemId as never, (await s.row(itemId))!.ownerId as never, 1);
    sdk.generateContent.mockResolvedValueOnce({ candidates: [{ finishReason: "STOP" }], text: JSON.stringify({ isDeal: false, drafts: [], evidence: [], transcript: "", warnings: [] }) });
    await s.settle();
    expect(JSON.parse(sdk.generateContent.mock.calls[0][0].contents[0].parts[2].text).nativeSuppliedSource.textFragments).toEqual(long);
    expect(JSON.parse(sdk.generateContent.mock.calls[0][0].contents[0].parts[1].text).caption).toBe("");
  });
  it("accepts caption evidence quoted from ONE supplied fragment, or from the editable caption", async () => {
    const s = await setup(); enableModel();
    const itemId = await submitWith(s, context());
    await s.attach(itemId as never, (await s.row(itemId))!.ownerId as never, 1, "Edited: $8 bowl");
    sdk.generateContent.mockResolvedValueOnce(modelAnswer("Mon to Fri")); // from fragment 2; "$8" is also in the caption
    await s.settle();
    expect(await s.row(itemId)).toMatchObject({ status: "ready" });
  });
  it("rejects evidence joined across two fragments, or a fragment and the caption: failed, no draft", async () => {
    const s = await setup(); enableModel();
    const itemId = await submitWith(s, context());
    const ownerId = (await s.row(itemId))!.ownerId as never;
    await s.attach(itemId as never, ownerId, 1, "Edited caption");
    sdk.generateContent.mockResolvedValueOnce(modelAnswer("Cafe Aroma lunch special $8 bowl")); // invented join of fragment 1 + 2
    await s.settle();
    expect(await s.row(itemId)).toMatchObject({ status: "failed", error: { code: "EXTRACTION_FAILED" } });
    expect((await s.row(itemId))!.draftJson).toBeUndefined();
    expect((await s.row(itemId))!.extractionJson).toBeUndefined();
    await s.alice.mutation(api.reels.retry, { itemId });
    sdk.generateContent.mockResolvedValueOnce(modelAnswer("lunch special Edited caption"));
    await s.settle();
    expect(await s.row(itemId)).toMatchObject({ status: "failed", error: { code: "EXTRACTION_FAILED" } });
  });
  it("complete context without a manual caption is not blocked", async () => {
    const s = await setup(); enableModel();
    const itemId = await submitWith(s, context());
    await s.attach(itemId as never, (await s.row(itemId))!.ownerId as never, 1);
    sdk.generateContent.mockResolvedValueOnce(modelAnswer("$8 bowl"));
    await s.settle();
    expect(await s.row(itemId)).toMatchObject({ status: "ready" });
  });
});

describe("truncated supplied source", () => {
  it("blocks automatic extraction with a named safe error and a manual option, before any model or configuration read, and keeps the recording", async () => {
    const s = await setup(); // model gate intentionally OFF: the named block must come first, not CONFIGURATION
    const itemId = await submitWith(s, context({ truncated: true }));
    const { videoId } = await s.attach(itemId as never, (await s.row(itemId))!.ownerId as never, 1);
    await s.settle();
    const item = (await s.row(itemId))!;
    expect(item).toMatchObject({ status: "failed", error: { code: NATIVE_CONTEXT_TRUNCATED_CODE } });
    expect((item.error as { message: string }).message).toMatch(/cut off/);
    expect((item.error as { message: string }).message).toMatch(/by hand/);
    expect(item.draftJson).toBeUndefined();
    expect(item.extractionJson).toBeUndefined();
    expect(sdk.generateContent).not.toHaveBeenCalled();
    expect(await s.t.run(async ctx => (await ctx.storage.get(videoId)) !== null)).toBe(true);
    expect((await s.alice.query(api.reels.get, { itemId })).nativeContext?.truncated).toBe(true); // visible to the owner
  });
  it("stays blocked on retry, even with the model enabled", async () => {
    const s = await setup(); enableModel();
    const itemId = await submitWith(s, context({ truncated: true }));
    await s.attach(itemId as never, (await s.row(itemId))!.ownerId as never, 1);
    await s.settle();
    await s.alice.mutation(api.reels.retry, { itemId });
    await s.settle();
    expect(await s.row(itemId)).toMatchObject({ status: "failed", error: { code: NATIVE_CONTEXT_TRUNCATED_CODE } });
    expect(sdk.generateContent).not.toHaveBeenCalled();
  });
  it("is not lifted by any caption, however long: one word or a full paste still blocks, and the model is never called", async () => {
    const s = await setup(); enableModel();
    const itemId = await submitWith(s, context({ truncated: true }));
    const ownerId = (await s.row(itemId))!.ownerId as never;
    await s.attach(itemId as never, ownerId, 1, "word");
    await s.settle();
    expect(await s.row(itemId)).toMatchObject({ status: "failed", generation: 2, error: { code: NATIVE_CONTEXT_TRUNCATED_CODE } });
    await s.attach(itemId as never, ownerId, 2, "Full caption: Cafe Aroma lunch special $8 bowl, Mon to Fri");
    await s.settle();
    expect(await s.row(itemId)).toMatchObject({ status: "failed", generation: 3, error: { code: NATIVE_CONTEXT_TRUNCATED_CODE } });
    expect(sdk.generateContent).not.toHaveBeenCalled();
  });
  it("leaves the manual flow open: a blocked item still accepts a manual private draft", async () => {
    const s = await setup();
    const itemId = await submitWith(s, context({ truncated: true }));
    await s.attach(itemId as never, (await s.row(itemId))!.ownerId as never, 1);
    await s.settle();
    const manual = { restaurant: "Cafe Aroma", address: null, dealText: "Lunch bowl", price: 8, currency: "CAD", validDays: [], validStart: null, validEnd: null, expiresOn: null, conditions: [] };
    await s.alice.mutation(api.reels.saveDraft, { itemId, draftJson: JSON.stringify([manual]), expectedGeneration: 2, expectedRevision: 0 });
    expect(await s.row(itemId)).toMatchObject({ draftEdited: true, status: "failed" });
  });
});
