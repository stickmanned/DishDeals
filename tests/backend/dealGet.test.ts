// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// In-memory convex-test of the real api.deals.get query against the canonical
// schema. All users, profiles, deals, votes and storage blobs are SYNTHETIC
// fixtures, not genuine published deals or photos. Synthetic identities only:
// this is NOT live Convex Auth, a deployed backend, UI or phone evidence.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

const SYNTHETIC_DEAL = {
  restaurant: "Synthetic Noodle House",
  address: "1 Fixture St",
  dealText: "Synthetic 2-for-1 noodles",
  priceCad: 9.5,
  validDays: ["tue" as const],
  validStart: "17:00",
  validEnd: "21:00",
  expiresOn: "2026-12-31",
  conditions: ["synthetic condition"],
  lat: 49.28,
  lng: -123.12,
  sourceUrl: "https://example.invalid/synthetic",
  stillOnCount: 3,
  expiredCount: 1,
};

async function setup() {
  const t = convexTest(schema, modules);
  const [authorId, aliceId, bobId] = await t.run(async (ctx) => [
    // Auth-private fields are seeded on purpose to prove they never leak.
    await ctx.db.insert("users", {
      email: "author-private@example.invalid",
      phone: "+10000000000",
      name: "Private Auth Name",
    }),
    await ctx.db.insert("users", { email: "alice@example.invalid" }),
    await ctx.db.insert("users", { email: "bob@example.invalid" }),
  ]);
  const makeDeal = (over: Record<string, unknown> = {}) =>
    t.run((ctx) => ctx.db.insert("deals", { ...SYNTHETIC_DEAL, authorId, ...over } as never));
  const storeImage = () =>
    t.run((ctx) => ctx.storage.store(new Blob(["synthetic-image-bytes"], { type: "image/png" })));
  const addProfile = (userId: Id<"users">, displayName: string, walletAddress?: string) =>
    t.run((ctx) =>
      ctx.db.insert("profiles", { userId, displayName, ...(walletAddress ? { walletAddress } : {}) }),
    );
  const snapshot = () =>
    t.run(async (ctx) => ({
      deals: await ctx.db.query("deals").collect(),
      votes: await ctx.db.query("votes").collect(),
      profiles: await ctx.db.query("profiles").collect(),
      users: await ctx.db.query("users").collect(),
    }));
  const as = (id: Id<"users">) => t.withIdentity({ subject: `${id}|session-${id}` });
  const dealId = await makeDeal();
  return {
    t, authorId, aliceId, bobId, dealId, makeDeal, storeImage, addProfile, snapshot,
    author: as(authorId), alice: as(aliceId), bob: as(bobId),
  };
}

describe("deals.get: availability and arguments", () => {
  it("is readable signed out (optional auth)", async () => {
    const s = await setup();
    const got = await s.t.query(api.deals.get, { dealId: s.dealId });
    expect(got).toMatchObject({ _id: s.dealId, restaurant: "Synthetic Noodle House", viewerVote: null });
  });

  it("returns null for a missing (deleted) deal", async () => {
    const s = await setup();
    const gone = await s.makeDeal();
    await s.t.run((ctx) => ctx.db.delete("deals", gone));
    expect(await s.t.query(api.deals.get, { dealId: gone })).toBeNull();
    expect(await s.alice.query(api.deals.get, { dealId: gone })).toBeNull();
  });

  it("rejects malformed args and ids from other tables", async () => {
    const s = await setup();
    const bad: unknown[] = [
      {},
      { dealId: "nope" },
      { dealId: s.aliceId }, // users id
      { dealId: s.dealId, extra: 1 },
      { dealId: s.dealId, lat: 49, lng: -123 }, // no viewer location argument
    ];
    for (const args of bad) {
      await expect(s.t.query(api.deals.get, args as never)).rejects.toThrow();
    }
  });
});

