// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// In-memory convex-test of the REAL reels.saveDraft / retry / finish / fail
// wrappers. Users, items, extractions and videos are SYNTHETIC. No provider,
// native bridge, live auth or phone is involved.
import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const modules = import.meta.glob(["../../convex/**/*.ts", "!../../convex/**/*.test.ts"]);
const MAX = Number.MAX_SAFE_INTEGER;
const link = "https://www.instagram.com/reel/AbCdEf123/";
const T0 = new Date("2026-10-04T12:00:00Z").getTime();

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => vi.useRealTimers());

const draft = (over: Record<string, unknown> = {}) => ({
  restaurant: "Cafe", address: null, dealText: "Meal", price: null, currency: null,
  validDays: null, validStart: null, validEnd: null, expiresOn: null, conditions: null, ...over,
});
const extraction = (drafts: object[], isDeal = drafts.length > 0) =>
  JSON.stringify({ isDeal, drafts, evidence: [], transcript: "", warnings: [] });
const save = (c: ReturnType<typeof convexTest>, itemId: Id<"reelItems">, drafts: object[], g: number, r: number) =>
  c.mutation(api.reels.saveDraft, { itemId, draftJson: JSON.stringify(drafts), expectedGeneration: g, expectedRevision: r });

async function setup() {
  const t = convexTest(schema, modules);
  workflow.register(t);
  const [a, b] = await t.run(async ctx => [await ctx.db.insert("users", {}), await ctx.db.insert("users", {})]);
  const alice = t.withIdentity({ subject: `${a}|session` });
  const bob = t.withIdentity({ subject: `${b}|session` });
  const { itemId } = await alice.mutation(api.reels.submit, { text: link });
  const item = () => t.run(ctx => ctx.db.get("reelItems", itemId));
  const ready = async (drafts: object[] = [draft()]) => {
    await t.mutation(internal.reels.finish, { itemId, generation: 1, extractionJson: extraction(drafts) });
  };
  return { t, alice, bob, itemId, item, ready };
}

describe("auth and ownership", () => {
  it("rejects signed-out and other users' saves without any change", async () => {
    const s = await setup(); await s.ready();
    const before = await s.item();
    await expect(save(s.t as never, s.itemId, [draft()], 1, 1)).rejects.toThrow("Not signed in");
    await expect(save(s.bob as never, s.itemId, [draft()], 1, 1)).rejects.toThrow("Item not found");
    expect(await s.item()).toEqual(before);
  });
  it("derives the owner server-side: a client-supplied user argument is refused", async () => {
    const s = await setup(); await s.ready();
    await expect(s.alice.mutation(api.reels.saveDraft, { itemId: s.itemId, draftJson: "[]", expectedGeneration: 1, expectedRevision: 1, ownerId: "x" } as never)).rejects.toThrow();
  });
});

describe("legacy defaults and the first finish", () => {
  it("a legacy item (no revision fields) reads as revision 0 and saves to 1, edited", async () => {
    const s = await setup(); await s.ready();
    await s.t.run(ctx => ctx.db.patch(s.itemId, { draftRevision: undefined, draftEdited: undefined }));
    await save(s.alice as never, s.itemId, [draft({ restaurant: "Mine" })], 1, 0);
    expect(await s.item()).toMatchObject({ draftRevision: 1, draftEdited: true });
  });
  it("the first model finish stores revision 1, unedited", async () => {
    const s = await setup(); await s.ready();
    expect(await s.item()).toMatchObject({ draftRevision: 1, draftEdited: false, status: "ready" });
  });
});

