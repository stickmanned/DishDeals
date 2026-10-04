// @vitest-environment edge-runtime
/// <reference types="vite/client" />
// Local mock-backend tests of the real users.me / users.upsertProfile
// wrappers against the canonical schema. Synthetic identities only: this is
// NOT live Convex Auth, JWT or phone evidence.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  const [aliceId, bobId] = await t.run(async (ctx) => [
    await ctx.db.insert("users", { email: "alice@example.com" }),
    await ctx.db.insert("users", { email: "bob@example.com" }),
  ]);
  // Convex Auth identity subject is "<userId>|<sessionId>".
  const as = (id: Id<"users">) =>
    t.withIdentity({ subject: `${id}|session-${id}` });
  const profiles = () => t.run((ctx) => ctx.db.query("profiles").collect());
  return { t, aliceId, bobId, alice: as(aliceId), bob: as(bobId), profiles };
}

describe("users.me", () => {
  it("is null when signed out", async () => {
    const { t } = await setup();
    expect(await t.query(api.users.me, {})).toBeNull();
  });

  it("is null when signed in without a profile", async () => {
    const { alice } = await setup();
    expect(await alice.query(api.users.me, {})).toBeNull();
  });

  it("returns the flat canonical shape", async () => {
    const { alice, aliceId } = await setup();
    await alice.mutation(api.users.upsertProfile, { displayName: "Alice" });
    expect(await alice.query(api.users.me, {})).toStrictEqual({
      userId: aliceId,
      displayName: "Alice",
    });
    await alice.mutation(api.users.upsertProfile, {
      displayName: "Alice",
      walletAddress: "WALLET1",
    });
    expect(await alice.query(api.users.me, {})).toStrictEqual({
      userId: aliceId,
      displayName: "Alice",
      walletAddress: "WALLET1",
    });
  });
});

describe("users.upsertProfile", () => {
  it("rejects when signed out and writes nothing", async () => {
    const { t, profiles } = await setup();
    await expect(
      t.mutation(api.users.upsertProfile, { displayName: "Ghost" }),
    ).rejects.toThrow("Not signed in");
    expect(await profiles()).toHaveLength(0);
  });

  it("stores the profile under the derived user id", async () => {
    const { alice, aliceId, profiles } = await setup();
    await alice.mutation(api.users.upsertProfile, { displayName: "Alice" });
    const rows = await profiles();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: aliceId, displayName: "Alice" });
  });

  it.each(["a", " ", "x".repeat(25)])(
    "rejects display name %j before any write",
    async (displayName) => {
      const { alice, profiles } = await setup();
      await expect(
        alice.mutation(api.users.upsertProfile, { displayName }),
      ).rejects.toThrow(/Display name/);
      expect(await profiles()).toHaveLength(0);
    },
  );

  it("accepts the 2 and 24 character boundaries", async () => {
    const { alice, bob } = await setup();
    await alice.mutation(api.users.upsertProfile, { displayName: "ab" });
    await bob.mutation(api.users.upsertProfile, { displayName: "x".repeat(24) });
    expect((await alice.query(api.users.me, {}))?.displayName).toBe("ab");
    expect((await bob.query(api.users.me, {}))?.displayName).toHaveLength(24);
  });

  it("never updates another user's profile", async () => {
    const { alice, bob, aliceId, bobId, profiles } = await setup();
    await alice.mutation(api.users.upsertProfile, {
      displayName: "Alice",
      walletAddress: "AW",
    });
    await bob.mutation(api.users.upsertProfile, { displayName: "Bobby" });
    await bob.mutation(api.users.upsertProfile, { displayName: "Robert" });
    const rows = await profiles();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.userId === aliceId)).toMatchObject({
      displayName: "Alice",
      walletAddress: "AW",
    });
    expect(rows.find((r) => r.userId === bobId)).toMatchObject({
      displayName: "Robert",
    });
    expect(await bob.query(api.users.me, {})).toStrictEqual({
      userId: bobId,
      displayName: "Robert",
    });
  });

  it("preserves the optional wallet when omitted or blank", async () => {
    const { alice } = await setup();
    await alice.mutation(api.users.upsertProfile, {
      displayName: "Alice",
      walletAddress: "WALLET1",
    });
    await alice.mutation(api.users.upsertProfile, { displayName: "Alicia" });
    await alice.mutation(api.users.upsertProfile, {
      displayName: "Alicia",
      walletAddress: "   ",
    });
    expect(await alice.query(api.users.me, {})).toMatchObject({
      displayName: "Alicia",
      walletAddress: "WALLET1",
    });
  });
});
