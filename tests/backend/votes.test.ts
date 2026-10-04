// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// In-memory convex-test of the real votes.cast mutation against the canonical
// schema. All users, deals and votes are SYNTHETIC fixtures created in memory.
// Synthetic identities only: this is NOT live Convex Auth, a real published
// deal, a deployed backend, native UI or phone evidence.
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
  stillOnCount: 0,
  expiredCount: 0,
};

async function setup() {
  const t = convexTest(schema, modules);
  const [authorId, aliceId, bobId] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { email: "author@example.invalid" }),
    await ctx.db.insert("users", { email: "alice@example.invalid" }),
    await ctx.db.insert("users", { email: "bob@example.invalid" }),
  ]);
  const makeDeal = (over: Record<string, unknown> = {}) =>
    t.run((ctx) =>
      ctx.db.insert("deals", { ...SYNTHETIC_DEAL, authorId, ...over } as never),
    );
  const dealId = await makeDeal();
  // Convex Auth identity subject is "<userId>|<sessionId>".
  const as = (id: Id<"users">) => t.withIdentity({ subject: `${id}|session-${id}` });
  const deal = (id: Id<"deals"> = dealId) => t.run((ctx) => ctx.db.get("deals", id));
  const votes = () => t.run((ctx) => ctx.db.query("votes").collect());
  const counts = async (id: Id<"deals"> = dealId) => {
    const d = (await deal(id))!;
    return { stillOn: d.stillOnCount, expired: d.expiredCount };
  };
  return {
    t, authorId, aliceId, bobId, dealId, makeDeal, deal, votes, counts,
    author: as(authorId), alice: as(aliceId), bob: as(bobId), as,
  };
}

const STILL = "still_on" as const;
const EXPIRED = "expired" as const;

describe("votes.cast: auth and argument validation", () => {
  it("rejects signed-out callers without any write", async () => {
    const s = await setup();
    await expect(s.t.mutation(api.votes.cast, { dealId: s.dealId, value: STILL })).rejects.toThrow("Not signed in");
    expect(await s.votes()).toHaveLength(0);
    expect(await s.counts()).toEqual({ stillOn: 0, expired: 0 });
  });

  it("rejects malformed arguments without any write", async () => {
    const s = await setup();
    const bad: unknown[] = [
      { dealId: s.dealId, value: "maybe" },
      { dealId: s.dealId, value: "STILL_ON" },
      { dealId: s.dealId },
      { value: STILL },
      { dealId: "not-an-id", value: STILL },
      { dealId: s.aliceId, value: STILL }, // an id from another table
      { dealId: s.dealId, value: STILL, userId: s.bobId }, // client-controlled user
      { dealId: s.dealId, value: STILL, stillOnCount: 99 }, // client-controlled count
    ];
    for (const args of bad) {
      await expect(s.alice.mutation(api.votes.cast, args as never)).rejects.toThrow();
    }
    expect(await s.votes()).toHaveLength(0);
    expect(await s.counts()).toEqual({ stillOn: 0, expired: 0 });
  });

  it("rejects a missing (deleted) deal without any write", async () => {
    const s = await setup();
    const gone = await s.makeDeal();
    await s.t.run((ctx) => ctx.db.delete("deals", gone));
    await expect(s.alice.mutation(api.votes.cast, { dealId: gone, value: STILL })).rejects.toThrow("Deal not found");
    expect(await s.votes()).toHaveLength(0);
  });

  it("returns null and needs no profile", async () => {
    const s = await setup();
    expect(await s.t.run((ctx) => ctx.db.query("profiles").collect())).toHaveLength(0);
    expect(await s.alice.mutation(api.votes.cast, { dealId: s.dealId, value: STILL })).toBeNull();
  });
});