describe("deals.get: canonical fields", () => {
  it("preserves every stored field, system fields and counts", async () => {
    const s = await setup();
    const stored = await s.t.run((ctx) => ctx.db.get("deals", s.dealId));
    const got = await s.t.query(api.deals.get, { dealId: s.dealId });
    expect(got).toMatchObject(stored!);
    expect(got).toMatchObject({ stillOnCount: 3, expiredCount: 1, lat: 49.28, lng: -123.12 });
  });

  it("never invents distance, validity or location data", async () => {
    const s = await setup();
    const got = (await s.t.query(api.deals.get, { dealId: s.dealId }))!;
    for (const key of ["distanceKm", "status", "minutesLeft", "validNow"]) {
      expect(key in got).toBe(false);
    }
  });

  it("does not mutate any stored data", async () => {
    const s = await setup();
    await s.addProfile(s.authorId, "Chef", "WALLET1");
    await s.alice.mutation(api.votes.cast, { dealId: s.dealId, value: "still_on" });
    const before = await s.snapshot();
    await s.t.query(api.deals.get, { dealId: s.dealId });
    await s.alice.query(api.deals.get, { dealId: s.dealId });
    expect(await s.snapshot()).toEqual(before);
  });
});

describe("deals.get: author enrichment", () => {
  it("adds authorName and authorWallet from the author's profile", async () => {
    const s = await setup();
    await s.addProfile(s.authorId, "Chef Sam", "WALLET1");
    const got = await s.t.query(api.deals.get, { dealId: s.dealId });
    expect(got).toMatchObject({ authorName: "Chef Sam", authorWallet: "WALLET1" });
  });

  it("omits authorWallet when the profile has none", async () => {
    const s = await setup();
    await s.addProfile(s.authorId, "Chef Sam");
    const got = (await s.t.query(api.deals.get, { dealId: s.dealId }))!;
    expect(got.authorName).toBe("Chef Sam");
    expect("authorWallet" in got).toBe(false);
  });

  it("omits both (no invented name) when the author has no profile", async () => {
    const s = await setup();
    const got = (await s.t.query(api.deals.get, { dealId: s.dealId }))!;
    expect("authorName" in got).toBe(false);
    expect("authorWallet" in got).toBe(false);
  });

  it("leaks no auth-private user fields", async () => {
    const s = await setup();
    await s.addProfile(s.authorId, "Chef Sam", "WALLET1");
    for (const caller of [s.t, s.author, s.alice]) {
      const json = JSON.stringify(await caller.query(api.deals.get, { dealId: s.dealId }));
      for (const secret of ["author-private@example.invalid", "+10000000000", "Private Auth Name", "alice@example.invalid", "session-"]) {
        expect(json).not.toContain(secret);
      }
      const got = JSON.parse(json);
      for (const key of ["email", "phone", "name", "password", "emailVerificationTime"]) {
        expect(key in got).toBe(false);
      }
    }
  });
});

describe("deals.get: imageUrl", () => {
  it("is null with no image", async () => {
    const s = await setup();
    expect((await s.t.query(api.deals.get, { dealId: s.dealId }))!.imageUrl).toBeNull();
  });

  it("is the storage URL for an existing synthetic file", async () => {
    const s = await setup();
    const imageId = await s.storeImage();
    const d = await s.makeDeal({ imageId });
    const got = (await s.t.query(api.deals.get, { dealId: d }))!;
    const expected = await s.t.run((ctx) => ctx.storage.getUrl(imageId));
    expect(typeof got.imageUrl).toBe("string");
    expect(got.imageUrl).toBe(expected);
    expect(got.imageId).toBe(imageId); // canonical field preserved
  });

  it("is null when the referenced file no longer exists", async () => {
    const s = await setup();
    const imageId = await s.storeImage();
    const d = await s.makeDeal({ imageId });
    await s.t.run((ctx) => ctx.storage.delete(imageId));
    const got = (await s.t.query(api.deals.get, { dealId: d }))!;
    expect(got.imageUrl).toBeNull();
    expect(got.imageId).toBe(imageId);
  });
});

