/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
function setup() { const t = convexTest(schema, modules); workflow.register(t); return t; }
async function sessions() {
  const t = setup();
  const [a, b] = await t.run(async ctx => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  return { t, alice: t.withIdentity({ subject: `${a}|session` }), bob: t.withIdentity({ subject: `${b}|session` }) };
}
const text = "https://www.instagram.com/reel/AbCdEf123/?igsh=tracking";
const sdk = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = sdk; } }));
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
test("requires real auth and refuses every other owner's read/write", async () => {
  const { t, alice, bob } = await sessions();
  await expect(t.mutation(api.reels.submit, { text })).rejects.toThrow("Not signed in");
  const { itemId } = await alice.mutation(api.reels.submit, { text });
  await expect(bob.query(api.reels.get, { itemId })).rejects.toThrow("Item not found");
  for (const mutation of [api.reels.retry, api.reels.remove]) await expect(bob.mutation(mutation, { itemId })).rejects.toThrow("Item not found");
  await expect(bob.mutation(api.reels.setRetention, { itemId, days: 1 })).rejects.toThrow("Item not found");
  await expect(bob.mutation(api.reels.saveDraft, { itemId, draftJson: "[]", expectedGeneration: 1, expectedRevision: 0 })).rejects.toThrow("Item not found");
  expect(await bob.query(api.reels.list, {})).toEqual([]);
});
test("transactionally deduplicates tracking per owner and keeps /p vs /reel independent", async () => {
  const { alice, bob } = await sessions();
  // Same post tracking deduplicates to same item
  const post1 = "https://instagram.com/p/AbCdEf123/?igsh=track1";
  const post2 = "https://m.instagram.com/p/AbCdEf123/?igsh=track2";
  const postResults = await Promise.all([alice.mutation(api.reels.submit, { text: post1 }), alice.mutation(api.reels.submit, { text: post2 })]);
  expect(postResults[0].itemId).toBe(postResults[1].itemId);
  expect(postResults.map(r => r.duplicate).sort()).toEqual([false, true]);

  // Same reel tracking and alias deduplicates to same item
  const reel1 = text;
  const reel2 = "https://instagram.com/reels/AbCdEf123/";
  const reelResults = await Promise.all([alice.mutation(api.reels.submit, { text: reel1 }), alice.mutation(api.reels.submit, { text: reel2 })]);
  expect(reelResults[0].itemId).toBe(reelResults[1].itemId);
  expect(reelResults.map(r => r.duplicate).sort()).toEqual([false, true]);

  // /p vs /reel for the same shortcode are independent IDs
  expect(postResults[0].itemId).not.toBe(reelResults[0].itemId);

  // Bob's submit is independent from Alice
  expect((await bob.mutation(api.reels.submit, { text })).itemId).not.toBe(reelResults[0].itemId);
});
test("rejects active retries, permits failed retries, fences stale completions", async () => {
  const { t, alice } = await sessions(); const { itemId } = await alice.mutation(api.reels.submit, { text });
  await expect(alice.mutation(api.reels.retry, { itemId })).rejects.toThrow("Only failed");
  await t.mutation(internal.reels.fail, { itemId, generation: 1, code: "UNAVAILABLE", message: "Private Reel" });
  await alice.mutation(api.reels.retry, { itemId });
  await t.mutation(internal.reels.fail, { itemId, generation: 1, code: "OLD", message: "stale" });
  expect(await alice.query(api.reels.get, { itemId })).toMatchObject({ generation: 2, attempts: 2, status: "queued" });
});
test("deletion removes private media and prevents late workers from resurrecting it", async () => {
  const { t, alice } = await sessions(); const { itemId } = await alice.mutation(api.reels.submit, { text });
  const videoId = await t.run(ctx => ctx.storage.store(new Blob(["fixture video"], { type: "video/mp4" })));
  await t.mutation(internal.reels.attachMedia, { itemId, generation: 1, videoId, caption: "caption", duration: 12, publishedAt: null });
  await alice.mutation(api.reels.remove, { itemId });
  expect(await t.run(ctx => ctx.storage.get(videoId))).toBeNull();
  const lateVideo = await t.run(ctx => ctx.storage.store(new Blob(["late video"])));
  expect(await t.mutation(internal.reels.attachMedia, { itemId, generation: 1, videoId: lateVideo, caption: "late", duration: 12, publishedAt: null })).toBe(false);
  expect(await t.run(ctx => ctx.storage.get(lateVideo))).toBeNull();
  expect(await alice.query(api.reels.list, {})).toEqual([]);
});
test("retention extension fences old expiry; current expiry deletes", async () => {
  const { t, alice } = await sessions(); const { itemId } = await alice.mutation(api.reels.submit, { text, retentionDays: 1 });
  const first = await alice.query(api.reels.get, { itemId });
  await alice.mutation(api.reels.setRetention, { itemId, days: 30 });
  vi.setSystemTime(first.expiresAt + 1);
  await t.mutation(internal.reels.expire, { itemId, expiresAt: first.expiresAt });
  const current = await alice.query(api.reels.get, { itemId }); expect(current).toBeTruthy();
  vi.setSystemTime(current.expiresAt + 1);
  await t.mutation(internal.reels.expire, { itemId, expiresAt: current.expiresAt });
  expect(await alice.query(api.reels.list, {})).toEqual([]);
});
// William authorized retrieving a shared Reel from its link (the only way to read its contents). The provider key and
// gate are server-side; the video host is allow-listed in lib/reels/provider.ts. All network and model calls below are fakes.
const reelEnv = { REEL_PROVIDER_USAGE_AUTHORIZED: "true", SCRAPECREATORS_API_KEY: "test-provider-key", GEMINI_API_KEY: "test", GEMINI_REEL_MODEL: "test-model" };
const mp4 = () => new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
const providerJson = (over: Record<string, unknown> = {}) => ({ success: true, data: { xdt_shortcode_media: { shortcode: "AbCdEf123", video_url: "https://scontent.cdninstagram.com/v/clip.mp4", video_duration: 12, taken_at_timestamp: 1790000000, edge_media_to_caption: { edges: [{ node: { text: "Lunch special" } }] }, ...over } } });
function fakeNetwork(provider: Response | (() => Response) = () => new Response(JSON.stringify(providerJson()), { status: 200 })) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input); calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    if (url.startsWith("https://api.scrapecreators.com/")) return typeof provider === "function" ? provider() : provider.clone();
    return new Response(mp4(), { status: 200, headers: { "content-type": "video/mp4" } });
  });
  return { calls, spy };
}
const deal = { restaurant: null, address: null, dealText: "Lunch special", price: 8, currency: null, validDays: null, validStart: null, validEnd: null, expiresOn: null, conditions: null };
const modelAnswer = () => ({ candidates: [{ finishReason: "STOP" }], text: JSON.stringify({ isDeal: true, drafts: [deal], evidence: [
  { draftIndex: 0, field: "dealText", channel: "audio", quote: "Lunch special", timestampSeconds: 3 },
  { draftIndex: 0, field: "price", channel: "visual", quote: "$8", timestampSeconds: 4 },
], transcript: "Lunch special", warnings: [] }) });
async function settle(t: ReturnType<typeof setup>) { for (let i = 0; i < 40; i++) { vi.advanceTimersByTime(200); await t.finishInProgressScheduledFunctions(); } }
test("a shared Reel link is retrieved and turned into a private draft automatically", async () => {
  const { t, alice } = await sessions();
  for (const [key, value] of Object.entries(reelEnv)) vi.stubEnv(key, value);
  const net = fakeNetwork(); sdk.generateContent.mockResolvedValueOnce(modelAnswer());
  const { itemId } = await alice.mutation(api.reels.submit, { text });
  await settle(t);
  const item = await alice.query(api.reels.get, { itemId });
  expect(item).toMatchObject({ status: "ready", caption: "Lunch special", duration: 12 });
  expect(item.workflowId).toBeDefined();
  expect(JSON.parse(item.draftJson!)).toHaveLength(1);
  expect(item.videoId).toBeUndefined(); // the downloaded media is deleted once the draft exists
  expect(net.calls[0].url).toContain("https://api.scrapecreators.com/v1/instagram/post?url=" + encodeURIComponent("https://www.instagram.com/reel/AbCdEf123/"));
  expect(net.calls[0].headers).toMatchObject({ "x-api-key": "test-provider-key" });
  expect(net.calls[1].url).toBe("https://scontent.cdninstagram.com/v/clip.mp4");
  expect(sdk.generateContent).toHaveBeenCalledTimes(1);
  expect(await t.run(ctx => ctx.db.query("deals").collect())).toEqual([]); // a draft only: nothing is published without review
});
test("with the provider gate off a shared link fails closed with no network and says how to continue", async () => {
  const { t, alice } = await sessions();
  for (const [key, value] of Object.entries({ ...reelEnv, REEL_PROVIDER_USAGE_AUTHORIZED: "false" })) vi.stubEnv(key, value);
  const net = fakeNetwork();
  const { itemId } = await alice.mutation(api.reels.submit, { text });
  await settle(t);
  const item = await alice.query(api.reels.get, { itemId });
  expect(item).toMatchObject({ status: "failed", error: { code: "CONFIGURATION" } });
  expect(item.error!.message).toMatch(/recording|by hand/i);
  expect(net.calls).toEqual([]);
  expect(sdk.generateContent).not.toHaveBeenCalled();
});
test("a private or removed Reel fails with the provider's reason and can be retried", async () => {
  const { t, alice } = await sessions();
  for (const [key, value] of Object.entries(reelEnv)) vi.stubEnv(key, value);
  fakeNetwork(() => new Response("{}", { status: 403 }));
  const { itemId } = await alice.mutation(api.reels.submit, { text });
  await settle(t);
  const item = await alice.query(api.reels.get, { itemId });
  expect(item).toMatchObject({ status: "failed", error: { code: "UNAVAILABLE" } });
  expect(item.error!.message).toMatch(/private|removed|unavailable/i);
  vi.restoreAllMocks(); fakeNetwork(); sdk.generateContent.mockResolvedValueOnce(modelAnswer());
  await alice.mutation(api.reels.retry, { itemId });
  await settle(t);
  expect(await alice.query(api.reels.get, { itemId })).toMatchObject({ status: "ready", generation: 2 });
});
test("a link saved while retrieval was off starts processing when it is shared again", async () => {
  const { t, alice } = await sessions();
  for (const [key, value] of Object.entries(reelEnv)) vi.stubEnv(key, value);
  const owner = (await alice.mutation(api.reels.submit, { text: "https://www.instagram.com/reel/Stuck12345/" }));
  await settle(t); // processed under the first configuration; now simulate a row that was stranded at "queued" with no workflow
  await t.run(async ctx => { await ctx.db.patch(owner.itemId, { status: "queued", workflowId: undefined, error: undefined, draftJson: undefined }); });
  fakeNetwork(() => new Response(JSON.stringify(providerJson({ shortcode: "Stuck12345" })), { status: 200 })); sdk.generateContent.mockResolvedValueOnce(modelAnswer());
  const again = await alice.mutation(api.reels.submit, { text: "https://www.instagram.com/reel/Stuck12345/?igsh=x" });
  expect(again).toEqual({ itemId: owner.itemId, duplicate: true });
  await settle(t);
  expect(await alice.query(api.reels.get, { itemId: owner.itemId })).toMatchObject({ status: "ready" });
});
test("multimodal action sends video plus caption and validates audio/visual evidence before saving", async () => {
  const { t, alice } = await sessions(); const { itemId } = await alice.mutation(api.reels.submit, { text });
  for (const [key, value] of Object.entries({ REEL_PROVIDER_USAGE_AUTHORIZED: "true", SCRAPECREATORS_API_KEY: "test", GEMINI_API_KEY: "test", GEMINI_REEL_MODEL: "test-model" })) vi.stubEnv(key, value);
  const videoId = await t.run(ctx => ctx.storage.store(new Blob(["synthetic media fixture"], { type: "video/mp4" })));
  await t.mutation(internal.reels.attachMedia, { itemId, generation: 1, videoId, caption: "Lunch special", duration: 12, publishedAt: null });
  const draft = { restaurant: null, address: null, dealText: "Lunch special", price: 8, currency: null, validDays: null, validStart: null, validEnd: null, expiresOn: null, conditions: null };
  sdk.generateContent.mockResolvedValueOnce({ candidates: [{ finishReason: "STOP" }], text: JSON.stringify({ isDeal: true, drafts: [draft], evidence: [
    { draftIndex: 0, field: "dealText", channel: "audio", quote: "Lunch special", timestampSeconds: 3 },
    { draftIndex: 0, field: "price", channel: "visual", quote: "$8", timestampSeconds: 4 },
  ], transcript: "Lunch special", warnings: [] }) });
  await t.action(internal.reelActions.extract, { itemId, generation: 1 });
  expect(sdk.generateContent.mock.calls.at(-1)?.[0].contents[0].parts).toEqual([
    { inlineData: { mimeType: "video/mp4", data: expect.any(String) } }, { text: expect.stringContaining("Lunch special") },
  ]);
  expect(await alice.query(api.reels.get, { itemId })).toMatchObject({ status: "ready" });
  expect(await t.run(ctx => ctx.storage.get(videoId))).toBeNull();
});
test("a failed video extraction logs a safe diagnostic (type, status, short reason) and never the key or the content", async () => {
  const { t, alice } = await sessions(); const { itemId } = await alice.mutation(api.reels.submit, { text });
  for (const [key, value] of Object.entries({ ...reelEnv, GEMINI_API_KEY: "secret-gemini-key" })) vi.stubEnv(key, value);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const videoId = await t.run(ctx => ctx.storage.store(new Blob(["synthetic media fixture"], { type: "video/mp4" })));
  await t.mutation(internal.reels.attachMedia, { itemId, generation: 1, videoId, caption: "Lunch special", duration: 12, publishedAt: null });
  sdk.generateContent.mockRejectedValueOnce(Object.assign(new Error("got status: 429 RESOURCE_EXHAUSTED secret-gemini-key"), { status: 429 }));
  await t.action(internal.reelActions.extract, { itemId, generation: 1 });
  expect(await alice.query(api.reels.get, { itemId })).toMatchObject({ status: "failed", error: { code: "EXTRACTION_FAILED" } });
  const logged = warn.mock.calls.map(c => String(c[0])).find(line => line.includes("reel_extract_failed"));
  expect(logged).toBeDefined();
  expect(JSON.parse(logged!)).toMatchObject({ event: "reel_extract_failed", kind: "model_call", status: 429 });
  expect(logged).not.toContain("secret-gemini-key");
  // An unfinished answer and an answer that fails validation are told apart.
  for (const [answer, kind] of [[{ candidates: [{ finishReason: "MAX_TOKENS" }], text: "{" }, "unfinished"], [{ candidates: [{ finishReason: "STOP" }], text: "not json" }, "bad_json"], [{ candidates: [{ finishReason: "STOP" }], text: JSON.stringify({ isDeal: true, drafts: [], evidence: [], transcript: "", warnings: [] }) }, "validation"]] as const) {
    warn.mockClear(); await t.mutation(internal.reels.attachMedia, { itemId, generation: 1, videoId: await t.run(ctx => ctx.storage.store(new Blob(["x"], { type: "video/mp4" }))), caption: "Lunch special", duration: 12, publishedAt: null });
    sdk.generateContent.mockResolvedValueOnce(answer);
    await t.action(internal.reelActions.extract, { itemId, generation: 1 });
    expect(JSON.parse(warn.mock.calls.map(c => String(c[0])).find(line => line.includes("reel_extract_failed"))!)).toMatchObject({ kind });
  }
});
test("valid private editable drafts preserve immutable extraction and canonical backend", async () => {
  const { t, alice } = await sessions(); const { itemId } = await alice.mutation(api.reels.submit, { text });
  const draft = { restaurant: "Cafe", address: null, dealText: "Meal", price: null, currency: null, validDays: null, validStart: null, validEnd: null, expiresOn: null, conditions: null };
  const extractionJson = JSON.stringify({ isDeal: true, drafts: [draft], evidence: [], transcript: "", warnings: [] });
  await t.mutation(internal.reels.finish, { itemId, generation: 1, extractionJson });
  await expect(alice.mutation(api.reels.saveDraft, { itemId, draftJson: JSON.stringify([{ ...draft, price: -1 }]), expectedGeneration: 1, expectedRevision: 1 })).rejects.toThrow();
  await alice.mutation(api.reels.saveDraft, { itemId, draftJson: JSON.stringify([{ ...draft, restaurant: "Corrected" }]), expectedGeneration: 1, expectedRevision: 1 });
  expect((await alice.query(api.reels.get, { itemId })).extractionJson).toBe(extractionJson);
  expect(await t.query(api.test.ping, {})).toEqual({ message: "Hello from Convex" });
  expect(await t.run(ctx => ctx.db.query("deals").collect())).toEqual([]);
});

