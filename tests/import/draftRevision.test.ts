// Pure rules only (no Convex, no React). Synthetic inputs.
import { describe, expect, it } from "vitest";
import {
  MAX_DRAFT_BYTES, afterOwnSave, bump, checkSave, isSafeCount, planFinish, readDraftVersion, utf8ByteLength, versionStatus, withinDraftLimit,
} from "../../lib/reels/draftRevision";

const MAX = Number.MAX_SAFE_INTEGER;

describe("isSafeCount / bump", () => {
  it.each([0, 1, MAX])("accepts %s", n => expect(isSafeCount(n)).toBe(true));
  it.each([-1, 1.5, NaN, Infinity, MAX + 1, "1", null, undefined])("rejects %s", n => expect(isSafeCount(n)).toBe(false));
  it("bump refuses to leave the safe range", () => {
    expect(bump(0)).toBe(1);
    expect(bump(MAX - 1)).toBe(MAX);
    expect(bump(MAX)).toBeNull();
  });
  it.each([-1, -0.5, 0.5, 1.5, NaN, Infinity, -Infinity, MAX + 2, "1", null, undefined])("bump never increments the invalid counter %s", n => {
    expect(bump(n)).toBeNull();
  });
});

describe("readDraftVersion", () => {
  it("legacy rows default to revision 0, not edited", () => {
    expect(readDraftVersion({ generation: 3 })).toEqual({ generation: 3, revision: 0, edited: false });
  });
  it("reads stored fields", () => {
    expect(readDraftVersion({ generation: 2, draftRevision: 5, draftEdited: true })).toEqual({ generation: 2, revision: 5, edited: true });
  });
  it.each([-1, 0.5, NaN, Infinity, MAX + 2])("flags corrupt revision %s", r => expect(readDraftVersion({ generation: 1, draftRevision: r })).toBeNull());
  it.each([-1, 1.5, NaN])("flags corrupt generation %s", g => expect(readDraftVersion({ generation: g })).toBeNull());
  it("flags a non-boolean edited flag", () => expect(readDraftVersion({ generation: 1, draftEdited: "yes" as never })).toBeNull());
});

describe("checkSave", () => {
  const item = { generation: 2, draftRevision: 4 };
  it("accepts the exact current version and returns the next revision", () => {
    expect(checkSave(item, { generation: 2, revision: 4 })).toMatchObject({ ok: true, nextRevision: 5 });
    expect(checkSave({ generation: 1 }, { generation: 1, revision: 0 })).toMatchObject({ ok: true, nextRevision: 1 });
  });
  it("rejects stale revision and generation separately", () => {
    expect(checkSave(item, { generation: 2, revision: 3 })).toEqual({ ok: false, reason: "stale_revision" });
    expect(checkSave(item, { generation: 1, revision: 4 })).toEqual({ ok: false, reason: "stale_generation" });
    expect(checkSave(item, { generation: 3, revision: 5 })).toEqual({ ok: false, reason: "stale_generation" });
  });
  it.each([-1, 1.5, NaN, Infinity, "2", null, undefined])("rejects invalid expected %s", bad => {
    expect(checkSave(item, { generation: bad, revision: 4 })).toEqual({ ok: false, reason: "invalid_expected" });
    expect(checkSave(item, { generation: 2, revision: bad })).toEqual({ ok: false, reason: "invalid_expected" });
  });
  it("rejects corrupt stored counters before comparing", () => {
    expect(checkSave({ generation: 2, draftRevision: -1 }, { generation: 2, revision: 0 })).toEqual({ ok: false, reason: "corrupt" });
    expect(checkSave({ generation: 2, draftRevision: NaN }, { generation: 2, revision: 0 })).toEqual({ ok: false, reason: "corrupt" });
  });
  it("rejects overflow at MAX_SAFE_INTEGER", () => {
    expect(checkSave({ generation: 1, draftRevision: MAX }, { generation: 1, revision: MAX })).toEqual({ ok: false, reason: "overflow" });
    expect(checkSave({ generation: 1, draftRevision: MAX - 1 }, { generation: 1, revision: MAX - 1 })).toMatchObject({ ok: true, nextRevision: MAX });
  });
});

