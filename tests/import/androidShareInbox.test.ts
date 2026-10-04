// @vitest-environment node
// Synthetic tests for the page-side Android share inbox reader and adoption (T-13B). The store is an injected
// in-memory fake and the controller is the REAL ImageDraftFlow with fake backend calls. Images, titles and
// links are made up. Not an installed Android PWA, a real share sheet, a browser render of the panel, or a
// phone; the consent/sign-in panel (components/deals/AndroidShareImport.tsx) is covered only by typecheck and
// lint plus the logic below, not by a rendered test.
import { describe, expect, it, vi } from "vitest";
import {
  adoptShare,
  forgetPendingShare,
  isShareErrorCode,
  parseShareQuery,
  PENDING_SHARE_KEY,
  readShare,
  recallPendingShare,
  registerShareWorker,
  rememberPendingShare,
  SHARE_ERROR_CODES,
  SHARE_ERROR_COPY,
  shareContext,
  SHARE_TTL_MS,
  type LoadedShare,
  type ShareStore,
} from "../../lib/androidShareInbox";
import { ImageDraftFlow, type FlowDeps } from "../../lib/imageDraftFlow";

const ID = "0123456789abcdef0123456789abcdef";
const NOW = 1_800_000_000_000;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const png = (size = 300) => new Blob([Uint8Array.from({ length: size }, (_, i) => PNG[i] ?? 9)], { type: "image/png" });

function record(over: Record<string, unknown> = {}) {
  return { v: 1, id: ID, createdAt: NOW, expiresAt: NOW + SHARE_TTL_MS, mime: "image/png", image: png(), title: "Synthetic title", text: "synthetic text", url: "https://example.invalid/p", ...over };
}
function memoryStore(initial: Record<string, unknown> = {}) {
  const rows = new Map(Object.entries(initial));
  const store: ShareStore & { rows: Map<string, unknown>; fail: boolean } = {
    rows,
    fail: false,
    get: vi.fn(async (id: string) => {
      if (store.fail) throw new Error("store down");
      return rows.get(id);
    }),
    delete: vi.fn(async (id: string) => {
      if (store.fail) throw new Error("store down");
      rows.delete(id);
    }),
    clear: vi.fn(async () => rows.clear()),
  };
  return store;
}
async function loaded(over: Record<string, unknown> = {}): Promise<LoadedShare> {
  const out = await readShare(memoryStore({ [ID]: record(over) }), ID, NOW);
  if (!out.ok) throw new Error(`fixture invalid: ${out.reason}`);
  return out.share;
}

function makeFlow(over: Partial<FlowDeps> = {}) {
  const deps = {
    prepareImage: vi.fn(async () => ({ name: "deal.jpg", type: "image/jpeg", size: 100 })),
    getToken: vi.fn(async () => "t"),
    generateUploadUrl: vi.fn(async () => "https://example.invalid/up"),
    upload: vi.fn(async () => ({ ok: true as const, storageId: "storage_id_1_abcdefgh" })),
    extract: vi.fn(async () => ({})),
    createDeal: vi.fn(async () => "deal_id_abcdefghij"),
    ...over,
  };
  return { deps, flow: new ImageDraftFlow(deps as unknown as FlowDeps) };
}

// ============================================================ query parsing