describe("votes.cast: single user semantics", () => {
  it("first vote inserts one row under the derived user and bumps one counter", async () => {
    const s = await setup();
    await s.alice.mutation(api.votes.cast, { dealId: s.dealId, value: STILL });
    expect(await s.counts()).toEqual({ stillOn: 1, expired: 0 });
    const rows = await s.votes();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ dealId: s.dealId, userId: s.aliceId, value: STILL });
  });

  it("repeating the same vote is idempotent (no row or count change)", async () => {
    const s = await setup();
    await s.alice.mutation(api.votes.cast, { dealId: s.dealId, value: EXPIRED });
    const before = await s.votes();
    for (let i = 0; i < 3; i++) {
      await s.alice.mutation(api.votes.cast, { dealId: s.dealId, value: EXPIRED });
    }
    expect(await s.counts()).toEqual({ stillOn: 0, expired: 1 });
    expect(await s.votes()).toEqual(before);
  });

  it("switching back and forth moves exactly one count and reuses the same row", async () => {
    const s = await setup();
    await s.alice.mutation(api.votes.cast, { dealId: s.dealId, value: STILL });
    const rowId = (await s.votes())[0]._id;
    await s.alice.mutation(api.votes.cast, { dealId: s.dealId, value: EXPIRED });
    expect(await s.counts()).toEqual({ stillOn: 0, expired: 1 });
    await s.alice.mutation(api.votes.cast, { dealId: s.dealId, value: STILL });
    expect(await s.counts()).toEqual({ stillOn: 1, expired: 0 });
    await s.alice.mutation(api.votes.cast, { dealId: s.dealId, value: EXPIRED });
    expect(await s.counts()).toEqual({ stillOn: 0, expired: 1 });
    const rows = await s.votes();
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(rowId);
    expect(rows[0].value).toBe(EXPIRED);
  });

  it("lets the deal author vote (no invented restriction)", async () => {
    const s = await setup();
    await s.author.mutation(api.votes.cast, { dealId: s.dealId, value: STILL });
    expect(await s.counts()).toEqual({ stillOn: 1, expired: 0 });
  });
});