describe("optimistic concurrency", () => {
  it("lets exactly one of two saves with the same expected version win, at a fixed clock", async () => {
    const s = await setup(); await s.ready();
    await save(s.alice as never, s.itemId, [draft({ restaurant: "First" })], 1, 1);
    const afterFirst = await s.item();
    await expect(save(s.alice as never, s.itemId, [draft({ restaurant: "Second" })], 1, 1)).rejects.toThrow("changed by another save");
    const after = await s.item();
    expect(JSON.parse(after!.draftJson!)[0].restaurant).toBe("First");
    expect(after).toEqual(afterFirst);
    expect(after!.draftRevision).toBe(2);
    expect(Date.now()).toBe(T0); // revision, not time, decides
  });
  it("runs concurrent identical-version saves with only one success", async () => {
    const s = await setup(); await s.ready();
    const results = await Promise.allSettled([
      save(s.alice as never, s.itemId, [draft({ restaurant: "A" })], 1, 1),
      save(s.alice as never, s.itemId, [draft({ restaurant: "B" })], 1, 1),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await s.item())!.draftRevision).toBe(2);
  });
  it("advances by exactly one per successful save and accepts the next expected version", async () => {
    const s = await setup(); await s.ready();
    await save(s.alice as never, s.itemId, [draft({ restaurant: "1" })], 1, 1);
    await save(s.alice as never, s.itemId, [draft({ restaurant: "2" })], 1, 2);
    expect(await s.item()).toMatchObject({ draftRevision: 3, draftEdited: true });
  });
  it("rejects a stale generation after a retry, then accepts the new one", async () => {
    const s = await setup(); await s.ready();
    await s.t.mutation(internal.reels.fail, { itemId: s.itemId, generation: 1, code: "X", message: "m" });
    await s.alice.mutation(api.reels.retry, { itemId: s.itemId });
    await expect(save(s.alice as never, s.itemId, [draft()], 1, 1)).rejects.toThrow("another retry or save");
    await save(s.alice as never, s.itemId, [draft({ restaurant: "After retry" })], 2, 1);
    expect(await s.item()).toMatchObject({ generation: 2, draftRevision: 2 });
  });
  it("rejects invalid expected numbers", async () => {
    const s = await setup(); await s.ready();
    for (const [g, r] of [[-1, 1], [1, -1], [1.5, 1], [1, 0.5], [NaN, 1], [1, NaN], [Infinity, 1]]) {
      await expect(save(s.alice as never, s.itemId, [draft()], g, r)).rejects.toThrow("invalid");
    }
    expect((await s.item())!.draftRevision).toBe(1);
  });
});

describe("overflow and corrupted counters fail atomically", () => {
  it("rejects a save at MAX_SAFE_INTEGER revision and a retry at MAX_SAFE_INTEGER generation", async () => {
    const s = await setup(); await s.ready();
    await s.t.run(ctx => ctx.db.patch(s.itemId, { draftRevision: MAX }));
    const before = await s.item();
    await expect(save(s.alice as never, s.itemId, [draft({ restaurant: "x" })], 1, MAX)).rejects.toThrow("cannot be saved again");
    expect(await s.item()).toEqual(before);
    await s.t.run(ctx => ctx.db.patch(s.itemId, { status: "failed", generation: MAX, draftRevision: 1 }));
    const failed = await s.item();
    await expect(s.alice.mutation(api.reels.retry, { itemId: s.itemId })).rejects.toThrow("cannot be retried");
    expect(await s.item()).toEqual(failed);
  });
  it.each([-1, 0.5, NaN, Infinity])("a corrupt stored revision %s rejects save and finish with no change", async bad => {
    const s = await setup(); await s.ready();
    await s.t.run(ctx => ctx.db.patch(s.itemId, { draftRevision: bad }));
    const before = await s.item();
    await expect(save(s.alice as never, s.itemId, [draft()], 1, 0)).rejects.toThrow("corrupt");
    await expect(s.t.mutation(internal.reels.finish, { itemId: s.itemId, generation: 1, extractionJson: extraction([draft()]) })).rejects.toThrow("corrupt");
    const after = await s.item();
    expect(Object.is(after!.draftRevision, bad)).toBe(true);
    expect(after!.draftJson).toBe(before!.draftJson);
  });
  it("a finish that would overflow the revision is rejected without change", async () => {
    const s = await setup(); await s.ready();
    await s.t.run(ctx => ctx.db.patch(s.itemId, { draftRevision: MAX }));
    const before = await s.item();
    await expect(s.t.mutation(internal.reels.finish, { itemId: s.itemId, generation: 1, extractionJson: extraction([draft({ restaurant: "New" })]) })).rejects.toThrow("cannot be saved again");
    expect(await s.item()).toEqual(before);
  });
});

