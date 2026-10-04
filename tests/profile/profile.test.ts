import { describe, expect, it } from "vitest";
import {
  upsertProfileCore,
  validateDisplayName,
  type ProfileDb,
  type ProfileRow,
} from "../../lib/profile";
import type { Id } from "../../convex/_generated/dataModel";

const uid = "user1" as Id<"users">;

function fakeDb() {
  const rows: ProfileRow[] = [];
  const db: ProfileDb = {
    async getProfileByUser(id) {
      return rows.find((r) => r.userId === id) ?? null;
    },
    async insertProfile(row) {
      const _id = `p${rows.length + 1}` as Id<"profiles">;
      rows.push({ _id, ...row });
      return _id;
    },
    async patchProfile(id, fields) {
      Object.assign(rows.find((r) => r._id === id)!, fields);
    },
  };
  return { db, rows };
}

describe("display name boundaries", () => {
  it.each(["a", "", " a ", "x".repeat(25)])("rejects %j", (n) => {
    expect(() => validateDisplayName(n)).toThrow();
  });
  it.each(["ab", "x".repeat(24), "  ab  "])("accepts %j", (n) => {
    expect(validateDisplayName(n)).toBe(n.trim());
  });
});

describe("upsertProfileCore wallet handling", () => {
  it("creates without a wallet", async () => {
    const { db, rows } = fakeDb();
    await upsertProfileCore(db, uid, { displayName: "Sam" });
    expect(rows).toHaveLength(1);
    expect(rows[0].walletAddress).toBeUndefined();
  });
  it("preserves the wallet when omitted on update", async () => {
    const { db, rows } = fakeDb();
    await upsertProfileCore(db, uid, { displayName: "Sam", walletAddress: "WALLET1" });
    await upsertProfileCore(db, uid, { displayName: "Samuel" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ displayName: "Samuel", walletAddress: "WALLET1" });
  });
  it("replaces the wallet when provided and trims blank to omitted", async () => {
    const { db, rows } = fakeDb();
    await upsertProfileCore(db, uid, { displayName: "Sam", walletAddress: "W1" });
    await upsertProfileCore(db, uid, { displayName: "Sam", walletAddress: "   " });
    expect(rows[0].walletAddress).toBe("W1");
    await upsertProfileCore(db, uid, { displayName: "Sam", walletAddress: "W2" });
    expect(rows[0].walletAddress).toBe("W2");
  });
  it("does not write on invalid name", async () => {
    const { db, rows } = fakeDb();
    await expect(upsertProfileCore(db, uid, { displayName: "x" })).rejects.toThrow();
    expect(rows).toHaveLength(0);
  });
});
