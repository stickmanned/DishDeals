// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// In-memory convex-test of the REAL public extract.extractDeal action and its internal owner check, with the
// reviewed extractCore on a scripted fake network (vi.stubGlobal fetch). Users, uploads and images are
// SYNTHETIC. This is NOT a live Gemini call, a real screenshot/flyer, or any provider-quality evidence.
import { vi } from "vitest";
vi.hoisted(() => { (globalThis as Record<string, unknown>).Convex = {}; });
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { extractDeal } from "../../convex/extract";
import type { ActionCtx } from "../../convex/_generated/server";
import type { FunctionArgs } from "convex/server";
import type { ExtractOutcome } from "../../lib/extractCore";
import type { Id } from "../../convex/_generated/dataModel";

const modules = import.meta.glob("../../convex/**/*.ts");
const KEY = "SYNTHETIC-GEMINI-KEY-do-not-leak";
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const img = (head: number[], size = 256): Uint8Array<ArrayBuffer> => { const b = new Uint8Array(new ArrayBuffer(size)); b.set(head); return b; };

const deal = (over: Record<string, unknown> = {}) => ({
  restaurant: "Pho Hoa", address: null, dealText: "2-for-1 pho", statedPrice: null, cadEvidence: null, validDays: ["tue"], validStart: "17:00", validEnd: "21:00",
  expiresOn: null, startDate: null, conditions: ["dine-in only"], unsupportedConstraints: [],
  confidence: { restaurant: 0.93, priceCad: 0.4, hours: 0.81, expiresOn: 0.2 }, ...over,
});
const ok = (payload: unknown) => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 });
const good = { isDeal: true, deals: [deal()] };