describe("votes.cast: multiple users", () => {
  it("keeps independent votes and cannot overwrite another user's vote", async () => {
    const s = await setup();
    await s.alice.mutation(api.votes.cast, { dealId: s.dealId, value: STILL });
    await s.bob.mutation(api.votes.cast, { dealId: s.dealId, value: EXPIRED });
    expect(await s.counts()).toEqual({ stillOn: 1, expired: 1 });
    // Bob switching never touches Alice's row.
    await s.bob.mutation(api.votes.cast, { dealId: s.dealId, value: STILL });
    const byUser = Object.fromEntries((await s.votes()).map((r) => [r.userId, r.value]));
    expect(byUser).toEqual({ [s.aliceId]: STILL, [s.bobId]: STILL });
    expect(await s.counts()).toEqual({ stillOn: 2, expired: 0 });
  });

  it("keeps votes on different deals separate", async () => {
    const s = await setup();
    const other = await s.makeDeal();
    await s.alice.mutation(api.votes.cast, { dealId: s.dealId, value: STILL });
    await s.alice.mutation(api.votes.cast, { dealId: other, value: EXPIRED });
    expect(await s.counts(s.dealId)).toEqual({ stillOn: 1, expired: 0 });
    expect(await s.counts(other)).toEqual({ stillOn: 0, expired: 1 });
    expect(await s.votes()).toHaveLength(2);
  });

  it("keeps counters equal to vote rows after a deterministic mixed sequence", async () => {
    const s = await setup();
    const dealB = await s.makeDeal();
    const deals = [s.dealId, dealB];
    const users = [s.author, s.alice, s.bob];
    let seed = 7;
    const rnd = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    for (let i = 0; i < 60; i++) {
      await users[rnd(3)].mutation(api.votes.cast, {
        dealId: deals[rnd(2)],
        value: rnd(2) ? STILL : EXPIRED,
      });
      const rows = await s.votes();
      for (const id of deals) {
        expect(await s.counts(id)).toEqual({
          stillOn: rows.filter((r) => r.dealId === id && r.value === STILL).length,
          expired: rows.filter((r) => r.dealId === id && r.value === EXPIRED).length,
        });
      }
    }
    // at most one row per (deal, user)
    const keys = (await s.votes()).map((r) => `${r.dealId}|${r.userId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("votes.cast: corrupt data is rejected atomically", () => {
  it.each([
    ["negative stillOnCount", { stillOnCount: -1 }],
    ["fractional stillOnCount", { stillOnCount: 1.5 }],
    ["NaN stillOnCount", { stillOnCount: NaN }],
    ["Infinity expiredCount", { expiredCount: Infinity }],
    ["negative expiredCount", { expiredCount: -3 }],
    ["fractional expiredCount", { expiredCount: 0.2 }],
  ])("%s fails with no write", async (_n, over) => {
    const s = await setup();
    const bad = await s.makeDeal(over);
    const before = await s.deal(bad);
    for (const value of [STILL, EXPIRED]) {
      await expect(s.alice.mutation(api.votes.cast, { dealId: bad, value })).rejects.toThrow("corrupt");
    }
    expect(await s.votes()).toHaveLength(0);
    expect(await s.deal(bad)).toEqual(before);
  });

  it("fails a switch whose old counter is zero, changing nothing", async () => {
    const s = await setup();
    const d = await s.makeDeal({ stillOnCount: 0, expiredCount: 4 });
    await s.t.run((ctx) => ctx.db.insert("votes", { dealId: d, userId: s.aliceId, value: STILL }));
    const before = await s.deal(d);
    const rowsBefore = await s.votes();
    await expect(s.alice.mutation(api.votes.cast, { dealId: d, value: EXPIRED })).rejects.toThrow("inconsistent");
    expect(await s.deal(d)).toEqual(before);
    expect(await s.votes()).toEqual(rowsBefore);
  });

  it.each([STILL, EXPIRED])(
    "fails a repeated %s vote whose own counter is zero, changing nothing",
    async (value) => {
      const s = await setup();
      const d = await s.makeDeal({ stillOnCount: 0, expiredCount: 0 });
      await s.t.run((ctx) => ctx.db.insert("votes", { dealId: d, userId: s.aliceId, value }));
      const before = await s.deal(d);
      const rowsBefore = await s.votes();
      await expect(s.alice.mutation(api.votes.cast, { dealId: d, value })).rejects.toThrow("inconsistent");
      expect(await s.deal(d)).toEqual(before);
      expect(await s.votes()).toEqual(rowsBefore);
    },
  );

  it("still accepts a repeated vote whose counter is positive (even if totals exceed rows)", async () => {
    const s = await setup();
    const d = await s.makeDeal({ stillOnCount: 3 });
    await s.t.run((ctx) => ctx.db.insert("votes", { dealId: d, userId: s.aliceId, value: STILL }));
    await s.alice.mutation(api.votes.cast, { dealId: d, value: STILL });
    expect(await s.counts(d)).toEqual({ stillOn: 3, expired: 0 }); // not recounted or repaired
  });

  const MAX = Number.MAX_SAFE_INTEGER;
  it.each([
    ["first still_on", { stillOnCount: MAX }, null, STILL],
    ["first expired", { expiredCount: MAX }, null, EXPIRED],
    ["switch to still_on", { stillOnCount: MAX, expiredCount: 1 }, EXPIRED, STILL],
    ["switch to expired", { stillOnCount: 1, expiredCount: MAX }, STILL, EXPIRED],
  ])("rejects an increment past MAX_SAFE_INTEGER: %s", async (_n, counts, prior, value) => {
    const s = await setup();
    const d = await s.makeDeal(counts);
    if (prior) {
      await s.t.run((ctx) => ctx.db.insert("votes", { dealId: d, userId: s.aliceId, value: prior }));
    }
    const before = await s.deal(d);
    const rowsBefore = await s.votes();
    await expect(s.alice.mutation(api.votes.cast, { dealId: d, value })).rejects.toThrow("safe integer");
    expect(await s.deal(d)).toEqual(before);
    expect(await s.votes()).toEqual(rowsBefore);
  });

  it("allows an increment that lands exactly on MAX_SAFE_INTEGER", async () => {
    const s = await setup();
    const d = await s.makeDeal({ stillOnCount: MAX - 1 });
    await s.alice.mutation(api.votes.cast, { dealId: d, value: STILL });
    expect(await s.counts(d)).toEqual({ stillOn: MAX, expired: 0 });
  });

  it("fails on duplicate vote rows for one user and deal, changing nothing", async () => {
    const s = await setup();
    const d = await s.makeDeal({ stillOnCount: 2 });
    await s.t.run(async (ctx) => {
      await ctx.db.insert("votes", { dealId: d, userId: s.aliceId, value: STILL });
      await ctx.db.insert("votes", { dealId: d, userId: s.aliceId, value: STILL });
    });
    const before = await s.deal(d);
    await expect(s.alice.mutation(api.votes.cast, { dealId: d, value: EXPIRED })).rejects.toThrow();
    expect(await s.deal(d)).toEqual(before);
  });

  it("does not repair a pre-existing count that disagrees with the rows (no fabricated totals)", async () => {
    const s = await setup();
    const d = await s.makeDeal({ stillOnCount: 5, expiredCount: 2 }); // synthetic seeded counts, no vote rows
    await s.alice.mutation(api.votes.cast, { dealId: d, value: STILL });
    expect(await s.counts(d)).toEqual({ stillOn: 6, expired: 2 });
  });
});

describe("votes.cast: invariants", () => {
  it("preserves every other deal field across all transitions", async () => {
    const s = await setup();
    const strip = (d: Record<string, unknown> | null) =>
      Object.fromEntries(
        Object.entries(d!).filter(([k]) => k !== "stillOnCount" && k !== "expiredCount"),
      );
    const before = strip(await s.deal());
    await s.alice.mutation(api.votes.cast, { dealId: s.dealId, value: STILL });
    await s.alice.mutation(api.votes.cast, { dealId: s.dealId, value: EXPIRED });
    await s.bob.mutation(api.votes.cast, { dealId: s.dealId, value: STILL });
    expect(strip(await s.deal())).toEqual(before);
  });
});
