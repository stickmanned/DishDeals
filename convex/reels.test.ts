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
test("transactionally deduplicates tracking, hostname and /p aliases per owner", async () => {
  const { alice, bob } = await sessions();
  const results = await Promise.all([alice.mutation(api.reels.submit, { text }), alice.mutation(api.reels.submit, { text: "https://instagram.com/p/AbCdEf123/" })]);
  expect(results[0].itemId).toBe(results[1].itemId);
  expect(results.map(r => r.duplicate).sort()).toEqual([false, true]);
  expect((await bob.mutation(api.reels.submit, { text })).itemId).not.toBe(results[0].itemId);
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
test("disabled paid usage saves a clear failure without external calls", async () => {
  const { t, alice } = await sessions(); const { itemId } = await alice.mutation(api.reels.submit, { text });
  vi.stubEnv("REEL_PROVIDER_USAGE_AUTHORIZED", "false");
  expect(await t.action(internal.reelActions.retrieve, { itemId, generation: 1 })).toBe(false);
  expect(await alice.query(api.reels.get, { itemId })).toMatchObject({ status: "failed", error: { code: "CONFIGURATION" } });
});
test("link-only submit starts no workflow and no resolver; a supplied recording starts the durable workflow, which fails closed while the media gate is off", async () => {
  const { t, alice } = await sessions();
  vi.stubEnv("REEL_PROVIDER_USAGE_AUTHORIZED", "false");
  const { itemId } = await alice.mutation(api.reels.submit, { text });
  for (let i = 0; i < 10; i++) { vi.advanceTimersByTime(200); await t.finishInProgressScheduledFunctions(); }
  expect(await alice.query(api.reels.get, { itemId })).toMatchObject({ status: "queued" });
  expect((await alice.query(api.reels.get, { itemId })).workflowId).toBeUndefined();
  const owner = (await alice.query(api.reels.get, { itemId })).ownerId;
  const videoId = await t.run(ctx => ctx.storage.store(new Blob(["synthetic supplied recording"], { type: "video/mp4" })));
  await t.mutation(internal.reels.attachSupplied, { itemId, ownerId: owner, expectedGeneration: 1, videoId, mediaMime: "video/mp4", mediaBytes: 28, duration: 12, caption: null, publishedAt: null });
  for (let i = 0; i < 30; i++) { vi.advanceTimersByTime(200); await t.finishInProgressScheduledFunctions(); }
  expect(await alice.query(api.reels.get, { itemId })).toMatchObject({ status: "failed", error: { code: "CONFIGURATION" }, sourceKind: "supplied" });
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