describe("deals.get: viewerVote", () => {
  it("is null signed out, even when others have voted", async () => {
    const s = await setup();
    await s.alice.mutation(api.votes.cast, { dealId: s.dealId, value: "still_on" });
    expect((await s.t.query(api.deals.get, { dealId: s.dealId }))!.viewerVote).toBeNull();
  });

  it("is null for a signed-in viewer who has not voted", async () => {
    const s = await setup();
    await s.alice.mutation(api.votes.cast, { dealId: s.dealId, value: "still_on" });
    expect((await s.bob.query(api.deals.get, { dealId: s.dealId }))!.viewerVote).toBeNull();
  });

  it("tracks only the caller's own vote through votes.cast switching", async () => {
    const s = await setup();
    const vote = async (c: typeof s.alice) => (await c.query(api.deals.get, { dealId: s.dealId }))!.viewerVote;
    await s.alice.mutation(api.votes.cast, { dealId: s.dealId, value: "still_on" });
    await s.bob.mutation(api.votes.cast, { dealId: s.dealId, value: "expired" });
    expect(await vote(s.alice)).toBe("still_on");
    expect(await vote(s.bob)).toBe("expired");
    await s.alice.mutation(api.votes.cast, { dealId: s.dealId, value: "expired" });
    expect(await vote(s.alice)).toBe("expired");
    expect(await vote(s.bob)).toBe("expired");
    await s.bob.mutation(api.votes.cast, { dealId: s.dealId, value: "still_on" });
    expect(await vote(s.alice)).toBe("expired");
    expect(await vote(s.bob)).toBe("still_on");
    const got = (await s.alice.query(api.deals.get, { dealId: s.dealId }))!;
    expect(got).toMatchObject({ stillOnCount: 4, expiredCount: 2 }); // seeded 3/1 + sequence net
  });

  it("is per deal", async () => {
    const s = await setup();
    const other = await s.makeDeal();
    await s.alice.mutation(api.votes.cast, { dealId: s.dealId, value: "still_on" });
    expect((await s.alice.query(api.deals.get, { dealId: other }))!.viewerVote).toBeNull();
  });
});

describe("deals.get: corrupt duplicate ownership rows fail explicitly", () => {
  it("rejects duplicate author profiles with different wallets, without leaking either", async () => {
    const s = await setup();
    await s.addProfile(s.authorId, "Chef One", "WALLET-ONE");
    await s.addProfile(s.authorId, "Chef Two", "WALLET-TWO");
    const before = await s.snapshot();
    for (const caller of [s.t, s.alice]) {
      const err = await caller.query(api.deals.get, { dealId: s.dealId }).then(
        () => null,
        (e: unknown) => e as Error,
      );
      expect(err).toBeInstanceOf(Error);
      for (const leaked of ["WALLET-ONE", "WALLET-TWO", "Chef One", "Chef Two", "author-private@example.invalid"]) {
        expect(String(err!.message)).not.toContain(leaked);
      }
    }
    expect(await s.snapshot()).toEqual(before);
  });

  it("rejects duplicate votes by the same viewer; other viewers and signed-out reads are unaffected", async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      await ctx.db.insert("votes", { dealId: s.dealId, userId: s.aliceId, value: "still_on" });
      await ctx.db.insert("votes", { dealId: s.dealId, userId: s.aliceId, value: "expired" });
    });
    const before = await s.snapshot();
    await expect(s.alice.query(api.deals.get, { dealId: s.dealId })).rejects.toThrow();
    // Only the ambiguous viewer is affected; others and signed-out reads are not.
    expect((await s.bob.query(api.deals.get, { dealId: s.dealId }))!.viewerVote).toBeNull();
    expect((await s.t.query(api.deals.get, { dealId: s.dealId }))!.viewerVote).toBeNull();
    expect(await s.snapshot()).toEqual(before);
  });
});