describe("planFinish", () => {
  const fresh = '[{"model":"default"}]';
  it("replaces an unedited default and advances the revision", () => {
    expect(planFinish({ generation: 1, draftJson: '[{"old":1}]', draftRevision: 2 }, fresh)).toEqual({
      ok: true, draftJson: fresh, draftRevision: 3, draftEdited: false, replacedDefault: true,
    });
    expect(planFinish({ generation: 1 }, fresh)).toMatchObject({ draftRevision: 1, replacedDefault: true });
  });
  it("retains an edited draft untouched (no revision change)", () => {
    expect(planFinish({ generation: 2, draftJson: '[{"mine":1}]', draftRevision: 4, draftEdited: true }, fresh)).toEqual({
      ok: true, draftJson: '[{"mine":1}]', draftRevision: 4, draftEdited: true, replacedDefault: false,
    });
  });
  it("rejects corrupt counters and overflow instead of repairing", () => {
    expect(planFinish({ generation: 1, draftRevision: -1 }, fresh)).toEqual({ ok: false, reason: "corrupt" });
    expect(planFinish({ generation: 1, draftRevision: MAX }, fresh)).toEqual({ ok: false, reason: "overflow" });
    expect(planFinish({ generation: 1, draftRevision: MAX, draftEdited: true, draftJson: "[]" }, fresh)).toMatchObject({ ok: true, draftRevision: MAX });
  });
});

describe("editor version helpers", () => {
  it("versionStatus compares generation and revision (legacy revision is 0)", () => {
    expect(versionStatus({ generation: 1, revision: 0 }, { generation: 1 })).toBe("current");
    expect(versionStatus({ generation: 1, revision: 2 }, { generation: 1, draftRevision: 2 })).toBe("current");
    expect(versionStatus({ generation: 1, revision: 2 }, { generation: 1, draftRevision: 3 })).toBe("changed");
    expect(versionStatus({ generation: 1, revision: 2 }, { generation: 2, draftRevision: 2 })).toBe("changed");
  });
  it("advances only the revision after an own save", () => {
    expect(afterOwnSave({ generation: 4, revision: 7 })).toEqual({ generation: 4, revision: 8 });
    expect(afterOwnSave({ generation: 0, revision: 0 })).toEqual({ generation: 0, revision: 1 });
    expect(afterOwnSave({ generation: 1, revision: MAX - 1 })).toEqual({ generation: 1, revision: MAX });
  });
  it("afterOwnSave returns null instead of guessing on overflow or invalid input", () => {
    expect(afterOwnSave({ generation: 1, revision: MAX })).toBeNull();
    expect(afterOwnSave({ generation: 1, revision: -1 })).toBeNull();
    expect(afterOwnSave({ generation: 1, revision: 1.5 })).toBeNull();
    expect(afterOwnSave({ generation: 1, revision: NaN })).toBeNull();
    expect(afterOwnSave({ generation: -1, revision: 1 })).toBeNull();
    expect(afterOwnSave({ generation: NaN, revision: 1 })).toBeNull();
  });
});

describe("draft size limit is measured in UTF-8 bytes", () => {
  it("counts multi-byte characters by bytes, not string length", () => {
    expect(utf8ByteLength("a")).toBe(1);
    expect(utf8ByteLength("é")).toBe(2);
    expect(utf8ByteLength("€")).toBe(3);
    expect(utf8ByteLength("😀")).toBe(4);
  });
  it("accepts exactly the limit and rejects one byte more", () => {
    expect(withinDraftLimit("é".repeat(MAX_DRAFT_BYTES / 2))).toBe(true);
    expect(withinDraftLimit("é".repeat(MAX_DRAFT_BYTES / 2) + "a")).toBe(false);
    expect(withinDraftLimit("a".repeat(MAX_DRAFT_BYTES))).toBe(true);
  });
  it("a string far under the length limit can exceed the byte limit", () => {
    const text = "€".repeat(25000); // 25,000 characters, 75,000 bytes
    expect(text.length).toBeLessThan(MAX_DRAFT_BYTES);
    expect(withinDraftLimit(text)).toBe(false);
  });
});