describe("parseShareQuery", () => {
  it("accepts exactly one opaque id or one known error code", () => {
    expect(parseShareQuery("")).toEqual({ kind: "none" });
    expect(parseShareQuery("?preview=1")).toEqual({ kind: "none" });
    expect(parseShareQuery(`?share=${ID}`)).toEqual({ kind: "id", id: ID });
    expect(parseShareQuery("?share_error=no_image")).toEqual({ kind: "error", code: "no_image" });
    for (const code of SHARE_ERROR_CODES) expect(parseShareQuery(`share_error=${code}`)).toEqual({ kind: "error", code });
  });

  it.each([
    ["short id", "share=abc"],
    ["uppercase id", `share=${ID.toUpperCase()}`],
    ["path-like id", "share=../../x"],
    ["empty id", "share="],
    ["long id", `share=${ID}0`],
    ["repeated share", `share=${ID}&share=${ID}`],
    ["unknown error code", "share_error=boom"],
    ["both share and error", `share=${ID}&share_error=no_image`],
    ["secret token alongside", `share=${ID}&token=abc`],
    ["private text alongside", `share=${ID}&text=hello`],
    ["extra param with error", "share_error=no_image&title=x"],
  ])("rejects %s", (_name, query) => expect(parseShareQuery(query)).toEqual({ kind: "invalid" }));

  it("every error code has fixed copy that never echoes input", () => {
    for (const code of SHARE_ERROR_CODES) expect(SHARE_ERROR_COPY[code].length).toBeGreaterThan(10);
    expect(isShareErrorCode("storage")).toBe(true);
    expect(isShareErrorCode("<script>")).toBe(false);
    expect(isShareErrorCode(undefined)).toBe(false);
  });
});

// ================================================================== reading

