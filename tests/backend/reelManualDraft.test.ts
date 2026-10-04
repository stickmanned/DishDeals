// @vitest-environment edge-runtime
/// <reference types="vite/client" />
/**
 * In-memory convex-test of reels.saveDraft manual draft creation (N-FORM-B).
 *
 * Verifies approved policy revision:
 * - Allows creation of manual private drafts when draftJson is initially absent
 *   (pending, failed, or no_deal states).
 * - Preserves user's manual draft when a late model extraction finishes (draftEdited: true).
 * - Enforces authentication and ownership guards.
 * - Rejects saves on expired items.
 * - Enforces optimistic concurrency (stale generation and stale revision rejection).
 * - Handles corrupt existing stored draftJson safely.
 *
 * NOTE: All identities, items, extractions, and videos in this test suite are
 * SYNTHETIC in-memory test fixtures. No provider, live cloud, or native bridge is involved.
 */

import { convexTest } from "convex-test";
import workflow from "@convex-dev/workflow/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../../convex/schema";
import { api, internal } from "../../convex/_generated/api";

const modules = import.meta.glob(["../../convex/**/*.ts", "!../../convex/**/*.test.ts"]);
const TEST_LINK = "https://www.instagram.com/reel/C3b4Manual123/";
const T0 = new Date("2026-10-04T12:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

const sampleManualDraft = (overrides: Record<string, unknown> = {}) => ({
  restaurant: "Vancouver Dosa",
  address: "Kingsway & Fraser",
  dealText: "Masala Dosa with Chai for $9",
  price: 9,
  currency: "CAD",
  validDays: ["mon", "tue", "wed"],
  validStart: "11:00",
  validEnd: "16:00",
  expiresOn: "2026-12-31",
  conditions: ["Dine-in only"],
  ...overrides,
});

async function setupTestEnvironment() {
  const t = convexTest(schema, modules);
  workflow.register(t);

  // Synthetic test users
  const [userAId, userBId] = await t.run(async (ctx) => [
    await ctx.db.insert("users", {}),
    await ctx.db.insert("users", {}),
  ]);

  const alice = t.withIdentity({ subject: `${userAId}|session-alice-synthetic` });
  const bob = t.withIdentity({ subject: `${userBId}|session-bob-synthetic` });

  // Alice submits a Reel link
  const { itemId } = await alice.mutation(api.reels.submit, { text: TEST_LINK });
  const getItem = () => t.run((ctx) => ctx.db.get("reelItems", itemId));

  return { t, alice, bob, itemId, getItem };
}

describe("N-FORM-B: Manual draft creation and persistence via reels.saveDraft", () => {
  it("allows saving a manual private draft when draftJson is initially absent (pending/queued state)", async () => {
    const s = await setupTestEnvironment();
    const before = await s.getItem();
    expect(before?.draftJson).toBeUndefined();
    expect(before?.status).toBe("queued");

    const manual = [sampleManualDraft()];
    await s.alice.mutation(api.reels.saveDraft, {
      itemId: s.itemId,
      draftJson: JSON.stringify(manual),
      expectedGeneration: 1,
      expectedRevision: 0,
    });

    const after = await s.getItem();
    expect(after).not.toBeNull();
    expect(after?.draftEdited).toBe(true);
    expect(after?.draftRevision).toBe(1);
    expect(after?.draftJson).toBe(JSON.stringify(manual));
  });

  it("allows saving a manual private draft when processing has failed", async () => {
    const s = await setupTestEnvironment();

    // Mark item as failed
    await s.t.mutation(internal.reels.fail, {
      itemId: s.itemId,
      generation: 1,
      code: "NO_MEDIA",
      message: "Screen recording was not attached.",
    });

    const failedItem = await s.getItem();
    expect(failedItem?.status).toBe("failed");
    expect(failedItem?.draftJson).toBeUndefined();

    // User can manually enter deal details and save
    const manual = [sampleManualDraft({ restaurant: "Manual Rescue Diner" })];
    await s.alice.mutation(api.reels.saveDraft, {
      itemId: s.itemId,
      draftJson: JSON.stringify(manual),
      expectedGeneration: 1,
      expectedRevision: 0,
    });

    const savedItem = await s.getItem();
    expect(savedItem?.draftEdited).toBe(true);
    expect(savedItem?.draftRevision).toBe(1);
    expect(JSON.parse(savedItem!.draftJson!)[0].restaurant).toBe("Manual Rescue Diner");
  });

  it("allows saving a manual private draft when processing finished as no_deal", async () => {
    const s = await setupTestEnvironment();

    // Finish as no_deal with empty drafts
    const noDealExtraction = JSON.stringify({
      isDeal: false,
      drafts: [],
      evidence: [],
      transcript: "No dining offers detected in video.",
      warnings: [],
    });

    await s.t.mutation(internal.reels.finish, {
      itemId: s.itemId,
      generation: 1,
      extractionJson: noDealExtraction,
    });

    const noDealItem = await s.getItem();
    expect(noDealItem?.status).toBe("no_deal");

    // User creates manual draft
    const manual = [sampleManualDraft({ restaurant: "User Found Deal" })];
    await s.alice.mutation(api.reels.saveDraft, {
      itemId: s.itemId,
      draftJson: JSON.stringify(manual),
      expectedGeneration: 1,
      expectedRevision: noDealItem!.draftRevision ?? 0,
    });

    const savedItem = await s.getItem();
    expect(savedItem?.draftEdited).toBe(true);
    expect(JSON.parse(savedItem!.draftJson!)[0].restaurant).toBe("User Found Deal");
  });

  it("preserves manual draft values when a late model extraction finishes (draftEdited: true)", async () => {
    const s = await setupTestEnvironment();

    // Alice enters and saves manual draft while extraction is pending
    const manualDraft = [sampleManualDraft({ restaurant: "Alice's Confirmed Bistro", price: 15 })];
    await s.alice.mutation(api.reels.saveDraft, {
      itemId: s.itemId,
      draftJson: JSON.stringify(manualDraft),
      expectedGeneration: 1,
      expectedRevision: 0,
    });

    expect((await s.getItem())?.draftEdited).toBe(true);

    // Later, model extraction arrives with a different suggestion
    const modelExtraction = JSON.stringify({
      isDeal: true,
      drafts: [
        {
          restaurant: "Model Detected Name",
          address: null,
          dealText: "Model deal text",
          price: 99,
          currency: "CAD",
          validDays: null,
          validStart: null,
          validEnd: null,
          expiresOn: null,
          conditions: null,
        },
      ],
      evidence: [],
      transcript: "Speech",
      warnings: [],
    });

    await s.t.mutation(internal.reels.finish, {
      itemId: s.itemId,
      generation: 1,
      extractionJson: modelExtraction,
    });

    const finalItem = await s.getItem();
    // Crucial: User's manual draftJson is UNTOUCHED
    expect(JSON.parse(finalItem!.draftJson!)[0].restaurant).toBe("Alice's Confirmed Bistro");
    expect(JSON.parse(finalItem!.draftJson!)[0].price).toBe(15);
    expect(finalItem?.draftEdited).toBe(true);

    // Model extraction is stored separately in extractionJson
    expect(finalItem?.extractionJson).toBe(modelExtraction);
  });

  it("rejects unauthenticated callers", async () => {
    const s = await setupTestEnvironment();
    await expect(
      s.t.mutation(api.reels.saveDraft, {
        itemId: s.itemId,
        draftJson: JSON.stringify([sampleManualDraft()]),
        expectedGeneration: 1,
        expectedRevision: 0,
      })
    ).rejects.toThrow("Not signed in");
  });

  it("rejects unauthorized callers attempting to save another user's item", async () => {
    const s = await setupTestEnvironment();
    await expect(
      s.bob.mutation(api.reels.saveDraft, {
        itemId: s.itemId,
        draftJson: JSON.stringify([sampleManualDraft()]),
        expectedGeneration: 1,
        expectedRevision: 0,
      })
    ).rejects.toThrow("Item not found");
  });

  it("rejects saves on expired items", async () => {
    const s = await setupTestEnvironment();

    // Advance clock past expiration (7 days = 604800000ms)
    vi.setSystemTime(T0 + 8 * 24 * 3600 * 1000);

    await expect(
      s.alice.mutation(api.reels.saveDraft, {
        itemId: s.itemId,
        draftJson: JSON.stringify([sampleManualDraft()]),
        expectedGeneration: 1,
        expectedRevision: 0,
      })
    ).rejects.toThrow("Item not found");
  });

  it("rejects saves with stale revision or stale generation", async () => {
    const s = await setupTestEnvironment();

    // Alice saves revision 1
    await s.alice.mutation(api.reels.saveDraft, {
      itemId: s.itemId,
      draftJson: JSON.stringify([sampleManualDraft()]),
      expectedGeneration: 1,
      expectedRevision: 0,
    });

    // Trying to save with stale revision 0 throws stale_revision error
    await expect(
      s.alice.mutation(api.reels.saveDraft, {
        itemId: s.itemId,
        draftJson: JSON.stringify([sampleManualDraft({ restaurant: "Stale" })]),
        expectedGeneration: 1,
        expectedRevision: 0,
      })
    ).rejects.toThrow("changed by another save");

    // Trying to save with stale generation 0 throws stale_generation error
    await expect(
      s.alice.mutation(api.reels.saveDraft, {
        itemId: s.itemId,
        draftJson: JSON.stringify([sampleManualDraft()]),
        expectedGeneration: 0,
        expectedRevision: 1,
      })
    ).rejects.toThrow("changed by another retry or save");
  });

  it("fails safely if stored draftJson is corrupt", async () => {
    const s = await setupTestEnvironment();

    // Inject corrupted draftJson directly into DB
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.itemId, { draftJson: "{ corrupt json" });
    });

    await expect(
      s.alice.mutation(api.reels.saveDraft, {
        itemId: s.itemId,
        draftJson: JSON.stringify([sampleManualDraft()]),
        expectedGeneration: 1,
        expectedRevision: 0,
      })
    ).rejects.toThrow("This draft is corrupt.");
  });

  it.each([
    ["a non-array JSON value", "{}"],
    ["an array of loosely shaped objects", JSON.stringify([{ restaurant: "x" }])],
    ["an array with an unknown strict key", JSON.stringify([{ ...sampleManualDraft(), extra: true }])],
    ["more than 10 drafts", JSON.stringify(Array.from({ length: 11 }, () => sampleManualDraft()))],
  ])("fails safely when stored draftJson is %s (strict 1..10 ReelDrafts)", async (_label, stored) => {
    const s = await setupTestEnvironment();
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.itemId, { draftJson: stored });
    });
    await expect(
      s.alice.mutation(api.reels.saveDraft, {
        itemId: s.itemId,
        draftJson: JSON.stringify([sampleManualDraft()]),
        expectedGeneration: 1,
        expectedRevision: 0,
      })
    ).rejects.toThrow("This draft is corrupt.");
    expect((await s.getItem())?.draftJson).toBe(stored);
  });

  it("treats an empty array as corrupt once the draft has been edited by the user", async () => {
    const s = await setupTestEnvironment();
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.itemId, { draftJson: "[]", draftEdited: true });
    });
    await expect(
      s.alice.mutation(api.reels.saveDraft, {
        itemId: s.itemId,
        draftJson: JSON.stringify([sampleManualDraft()]),
        expectedGeneration: 1,
        expectedRevision: 0,
      })
    ).rejects.toThrow("This draft is corrupt.");
  });

  it("fails safely when stored draftJson exceeds the size limit", async () => {
    const s = await setupTestEnvironment();
    const oversized = JSON.stringify([sampleManualDraft({ dealText: "x".repeat(200_000) })]);
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.itemId, { draftJson: oversized });
    });
    await expect(
      s.alice.mutation(api.reels.saveDraft, {
        itemId: s.itemId,
        draftJson: JSON.stringify([sampleManualDraft()]),
        expectedGeneration: 1,
        expectedRevision: 0,
      })
    ).rejects.toThrow("This draft is corrupt.");
  });

  it("still saves over a valid existing strict draft", async () => {
    const s = await setupTestEnvironment();
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.itemId, { draftJson: JSON.stringify([sampleManualDraft()]) });
    });
    await s.alice.mutation(api.reels.saveDraft, {
      itemId: s.itemId,
      draftJson: JSON.stringify([sampleManualDraft({ restaurant: "Edited" })]),
      expectedGeneration: 1,
      expectedRevision: 0,
    });
    expect(JSON.parse((await s.getItem())!.draftJson!)[0].restaurant).toBe("Edited");
  });
});