// Synthetic regression matching the live provider's single-photo shape. No real provider calls.
test("a shared photo post reaches Gemini as an image and saves a private editable draft", async () => {
  sdk.generateContent.mockClear();
  const { t, alice } = await sessions();
  for (const [key, value] of Object.entries({ ...reelEnv, IMAGE_PROVIDER_USAGE_AUTHORIZED: "true", GEMINI_IMAGE_MODEL: "image-model" })) vi.stubEnv(key, value);
  const net = vi.spyOn(globalThis, "fetch").mockImplementation(async input => String(input).startsWith("https://api.scrapecreators.com/")
    ? Response.json(providerJson({ __typename: "XDTGraphImage", is_video: false, video_url: null, video_duration: null, display_url: "https://scontent.cdninstagram.com/photo.jpg" }))
    : new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { headers: { "content-type": "image/jpeg" } }));
  const answer = { isDeal: true, drafts: [deal], evidence: [
    { draftIndex: 0, field: "dealText", channel: "caption", quote: "Lunch special", timestampSeconds: null },
    { draftIndex: 0, field: "price", channel: "visual", quote: "$8", timestampSeconds: 0 },
  ], transcript: "", warnings: [], constraints: [] };
  sdk.generateContent.mockResolvedValueOnce({ candidates: [{ finishReason: "STOP" }], text: JSON.stringify(answer) });
  const { itemId } = await alice.mutation(api.reels.submit, { text: "https://instagram.com/p/AbCdEf123/" });
  await settle(t);
  const item = await alice.query(api.reels.get, { itemId });
  expect(item).toMatchObject({ status: "ready", mediaMime: "image/jpeg", duration: 0, caption: "Lunch special" });
  expect(JSON.parse(item.draftJson!)).toEqual([deal]);
  expect(item.videoId).toBeUndefined();
  expect(net).toHaveBeenCalledTimes(2);
  expect(sdk.generateContent).toHaveBeenCalledTimes(1);
  const request = sdk.generateContent.mock.calls[0][0];
  expect(request.model).toBe("image-model");
  expect(request.contents[0].parts[0].inlineData.mimeType).toBe("image/jpeg");
  expect(request.config.systemInstruction).toContain("one still photo");
  expect(await t.run(ctx => ctx.db.query("deals").collect())).toEqual([]);
});