describe("readShare", () => {
  it("returns a bounded, verified image with its text", async () => {
    const out = await readShare(memoryStore({ [ID]: record() }), ID, NOW);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.share).toMatchObject({ id: ID, title: "Synthetic title", text: "synthetic text", url: "https://example.invalid/p" });
    expect(out.share.file).toMatchObject({ name: "shared-image.png", type: "image/png" });
  });

  it("uses no store call for a bad id and reports missing/unavailable honestly", async () => {
    const store = memoryStore();
    expect(await readShare(store, "nope", NOW)).toEqual({ ok: false, reason: "invalid_id" });
    expect(store.get).not.toHaveBeenCalled();
    expect(await readShare(store, ID, NOW)).toEqual({ ok: false, reason: "missing" });
    store.fail = true;
    expect(await readShare(store, ID, NOW)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("refuses and deletes expired records (TTL 24 h)", async () => {
    const store = memoryStore({ [ID]: record() });
    expect(await readShare(store, ID, NOW + SHARE_TTL_MS - 1)).toMatchObject({ ok: true });
    expect(await readShare(store, ID, NOW + SHARE_TTL_MS)).toEqual({ ok: false, reason: "expired" });
    expect(store.rows.has(ID)).toBe(false);
  });

  const corrupt: [string, Record<string, unknown>][] = [
    ["wrong version", { v: 2 }],
    ["wrong id", { id: "f".repeat(32) }],
    ["unknown mime", { mime: "image/gif" }],
    ["mime does not match the bytes", { mime: "image/jpeg" }],
    ["empty image", { image: new Blob([], { type: "image/png" }) }],
    ["oversize image", { image: png(5 * 1024 * 1024 + 1) }],
    ["not a blob", { image: "bytes" }],
    ["title too long", { title: "x".repeat(301) }],
    ["text too long", { text: "x".repeat(5001) }],
    ["non-string text", { text: 5 }],
    ["bad link scheme", { url: "javascript:alert(1)" }],
    ["link with credentials", { url: "https://u:p@example.invalid/" }],
    ["lifetime longer than the TTL", { expiresAt: NOW + SHARE_TTL_MS * 10 }],
    ["missing timestamps", { createdAt: "now" }],
  ];
  it.each(corrupt)("refuses and deletes a corrupt record: %s", async (_name, over) => {
    const store = memoryStore({ [ID]: record(over) });
    expect(await readShare(store, ID, NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(store.rows.has(ID)).toBe(false);
  });

  it("refuses a non-object record", async () => {
    expect(await readShare(memoryStore({ [ID]: "string" }), ID, NOW)).toEqual({ ok: false, reason: "invalid" });
  });
});

// ================================================================== context

describe("shareContext", () => {
  it("maps title to caption, keeps text and uses the link as provenance only", () => {
    expect(shareContext({ title: " T ", text: " hello ", url: " https://example.invalid/p " })).toEqual({ caption: "T", text: "hello", provenanceUrl: "https://example.invalid/p" });
    expect(shareContext({ title: "", text: "", url: "" })).toEqual({});
  });
  it("treats a text that is exactly one valid link as provenance, not text", () => {
    expect(shareContext({ title: "", text: "https://example.invalid/reel/1", url: "" })).toEqual({ provenanceUrl: "https://example.invalid/reel/1" });
    expect(shareContext({ title: "", text: "look https://example.invalid/x", url: "" })).toEqual({ text: "look https://example.invalid/x" });
    expect(shareContext({ title: "", text: "https://example.invalid/a", url: "https://example.invalid/b" })).toEqual({ text: "https://example.invalid/a", provenanceUrl: "https://example.invalid/b" });
  });
});

// ================================================================= adoption

describe("adoptShare with the real controller", () => {
  it("adopts the image and context without uploading, analyzing or publishing", async () => {
    const { flow, deps } = makeFlow();
    flow.dispatch("form-1", { type: "SET_FIELD", field: "restaurant", value: "My Typed Place" });
    const result = adoptShare(flow, await loaded());
    expect(result).toEqual({ ok: true, applied: { caption: true, text: true, provenanceUrl: true } });
    const snap = flow.getSnapshot();
    expect(snap.source.file?.type).toBe("image/png");
    expect(snap.source).toMatchObject({ caption: "Synthetic title", text: "synthetic text", provenanceUrl: "https://example.invalid/p" });
    expect(snap.phase).toBe("idle");
    expect(snap.forms[0].draft.fields.restaurant.value).toBe("My Typed Place"); // forms untouched
    for (const fn of [deps.prepareImage, deps.getToken, deps.generateUploadUrl, deps.upload, deps.extract, deps.createDeal]) expect(fn).not.toHaveBeenCalled();
  });

  it("manual context wins: only empty fields are filled", async () => {
    const { flow } = makeFlow();
    flow.setContext({ caption: "my caption", provenanceUrl: "https://example.invalid/mine" });
    expect(adoptShare(flow, await loaded())).toEqual({ ok: true, applied: { caption: false, text: true, provenanceUrl: false } });
    expect(flow.getSnapshot().source).toMatchObject({ caption: "my caption", text: "synthetic text", provenanceUrl: "https://example.invalid/mine" });
  });

  it("never replaces an image or recording the user already chose", async () => {
    const { flow } = makeFlow();
    const mine = new File([new Uint8Array(10)], "mine.png", { type: "image/png" });
    flow.selectFile(mine);
    flow.setContext({ text: "mine" });
    expect(adoptShare(flow, await loaded())).toEqual({ ok: false, reason: "source_exists" });
    expect(flow.getSnapshot().source.file).toBe(mine);
    expect(flow.getSnapshot().source.text).toBe("mine");

    const other = makeFlow();
    other.flow.selectRecording(new File([new Uint8Array(10)], "clip.mov", { type: "video/quicktime" }));
    expect(adoptShare(other.flow, await loaded())).toEqual({ ok: false, reason: "source_exists" });
    expect(other.flow.getSnapshot().source.recording).not.toBeNull();
  });

  it("does not interrupt a run in flight", async () => {
    const never = new Promise<never>(() => undefined);
    const { flow } = makeFlow({ prepareImage: vi.fn(() => never) as unknown as FlowDeps["prepareImage"] });
    const mine = new File([new Uint8Array(10)], "mine.png", { type: "image/png" });
    flow.selectFile(mine);
    void flow.analyze();
    expect(flow.getSnapshot().phase).toBe("preparing");
    expect(adoptShare(flow, await loaded())).toEqual({ ok: false, reason: "busy" });
    expect(flow.getSnapshot().source.file).toBe(mine);
  });

  it("is rejected, applying no context, when the controller refuses the file", async () => {
    const { flow } = makeFlow();
    const share = { ...(await loaded()), file: new File([new Uint8Array(10)], "x.gif", { type: "image/gif" }) };
    expect(adoptShare(flow, share)).toEqual({ ok: false, reason: "rejected" });
    expect(flow.getSnapshot().source.file).toBeNull();
    expect(flow.getSnapshot().source.caption).toBe("");
  });

  it("later renders and repeated taps never overwrite later edits", async () => {
    const { flow } = makeFlow();
    const share = await loaded();
    expect(adoptShare(flow, share).ok).toBe(true);
    flow.setContext({ caption: "edited after adoption" });
    flow.dispatch("form-1", { type: "SET_FIELD", field: "restaurant", value: "Typed Later" });
    expect(adoptShare(flow, share)).toEqual({ ok: false, reason: "source_exists" }); // a stale second tap changes nothing
    expect(flow.getSnapshot().source.caption).toBe("edited after adoption");
    expect(flow.getSnapshot().forms[0].draft.fields.restaurant.value).toBe("Typed Later");
  });

  it("a user who cleared the adopted image can adopt another without losing form edits", async () => {
    const { flow } = makeFlow();
    flow.dispatch("form-1", { type: "SET_FIELD", field: "restaurant", value: "Keep Me" });
    expect(adoptShare(flow, await loaded()).ok).toBe(true);
    flow.selectFile(null);
    expect(adoptShare(flow, await loaded({ title: "" })).ok).toBe(true);
    expect(flow.getSnapshot().forms[0].draft.fields.restaurant.value).toBe("Keep Me");
  });
});

// ============================================================ pending id (sign-in)

describe("remembered pending share id", () => {
  const memoryStorage = () => {
    const data = new Map<string, string>();
    return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
  };

  it("keeps only the opaque id, validates it on the way out and forgets it", () => {
    const storage = memoryStorage();
    rememberPendingShare(storage, ID);
    expect([...storage.data.entries()]).toEqual([[PENDING_SHARE_KEY, ID]]);
    expect(recallPendingShare(storage)).toBe(ID);
    forgetPendingShare(storage);
    expect(recallPendingShare(storage)).toBeNull();
  });

  it("refuses to remember or recall anything that is not a share id", () => {
    const storage = memoryStorage();
    rememberPendingShare(storage, "token=secret");
    expect(storage.data.size).toBe(0);
    storage.data.set(PENDING_SHARE_KEY, "https://evil.example/?secret");
    expect(recallPendingShare(storage)).toBeNull();
  });

  it("survives blocked storage", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(() => rememberPendingShare(blocked, ID)).not.toThrow();
    expect(recallPendingShare(blocked)).toBeNull();
    expect(() => forgetPendingShare(blocked)).not.toThrow();
    expect(recallPendingShare(null)).toBeNull();
    expect(() => rememberPendingShare(undefined, ID)).not.toThrow();
  });
});

// ============================================================== registration

describe("registerShareWorker", () => {
  it("registers /sw.js at the root scope, bypassing the HTTP cache for the worker script", async () => {
    const register = vi.fn(async () => ({}));
    expect(await registerShareWorker({ serviceWorker: { register } })).toBe("registered");
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  });

  it("does nothing where service workers do not exist (WKWebView, old browsers, SSR)", async () => {
    expect(await registerShareWorker(undefined)).toBe("unsupported");
    expect(await registerShareWorker({})).toBe("unsupported");
    expect(await registerShareWorker({ serviceWorker: { register: "nope" as never } })).toBe("unsupported");
  });

  it("a failed registration never throws", async () => {
    const register = vi.fn(async () => {
      throw new Error("SecurityError");
    });
    expect(await registerShareWorker({ serviceWorker: { register } })).toBe("failed");
  });
});
