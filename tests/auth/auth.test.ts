import { describe, expect, it } from "vitest";
import { requireUserId, upsertProfileCore, type ProfileDb } from "../../lib/profile";
import type { Id } from "../../convex/_generated/dataModel";

function recordingDb() {
  const calls: string[] = [];
  const inserted: Array<{ userId: Id<"users">; displayName: string }> = [];
  const db: ProfileDb = {
    async getProfileByUser() {
      calls.push("get");
      return null;
    },
    async insertProfile(row) {
      calls.push("insert");
      inserted.push(row);
      return "p1" as Id<"profiles">;
    },
    async patchProfile() {
      calls.push("patch");
    },
  };
  return { db, calls, inserted };
}

describe("signed-out rejection", () => {
  it("requireUserId rejects null identity", () => {
    expect(() => requireUserId(null)).toThrow("Not signed in");
  });
  it("upsert rejects before touching the database", async () => {
    const { db, calls } = recordingDb();
    await expect(
      upsertProfileCore(db, null, { displayName: "Sam" }),
    ).rejects.toThrow("Not signed in");
    expect(calls).toEqual([]);
  });
});

describe("authenticated identity", () => {
  it("writes the profile under the derived user id", async () => {
    const { db, calls, inserted } = recordingDb();
    const id = await upsertProfileCore(db, "u9" as Id<"users">, { displayName: "Sam" });
    expect(id).toBe("p1");
    expect(inserted).toEqual([{ userId: "u9", displayName: "Sam" }]);
    expect(calls).toEqual(["get", "insert"]);
  });
  it("requireUserId passes the id through", () => {
    expect(requireUserId("u9" as Id<"users">)).toBe("u9");
  });
});