describe("strict shape and size", () => {
  it("rejects bad shapes and sizes with no change", async () => {
    const s = await setup(); await s.ready();
    const before = await s.item();
    const bad: string[] = [
      "not json", "{}", "[]", JSON.stringify(Array.from({ length: 11 }, () => draft())),
      JSON.stringify([{ ...draft(), extra: 1 }]), JSON.stringify([{ ...draft(), price: -1 }]),
      JSON.stringify([draft({ restaurant: "x".repeat(70000) })]),
    ];
    for (const draftJson of bad) {
      await expect(s.alice.mutation(api.reels.saveDraft, { itemId: s.itemId, draftJson, expectedGeneration: 1, expectedRevision: 1 })).rejects.toThrow();
    }
    expect(await s.item()).toEqual(before);
  });
  it("allows 1 to 10 offers regardless of the model's offer count", async () => {
    const s = await setup(); await s.ready([draft(), draft({ restaurant: "B" })]);
    await save(s.alice as never, s.itemId, [draft({ restaurant: "Only" })], 1, 1);
    await save(s.alice as never, s.itemId, Array.from({ length: 10 }, (_, i) => draft({ restaurant: `R${i}` })), 1, 2);
    expect(JSON.parse((await s.item())!.draftJson!)).toHaveLength(10);
  });
});

describe("states and retry keep edits", () => {
  it("rejects a save when no draft exists yet", async () => {
    const s = await setup();
    await expect(save(s.alice as never, s.itemId, [draft()], 1, 0)).rejects.toThrow("No draft");
  });
  it("saves in failed state, and retry keeps draft, revision, edited flag and extraction", async () => {
    const s = await setup(); await s.ready();
    await save(s.alice as never, s.itemId, [draft({ restaurant: "Mine" })], 1, 1);
    await s.t.mutation(internal.reels.fail, { itemId: s.itemId, generation: 1, code: "X", message: "m" });
    await save(s.alice as never, s.itemId, [draft({ restaurant: "Mine 2" })], 1, 2);
    const failed = await s.item();
    await s.alice.mutation(api.reels.retry, { itemId: s.itemId });
    const retried = await s.item();
    expect(retried).toMatchObject({ status: "queued", generation: 2, attempts: 2, draftRevision: 3, draftEdited: true, draftJson: failed!.draftJson, extractionJson: failed!.extractionJson });
    expect(retried!.error).toBeUndefined();
    expect(retried!.videoId).toBeUndefined();
    // still editable while the retry is queued
    await save(s.alice as never, s.itemId, [draft({ restaurant: "Mine 3" })], 2, 3);
    expect(JSON.parse((await s.item())!.draftJson!)[0].restaurant).toBe("Mine 3");
  });
  it("never writes a deal", async () => {
    const s = await setup(); await s.ready();
    await save(s.alice as never, s.itemId, [draft()], 1, 1);
    expect(await s.t.run(ctx => ctx.db.query("deals").collect())).toEqual([]);
  });
});