test("photo extraction respects its image gate and rejects invented audio", async () => {
  sdk.generateContent.mockClear();
  const { t, alice } = await sessions();
  for (const [key, value] of Object.entries({ ...reelEnv, GEMINI_IMAGE_MODEL: "image-model" })) vi.stubEnv(key, value);
  const { itemId } = await alice.mutation(api.reels.submit, { text: "https://instagram.com/p/AbCdEf123/" });
  const attach = async () => t.mutation(internal.reels.attachMedia, { itemId, generation: 1,
    videoId: await t.run(ctx => ctx.storage.store(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }))),
    mediaMime: "image/jpeg", caption: "Lunch special", duration: 0, publishedAt: null });
  await attach();
  await t.action(internal.reelActions.extract, { itemId, generation: 1 });
  expect(await alice.query(api.reels.get, { itemId })).toMatchObject({ status: "failed", error: { code: "CONFIGURATION" } });
  expect(sdk.generateContent).not.toHaveBeenCalled();
  vi.stubEnv("IMAGE_PROVIDER_USAGE_AUTHORIZED", "true");
  await attach();
  const answer = JSON.parse(modelAnswer().text);
  answer.evidence.forEach((e: { timestampSeconds: number }) => { e.timestampSeconds = 0; });
  sdk.generateContent.mockResolvedValueOnce({ candidates: [{ finishReason: "STOP" }], text: JSON.stringify(answer) });
  await t.action(internal.reelActions.extract, { itemId, generation: 1 });
  const item = await alice.query(api.reels.get, { itemId });
  expect(item).toMatchObject({ status: "failed", error: { code: "EXTRACTION_FAILED" } });
  expect(item.draftJson).toBeUndefined();
});
