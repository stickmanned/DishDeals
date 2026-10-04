// Pure draft-version rules shared by convex/reels.ts and the Reel editor.
// Counters are safe nonnegative integers; legacy rows without the optional
// fields read as revision 0 / not edited. Nothing here repairs a bad value.

export const isSafeCount = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

export type DraftVersionFields = {
  generation: number;
  draftRevision?: number;
  draftEdited?: boolean;
};

export type DraftVersion = { generation: number; revision: number; edited: boolean };

/** Read a stored version; `null` means a stored counter is corrupt. */
export function readDraftVersion(item: DraftVersionFields): DraftVersion | null {
  const revision = item.draftRevision ?? 0;
  const edited = item.draftEdited ?? false;
  if (!isSafeCount(item.generation) || !isSafeCount(revision) || typeof edited !== "boolean") return null;
  return { generation: item.generation, revision, edited };
}

/**
 * n + 1, or `null` when n is not a safe nonnegative integer (corrupt: never
 * repaired by incrementing) or the result would leave the safe integer range.
 */
export const bump = (n: unknown): number | null =>
  isSafeCount(n) && n < Number.MAX_SAFE_INTEGER ? n + 1 : null;

/** Draft size limit, measured in UTF-8 bytes (not JavaScript string length). */
export const MAX_DRAFT_BYTES = 60000;
export const utf8ByteLength = (text: string): number => new TextEncoder().encode(text).length;
export const withinDraftLimit = (text: string): boolean => utf8ByteLength(text) <= MAX_DRAFT_BYTES;

export type SaveCheck =
  | { ok: true; version: DraftVersion; nextRevision: number }
  | { ok: false; reason: "invalid_expected" | "corrupt" | "overflow" | "stale_generation" | "stale_revision" };

/** Optimistic-concurrency check for a user save. Order: input, stored data, staleness. */
export function checkSave(
  item: DraftVersionFields,
  expected: { generation: unknown; revision: unknown },
): SaveCheck {
  if (!isSafeCount(expected.generation) || !isSafeCount(expected.revision)) {
    return { ok: false, reason: "invalid_expected" };
  }
  const version = readDraftVersion(item);
  if (!version) return { ok: false, reason: "corrupt" };
  if (expected.generation !== version.generation) return { ok: false, reason: "stale_generation" };
  if (expected.revision !== version.revision) return { ok: false, reason: "stale_revision" };
  const nextRevision = bump(version.revision);
  if (nextRevision === null) return { ok: false, reason: "overflow" };
  return { ok: true, version, nextRevision };
}

export type FinishPlan =
  | { ok: true; draftJson: string | undefined; draftRevision: number; draftEdited: boolean; replacedDefault: boolean }
  | { ok: false; reason: "corrupt" | "overflow" };

/**
 * What a completed model extraction does to the private draft. A user-edited
 * draft is retained untouched. An unedited (model-default) draft is replaced
 * and the revision advances so stale editors can no longer overwrite it.
 */
export function planFinish(
  item: DraftVersionFields & { draftJson?: string },
  extractionDraftsJson: string,
): FinishPlan {
  const version = readDraftVersion(item);
  if (!version) return { ok: false, reason: "corrupt" };
  if (version.edited && item.draftJson !== undefined) {
    return { ok: true, draftJson: item.draftJson, draftRevision: version.revision, draftEdited: true, replacedDefault: false };
  }
  const next = bump(version.revision);
  if (next === null) return { ok: false, reason: "overflow" };
  return { ok: true, draftJson: extractionDraftsJson, draftRevision: next, draftEdited: false, replacedDefault: true };
}

/** Editor side: does the server version still match what this editor loaded or last saved? */
export function versionStatus(
  expected: { generation: number; revision: number },
  server: { generation: number; draftRevision?: number },
): "current" | "changed" {
  return expected.generation === server.generation && expected.revision === (server.draftRevision ?? 0)
    ? "current"
    : "changed";
}

/**
 * Version this editor expects after its OWN successful save (never from
 * props). `null` if the current expectation is invalid or would overflow, in
 * which case the caller must not guess a version.
 */
export function afterOwnSave(expected: { generation: number; revision: number }): { generation: number; revision: number } | null {
  const revision = bump(expected.revision);
  if (!isSafeCount(expected.generation) || revision === null) return null;
  return { generation: expected.generation, revision };
}

export const SAVE_ERRORS = {
  invalid_expected: "The draft version is invalid.",
  corrupt: "This draft's saved version is corrupt.",
  overflow: "This draft cannot be saved again.",
  stale_generation: "This draft was changed by another retry or save. Reload before saving.",
  stale_revision: "This draft was changed by another save. Reload before saving.",
} as const;