describe("finish: edited versus default drafts", () => {
  it("keeps an edited draft when a new extraction has a different offer count, storing the extraction separately", async () => {
    const s = await setup(); await s.ready([draft()]);
    await save(s.alice as never, s.itemId, [draft({ restaurant: "Mine" })], 1, 1);
    await s.t.mutation(internal.reels.fail, { itemId: s.itemId, generation: 1, code: "X", message: "m" });
    await s.alice.mutation(api.reels.retry, { itemId: s.itemId });
    const newExtraction = extraction([draft({ restaurant: "Model A" }), draft({ restaurant: "Model B" })]);
    await s.t.mutation(internal.reels.finish, { itemId: s.itemId, generation: 2, extractionJson: newExtraction });
    const item = await s.item();
    expect(JSON.parse(item!.draftJson!)).toEqual([draft({ restaurant: "Mine" })]);
    expect(JSON.parse(item!.extractionJson!).drafts).toHaveLength(2);
    expect(item).toMatchObject({ status: "ready", draftRevision: 2, draftEdited: true });
  });
  it("keeps an edited draft even when the new extraction finds no deal", async () => {
    const s = await setup(); await s.ready();
    await save(s.alice as never, s.itemId, [draft({ restaurant: "Mine" })], 1, 1);
    await s.t.mutation(internal.reels.fail, { itemId: s.itemId, generation: 1, code: "X", message: "m" });
    await s.alice.mutation(api.reels.retry, { itemId: s.itemId });
    await s.t.mutation(internal.reels.finish, { itemId: s.itemId, generation: 2, extractionJson: extraction([], false) });
    expect(await s.item()).toMatchObject({ status: "no_deal", draftEdited: true, draftRevision: 2 });
    expect(JSON.parse((await s.item())!.draftJson!)[0].restaurant).toBe("Mine");
  });
  it("replaces an unedited model default and invalidates stale editors", async () => {
    const s = await setup(); await s.ready([draft({ restaurant: "Model 1" })]);
    await s.t.mutation(internal.reels.fail, { itemId: s.itemId, generation: 1, code: "X", message: "m" });
    await s.alice.mutation(api.reels.retry, { itemId: s.itemId });
    await s.t.mutation(internal.reels.finish, { itemId: s.itemId, generation: 2, extractionJson: extraction([draft({ restaurant: "Model 2" })]) });
    const item = await s.item();
    expect(JSON.parse(item!.draftJson!)[0].restaurant).toBe("Model 2");
    expect(item).toMatchObject({ draftRevision: 2, draftEdited: false });
    await expect(save(s.alice as never, s.itemId, [draft({ restaurant: "Stale editor" })], 2, 1)).rejects.toThrow("changed by another save");
    await save(s.alice as never, s.itemId, [draft({ restaurant: "Fresh editor" })], 2, 2);
  });
});

describe("late, deleted and expired results", () => {
  it("ignores a late finish or fail from an old generation", async () => {
    const s = await setup(); await s.ready();
    await save(s.alice as never, s.itemId, [draft({ restaurant: "Mine" })], 1, 1);
    await s.t.mutation(internal.reels.fail, { itemId: s.itemId, generation: 1, code: "X", message: "m" });
    await s.alice.mutation(api.reels.retry, { itemId: s.itemId });
    const before = await s.item();
    await s.t.mutation(internal.reels.finish, { itemId: s.itemId, generation: 1, extractionJson: extraction([draft({ restaurant: "Late" })]) });
    await s.t.mutation(internal.reels.fail, { itemId: s.itemId, generation: 1, code: "LATE", message: "late" });
    expect(await s.item()).toEqual(before);
  });
  it("does not resurrect or write a deleted item", async () => {
    const s = await setup(); await s.ready();
    await s.alice.mutation(api.reels.remove, { itemId: s.itemId });
    await s.t.mutation(internal.reels.finish, { itemId: s.itemId, generation: 1, extractionJson: extraction([draft()]) });
    await s.t.mutation(internal.reels.fail, { itemId: s.itemId, generation: 1, code: "X", message: "m" });
    expect(await s.item()).toBeNull();
    await expect(save(s.alice as never, s.itemId, [draft()], 1, 1)).rejects.toThrow("Item not found");
  });
  it("ignores results and rejects saves for an expired item", async () => {
    const s = await setup(); await s.ready();
    const before = await s.item();
    vi.setSystemTime(before!.expiresAt + 1);
    await s.t.mutation(internal.reels.finish, { itemId: s.itemId, generation: 1, extractionJson: extraction([draft({ restaurant: "Late" })]) });
    await expect(save(s.alice as never, s.itemId, [draft()], 1, 1)).rejects.toThrow("Item not found");
    expect(await s.item()).toEqual(before);
  });
});