const network = (steps: Response[]) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, init }); return steps[Math.min(calls.length - 1, steps.length - 1)].clone(); });
  vi.stubGlobal("fetch", fn);
  return { calls, fn };
};
const enable = (over: Record<string, string> = {}) => {
  for (const [k, v] of Object.entries({ IMAGE_PROVIDER_USAGE_AUTHORIZED: "true", GEMINI_API_KEY: KEY, GEMINI_IMAGE_MODEL: "gemini-3.8-flash", GEMINI_IMAGE_FALLBACK_MODEL: "gemini-3.5-flash-lite", ...over })) vi.stubEnv(k, v);
};
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("unexpected network call"); })); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function setup() {
  const t = convexTest(schema, modules);
  const [aId, bId] = await t.run(async ctx => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  const alice = t.withIdentity({ subject: `${aId}|session` });
  const bob = t.withIdentity({ subject: `${bId}|session` });
  const upload = (owner: Id<"users">, bytes: Uint8Array, o: { expiresAt?: number; published?: boolean; register?: boolean } = {}) =>
    t.run(async ctx => {
      const storageId = await ctx.storage.store(new Blob([bytes as BlobPart], { type: "image/png" }));
      if (o.register !== false) await ctx.db.insert("dealUploads", { ownerId: owner, storageId, expiresAt: o.expiresAt ?? Date.now() + 86_400_000, published: o.published ?? false });
      return storageId;
    });
  const snapshot = () => t.run(async ctx => ({ deals: await ctx.db.query("deals").collect(), uploads: await ctx.db.query("dealUploads").collect(), stored: (await ctx.db.system.query("_storage").collect()).length }));
  return { t, aId, bId, alice, bob, upload, snapshot };
}
const code = (e: unknown) => (e as { data?: { code?: string } }).data?.code;
const rejectsWith = async (p: Promise<unknown>, expected: string) => {
  let err: unknown;
  try { await p; } catch (e) { err = e; }
  expect(err, "expected the action to reject").toBeDefined();
  expect(code(err)).toBe(expected);
  expect(JSON.stringify(err, Object.getOwnPropertyNames(err as object))).not.toContain(KEY);
};

describe("access, arguments and the provider gate (no provider call)", () => {
  it("rejects signed-out callers", async () => {
    const s = await setup(); enable();
    const id = await s.upload(s.aId, img(PNG));
    await rejectsWith(s.t.action(api.extract.extractDeal, { imageIds: [id] }), "NOT_SIGNED_IN");
  });
  it("requires source content and at most 8 different images", async () => {
    const s = await setup(); enable();
    const ids = await Promise.all(Array.from({ length: 9 }, () => s.upload(s.aId, img(PNG))));
    await rejectsWith(s.alice.action(api.extract.extractDeal, { imageIds: [] }), "INVALID_INPUT");
    await rejectsWith(s.alice.action(api.extract.extractDeal, { imageIds: ids }), "INVALID_INPUT");
    await rejectsWith(s.alice.action(api.extract.extractDeal, { imageIds: [ids[0], ids[0]] }), "INVALID_INPUT");
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
  it.each([
    ["gate not true", { IMAGE_PROVIDER_USAGE_AUTHORIZED: "false" }], ["gate unset", { IMAGE_PROVIDER_USAGE_AUTHORIZED: "" }],
    ["no key", { GEMINI_API_KEY: "" }], ["no model", { GEMINI_IMAGE_MODEL: "" }],
  ])("fails closed with %s, before reading bytes or calling the provider", async (_n, over) => {
    const s = await setup(); enable(over);
    const id = await s.upload(s.aId, img(PNG));
    await rejectsWith(s.alice.action(api.extract.extractDeal, { imageIds: [id] }), "CONFIGURATION");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("the legacy reel gates do not enable image extraction", async () => {
    const s = await setup();
    for (const [k, v] of Object.entries({ REEL_PROVIDER_USAGE_AUTHORIZED: "true", REEL_MEDIA_USAGE_AUTHORIZED: "true", GEMINI_API_KEY: KEY, GEMINI_REEL_MODEL: "m" })) vi.stubEnv(k, v);
    const id = await s.upload(s.aId, img(PNG));
    await rejectsWith(s.alice.action(api.extract.extractDeal, { imageIds: [id] }), "CONFIGURATION");
  });
});

describe("supplied caption/text without images (synthetic source and network)", () => {
  it.each([
    { caption: "Tuesday special at Pho Hoa: 2-for-1 pho, dine-in only" },
    { text: "Tuesday special at Pho Hoa: 2-for-1 pho, dine-in only" },
    { caption: "Tuesday special at Pho Hoa", text: "2-for-1 pho, dine-in only" },
    { text: "Pho:C$10" },
    { text: "週二優惠" },
  ])("accepts actual source text %j with unchanged confidence and blocking partial-source review", async source => {
    const s = await setup(); enable(); const net = network([ok(good)]);
    const before = await s.snapshot();
    const out = await s.alice.action(api.extract.extractDeal, {
      imageIds: [], ...source, provenanceUrl: "https://www.instagram.com/p/ABC/?igsh=PRIVATE", publishedAt: "2026-09-29",
    });
    expect(net.calls).toHaveLength(1);
    const body = JSON.parse(net.calls[0].init.body as string);
    expect(body.contents[0].parts).toHaveLength(1);
    expect(JSON.parse(body.contents[0].parts[0].text)).toMatchObject({ imageCount: 0, ...source, publishedAt: "2026-09-29" });
    expect(net.calls[0].init.body).not.toContain("instagram");
    expect(net.calls[0].init.body).not.toContain("PRIVATE");
    expect(out.result.deals[0].confidence).toEqual(good.deals[0].confidence);
    expect(Object.keys(out.result.deals[0].confidence).sort()).toEqual(["expiresOn", "hours", "priceCad", "restaurant"]);
    expect(out.result.deals[0].conditions).toEqual(["dine-in only"]);
    expect(out.manualReview).toEqual([{ dealIndex: 0, code: "UNSUPPORTED_CONSTRAINT", blocking: true,
      detail: "Only supplied caption/text was examined; video and audio were not examined. Verify all fields and any restrictions missing from this partial source before publishing." }]);
    expect(out.requiresBlockingReview).toBe(true);
    expect(out.model).toBe("gemini-3.8-flash");
    expect(await s.snapshot()).toEqual(before);
  });
  it("makes no image registry query or storage read for text-only input", async () => {
    const s = await setup(); enable(); network([ok(good)]);
    const query = vi.fn(async () => { throw new Error("unexpected registry query"); });
    const get = vi.fn(async () => { throw new Error("unexpected storage read"); });
    // The real handler with convex-test authentication; spies fail if it touches image infrastructure.
    // Convex's runtime registration exposes _handler, but its public RegisteredAction type omits it.
    const registered = extractDeal as typeof extractDeal & {
      _handler: (ctx: ActionCtx, args: FunctionArgs<typeof api.extract.extractDeal>) => Promise<ExtractOutcome>;
    };
    await s.alice.action(async ctx => registered._handler({ ...ctx, runQuery: query, storage: { ...ctx.storage, get } }, {
      imageIds: [], text: "Tuesday special at Pho Hoa: 2-for-1 pho",
    }));
    expect(query).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });
  it.each([
    {}, { caption: " \t\n ", text: "  " }, { provenanceUrl: "https://www.instagram.com/p/ABC/?igsh=PRIVATE" },
    { caption: "https://www.instagram.com/p/ABC/?igsh=PRIVATE" },
    { text: "http://www.instagram.com/reel/ABC/" }, { text: "www.instagram.com/reel/ABC/" },
    { caption: "instagram.com/p/ABC/" }, { text: "HTTPS://WWW.INSTAGRAM.COM/p/ABC/" },
    { caption: "https://example.org/post", text: "https://www.instagram.com/p/ABC/" },
    { text: "(https://www.instagram.com/p/ABC/)" },
    { text: "https://example.org/a\nhttps://example.org/b" },
    { text: "//www.instagram.com/p/ABC/" }, { text: "“https://www.instagram.com/p/ABC/”" },
    { text: "instagram.com" }, { caption: "...!", text: "  " },
  ])("rejects absent or URL-only source %j before the provider", async source => {
    const s = await setup(); enable();
    await rejectsWith(s.alice.action(api.extract.extractDeal, { imageIds: [], ...source }), "INVALID_INPUT");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("URL provenance is allowed beside real source text and is never fetched", async () => {
    const s = await setup(); enable(); const net = network([ok(good)]);
    const caption = "2-for-1 pho on Tuesday https://www.instagram.com/p/ABC/";
    await s.alice.action(api.extract.extractDeal, { imageIds: [], caption });
    expect(net.calls).toHaveLength(1);
    expect(net.calls[0].url).toContain("generativelanguage.googleapis.com");
    expect(JSON.parse(JSON.parse(net.calls[0].init.body as string).contents[0].parts[0].text).caption).toBe(caption);
  });
  it("still authenticates before source validation, model configuration or extraction", async () => {
    const s = await setup(); enable({ IMAGE_PROVIDER_USAGE_AUTHORIZED: "false" });
    for (const caption of ["2-for-1 pho", "https://www.instagram.com/p/ABC/", ""]) {
      await rejectsWith(s.t.action(api.extract.extractDeal, { imageIds: [], caption }), "NOT_SIGNED_IN");
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([
    { IMAGE_PROVIDER_USAGE_AUTHORIZED: "false" }, { IMAGE_PROVIDER_USAGE_AUTHORIZED: "" },
    { GEMINI_API_KEY: "" }, { GEMINI_IMAGE_MODEL: "" },
  ])("requires the same image-analysis server gate/key/model for text %j", async over => {
    const s = await setup(); enable(over);
    await rejectsWith(s.alice.action(api.extract.extractDeal, { imageIds: [], text: "Tuesday 2-for-1 pho" }), "CONFIGURATION");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("text does not bypass the owner check when any image is supplied", async () => {
    const s = await setup(); enable(); const theirs = await s.upload(s.bId, img(PNG));
    await rejectsWith(s.alice.action(api.extract.extractDeal, { imageIds: [theirs], caption: "Tuesday 2-for-1 pho" }), "IMAGE_NOT_AVAILABLE");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("preserves existing sidecars and adds one blocking partial-source note for each deal", async () => {
    const s = await setup(); enable(); network([ok({ isDeal: true, deals: [
      deal({ startDate: "2099-01-01", unsupportedConstraints: ["members only"], statedPrice: 12, cadEvidence: null }),
      deal({ restaurant: "Other restaurant" }),
    ] })]);
    const out = await s.alice.action(api.extract.extractDeal, { imageIds: [], caption: "2-for-1 pho; members only from 2099-01-01; second offer" });
    expect(out.manualReview.slice(0, 3).map(n => [n.dealIndex, n.code, n.blocking])).toEqual([
      [0, "FUTURE_START", true], [0, "UNSUPPORTED_CONSTRAINT", true], [0, "CURRENCY_UNVERIFIED", false],
    ]);
    expect(out.manualReview[2].originalAmount).toBe(12);
    expect(out.manualReview.slice(3).map(n => [n.dealIndex, n.code, n.blocking])).toEqual([
      [0, "UNSUPPORTED_CONSTRAINT", true], [1, "UNSUPPORTED_CONSTRAINT", true],
    ]);
    expect(out.requiresBlockingReview).toBe(true);
    expect(out.result.deals.map(d => d.confidence)).toEqual([good.deals[0].confidence, good.deals[0].confidence]);
  });
  it("does not invent deals or review notes for a text-only non-deal", async () => {
    const s = await setup(); enable(); network([ok({ isDeal: false, deals: [] })]);
    expect(await s.alice.action(api.extract.extractDeal, { imageIds: [], text: "We enjoyed lunch at Pho Hoa" })).toEqual({
      result: { isDeal: false, deals: [] }, manualReview: [], requiresBlockingReview: false, model: "gemini-3.8-flash",
    });
  });
  it.each([
    [{ text: "x".repeat(20_001) }, "TEXT_TOO_LONG"],
    [{ text: "Tuesday 2-for-1 pho", publishedAt: "not-a-date" }, "INVALID_INPUT"],
  ] as const)("retains core input validation for %j", async (source, expected) => {
    const s = await setup(); enable();
    await rejectsWith(s.alice.action(api.extract.extractDeal, { imageIds: [], ...source }), expected);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it.each([
    [() => new Response(`bad key ${KEY}`, { status: 403 }), "PROVIDER_AUTH"],
    [() => ok({ isDeal: true, deals: [deal({ confidence: { restaurant: 2, priceCad: 0, hours: 0, expiresOn: 0 } })] }), "INVALID_MODEL_OUTPUT"],
  ] as const)("preserves sanitized text-only model failure %s", async (response, expected) => {
    const s = await setup(); enable(); network([response()]);
    const err = await s.alice.action(api.extract.extractDeal, { imageIds: [], caption: "private caption text" }).then(() => null, (e: unknown) => e) as { data: Record<string, unknown> };
    expect(err.data.code).toBe(expected);
    expect(Object.keys(err.data).sort()).toEqual(["code", "message", "retryable"]);
    expect(JSON.stringify(err.data)).not.toContain(KEY);
    expect(JSON.stringify(err.data)).not.toContain("private caption");
    expect((await s.snapshot()).deals).toHaveLength(0);
  });
});

describe("private owner validation comes first", () => {
  it.each(["unregistered", "someone else's", "expired", "duplicate rows", "empty file", "deleted file", "oversize"])("rejects %s without any provider call", async which => {
    const s = await setup(); enable();
    let id: Id<"_storage">;
    if (which === "unregistered") id = await s.upload(s.aId, img(PNG), { register: false });
    else if (which === "someone else's") id = await s.upload(s.bId, img(PNG));
    else if (which === "expired") id = await s.upload(s.aId, img(PNG), { expiresAt: Date.now() - 1 });
    else if (which === "empty file") id = await s.upload(s.aId, new Uint8Array());
    else if (which === "oversize") id = await s.upload(s.aId, img(PNG, 5 * 1024 * 1024 + 1));
    else {
      id = await s.upload(s.aId, img(PNG));
      if (which === "duplicate rows") await s.t.run(ctx => ctx.db.insert("dealUploads", { ownerId: s.aId, storageId: id, expiresAt: Date.now() + 1e6, published: false }));
      else await s.t.run(ctx => ctx.storage.delete(id));
    }
    await rejectsWith(s.alice.action(api.extract.extractDeal, { imageIds: [id] }), "IMAGE_NOT_AVAILABLE");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("one unavailable id fails the whole request", async () => {
    const s = await setup(); enable();
    const mine = await s.upload(s.aId, img(PNG)), theirs = await s.upload(s.bId, img(PNG));
    await rejectsWith(s.alice.action(api.extract.extractDeal, { imageIds: [mine, theirs] }), "IMAGE_NOT_AVAILABLE");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("accepts an expired upload that was already published (reuse by its owner)", async () => {
    const s = await setup(); enable(); const net = network([ok(good)]);
    const id = await s.upload(s.aId, img(PNG), { expiresAt: Date.now() - 1, published: true });
    await s.alice.action(api.extract.extractDeal, { imageIds: [id] });
    expect(net.calls).toHaveLength(1);
  });
  it("rejects bytes that are not a supported image even if the stored label says PNG", async () => {
    const s = await setup(); enable();
    const html = await s.upload(s.aId, new TextEncoder().encode("<html><body>not an image</body></html>"));
    const heic = await s.upload(s.aId, img([0, 0, 0, 24, ...Buffer.from("ftypheic"), 0, 0, 0, 0, ...Buffer.from("heicmif1")]));
    await rejectsWith(s.alice.action(api.extract.extractDeal, { imageIds: [html] }), "INVALID_IMAGE");
    await rejectsWith(s.alice.action(api.extract.extractDeal, { imageIds: [heic] }), "INVALID_IMAGE");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("extraction through the reviewed core (scripted network)", () => {
  it("sends every image with its real format, plus the supplied context, to the configured model and returns the envelope", async () => {
    const s = await setup(); enable(); const net = network([ok(good)]);
    const a = await s.upload(s.aId, img(PNG, 300)), b = await s.upload(s.aId, img(JPEG, 400));
    const before = await s.snapshot();
    const out = await s.alice.action(api.extract.extractDeal, {
      imageIds: [a, b], caption: "Tuesday special at Pho Hoa", text: "extra pasted text", publishedAt: "2026-09-29", provenanceUrl: "https://www.instagram.com/p/ABC/?igsh=SECRET",
    });
    expect(net.calls).toHaveLength(1);
    expect(net.calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    expect((net.calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    const body = JSON.parse(net.calls[0].init.body as string);
    const parts = body.contents[0].parts;
    expect(parts.map((p: { inlineData?: { mimeType: string } }) => p.inlineData?.mimeType ?? "text")).toEqual(["text", "image/png", "image/jpeg"]);
    expect(JSON.parse(parts[0].text)).toMatchObject({ imageCount: 2, caption: "Tuesday special at Pho Hoa", text: "extra pasted text", publishedAt: "2026-09-29" });
    expect(net.calls[0].init.body as string).not.toContain("instagram");
    expect(net.calls[0].init.body as string).not.toContain("SECRET");
    expect(out).toMatchObject({ model: "gemini-3.8-flash", requiresBlockingReview: false, manualReview: [] });
    expect(out.result).toEqual({
      isDeal: true,
      deals: [{ restaurant: "Pho Hoa", address: null, dealText: "2-for-1 pho", priceCad: null, validDays: ["tue"], validStart: "17:00", validEnd: "21:00", expiresOn: null, conditions: ["dine-in only"], confidence: { restaurant: 0.93, priceCad: 0.4, hours: 0.81, expiresOn: 0.2 } }],
    });
    expect(await s.snapshot()).toEqual(before); // no deal written, no upload claimed or changed
  });
  it("passes the blocking sidecar through intact", async () => {
    const s = await setup(); enable(); network([ok({ isDeal: true, deals: [deal({ startDate: "2099-01-01", unsupportedConstraints: ["members only"], statedPrice: 12, cadEvidence: "C$12 not in the supplied text" })] })]);
    const id = await s.upload(s.aId, img(PNG));
    const out = await s.alice.action(api.extract.extractDeal, { imageIds: [id] });
    expect(out.requiresBlockingReview).toBe(true);
    expect(out.manualReview.map(n => [n.dealIndex, n.code, n.blocking])).toEqual([[0, "FUTURE_START", true], [0, "UNSUPPORTED_CONSTRAINT", true], [0, "CURRENCY_UNVERIFIED", false]]);
    expect(out.manualReview[2].originalAmount).toBe(12);
    expect(out.result.deals[0].priceCad).toBeNull(); // unverified CAD never becomes a canonical price
    expect(out.result.deals[0].conditions).toEqual(["dine-in only"]); // sidecar text is not folded into conditions
  });
  it("returns an isDeal=false result unchanged (no invented offer or scores)", async () => {
    const s = await setup(); enable(); network([ok({ isDeal: false, deals: [] })]);
    const id = await s.upload(s.aId, img(PNG));
    expect((await s.alice.action(api.extract.extractDeal, { imageIds: [id] })).result).toEqual({ isDeal: false, deals: [] });
  });
  it("falls back to the configured fallback model after two primary failures", async () => {
    const s = await setup(); enable(); const net = network([new Response("", { status: 503 }), new Response("", { status: 429 }), ok(good)]);
    const id = await s.upload(s.aId, img(PNG));
    const out = await s.alice.action(api.extract.extractDeal, { imageIds: [id] });
    expect(net.calls.map(c => c.url.match(/models\/([^:]+):/)![1])).toEqual(["gemini-3.8-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite"]);
    expect(out.model).toBe("gemini-3.5-flash-lite");
  });
  it("with no fallback configured only the explicit primary model is ever used", async () => {
    const s = await setup(); enable({ GEMINI_IMAGE_FALLBACK_MODEL: "" }); const net = network([new Response("", { status: 503 })]);
    const id = await s.upload(s.aId, img(PNG));
    await rejectsWith(s.alice.action(api.extract.extractDeal, { imageIds: [id] }), "PROVIDER_BUSY");
    expect(new Set(net.calls.map(c => c.url.match(/models\/([^:]+):/)![1]))).toEqual(new Set(["gemini-3.8-flash"]));
  });
  it("uses exactly the configured model names, never an implicit default", async () => {
    const s = await setup(); enable({ GEMINI_IMAGE_MODEL: "my-configured-model", GEMINI_IMAGE_FALLBACK_MODEL: "my-fallback" }); const net = network([ok(good)]);
    const id = await s.upload(s.aId, img(PNG));
    expect((await s.alice.action(api.extract.extractDeal, { imageIds: [id] })).model).toBe("my-configured-model");
    expect(net.calls[0].url).toContain("/models/my-configured-model:");
  });
  it("rejects an unsafe configured model name before any call", async () => {
    const s = await setup(); enable({ GEMINI_IMAGE_MODEL: "x/../y" });
    const id = await s.upload(s.aId, img(PNG));
    await rejectsWith(s.alice.action(api.extract.extractDeal, { imageIds: [id] }), "CONFIGURATION");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("failures are sanitized and typed", () => {
  const run = async (steps: Response[], expected: string) => {
    const s = await setup(); enable(); network(steps);
    const id = await s.upload(s.aId, img(PNG));
    await rejectsWith(s.alice.action(api.extract.extractDeal, { imageIds: [id] }), expected);
    expect((await s.snapshot()).deals).toHaveLength(0);
  };
  it("provider auth failure", () => run([new Response(`bad key ${KEY}`, { status: 403 })], "PROVIDER_AUTH"));
  it("provider rejects the request", () => run([new Response("", { status: 400 }), new Response("", { status: 400 })], "PROVIDER_REQUEST"));
  it("safety block", () => run([new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 })], "PROVIDER_BLOCKED"));
  it("unfinished model output", () => run([new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{}" }] } }] }), { status: 200 })], "INVALID_MODEL_OUTPUT"));
  it("malformed JSON from the model", () => run([new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not json" }] } }] }), { status: 200 })], "INVALID_MODEL_OUTPUT"));
  it("invalid fields (scores out of range, unknown key) are not returned", () => run([ok({ isDeal: true, deals: [deal({ confidence: { restaurant: 2, priceCad: 0, hours: 0, expiresOn: 0 } })] })], "INVALID_MODEL_OUTPUT"));
  it("an unknown extra constraint field is rejected rather than stripped", () => run([ok({ isDeal: true, deals: [deal({ startsAfter: "2099-01-01" })] })], "INVALID_MODEL_OUTPUT"));
  it("a hung provider call ends in a typed timeout", async () => {
    const s = await setup(); enable();
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => (init.signal as AbortSignal).addEventListener("abort", () => void Promise.resolve().then(() => rej(new Error(`aborted ${KEY}`)))))));
    vi.useFakeTimers();
    const id = await s.upload(s.aId, img(PNG));
    const pending = s.alice.action(api.extract.extractDeal, { imageIds: [id] }).then(() => null, (e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    const err = await pending;
    vi.useRealTimers();
    expect(code(err)).toBe("PROVIDER_TIMEOUT");
    expect(JSON.stringify(err, Object.getOwnPropertyNames(err as object))).not.toContain(KEY);
  });
  it("errors carry only a code, a fixed message and a retry flag", async () => {
    const s = await setup(); enable(); network([new Response(`secret ${KEY}`, { status: 403 })]);
    const id = await s.upload(s.aId, img(PNG));
    const err = await s.alice.action(api.extract.extractDeal, { imageIds: [id], caption: "private caption text" }).then(() => null, (e: unknown) => e) as { data: Record<string, unknown> };
    expect(Object.keys(err.data).sort()).toEqual(["code", "message", "retryable"]);
    expect(JSON.stringify(err.data)).not.toContain("private caption");
  });
});

describe("the public module surface", () => {
  it("exposes extractDeal as the only public extraction function", async () => {
    const mod = await import("../../convex/extract");
    expect(Object.keys(mod).sort()).toEqual(["extractDeal", "outcome"]);
  });
});
