// Synthetic replay tests for the canonical screenshot/flyer controller (T-07C).
// Every backend call is an injected fake: no Convex deployment, browser, picker, provider, network or phone.
import { describe, expect, it, vi, type Mock } from "vitest";
import {
  boundedJpegUpload,
  checkSourceFile,
  classifyExtractError,
  GENERIC_PUBLISH_FAILURE,
  publishMessage,
  savedDealMapHref,
  sessionNotice,
  ImageDraftFlow,
  isFormEdited,
  MAX_CAPTION_CHARS,
  MAX_FORMS,
  type FlowDeps,
} from "../../lib/imageDraftFlow";
import type { ExtractOutcome } from "../../lib/extractCore";
import type { ImageUploadOutcome } from "../../lib/dealImageUpload";
import type { DraftFieldKey } from "../../lib/dealDraft";

// ----------------------------------------------------------------- fixtures

const file = (name = "menu.png", type = "image/png", size = 2048) => ({ name, type, size }) as unknown as File;
const prepared = () => ({ name: "deal.jpg", type: "image/jpeg", size: 1000 }) as unknown as Blob & { name: string; type: string; size: number };
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const aDeal = (over: Record<string, unknown> = {}) => ({
  restaurant: "Ramen Danbo",
  address: "1333 Robson St, Vancouver",
  dealText: "Lunch combo",
  priceCad: 12.5,
  validDays: ["mon", "tue"],
  validStart: "11:00",
  validEnd: "15:00",
  expiresOn: "2026-12-31",
  conditions: ["Dine-in only"],
  confidence: { restaurant: 0.91, priceCad: 0.8, hours: 0.6, expiresOn: 0.3 },
  ...over,
});

const anOutcome = (over: Partial<ExtractOutcome> = {}, deals: unknown[] = [aDeal()]): ExtractOutcome =>
  ({
    result: { isDeal: deals.length > 0, deals },
    manualReview: [],
    requiresBlockingReview: false,
    model: "synthetic-model",
    ...over,
  }) as unknown as ExtractOutcome;

const convexError = (data: unknown) => Object.assign(new Error("[Request ID: x] Server Error provider body sk-secret"), { data });

function makeDeps(over: Partial<FlowDeps> = {}) {
  let n = 0;
  const calls: string[] = [];
  const deps = {
    prepareImage: vi.fn(async () => {
      calls.push("prepare");
      return prepared();
    }),
    getToken: vi.fn(async () => {
      calls.push("token");
      return "synthetic-token";
    }),
    generateUploadUrl: vi.fn(async () => {
      calls.push("url");
      return "https://example.convex.site/deal-image";
    }),
    upload: vi.fn(async (): Promise<ImageUploadOutcome> => {
      calls.push("upload");
      n += 1;
      return { ok: true, storageId: `storage_id_${n}_abcdefgh` };
    }),
    extract: vi.fn(async (): Promise<unknown> => {
      calls.push("extract");
      return anOutcome();
    }),
    createDeal: vi.fn(async (): Promise<unknown> => {
      calls.push("create");
      return "deal_id_abcdefghij";
    }),
    ...over,
  };
  return { deps: deps as unknown as { [K in keyof FlowDeps]-?: Mock<NonNullable<FlowDeps[K]>> }, calls };
}

function reviewAll(flow: ImageDraftFlow, key: string) {
  flow.dispatch(key, { type: "ACCEPT_ALL_SUGGESTIONS" });
  for (const field of ["restaurant", "address", "dealText", "priceCad", "validDays", "validStart", "validEnd", "expiresOn", "conditions"] as DraftFieldKey[]) {
    flow.dispatch(key, { type: "REVIEW_FIELD", field });
  }
  flow.dispatch(key, { type: "CONFIRM_LOCATION", lat: 49.28, lng: -123.12 });
}

const form = (flow: ImageDraftFlow, key: string) => flow.getSnapshot().forms.find((f) => f.key === key)!;

async function analyzed(over: Partial<FlowDeps> = {}, outcome: unknown = anOutcome()) {
  const made = makeDeps({ extract: vi.fn(async () => outcome), ...over });
  const flow = new ImageDraftFlow(made.deps);
  flow.selectFile(file());
  await flow.analyze();
  return { ...made, flow };
}

// ------------------------------------------------------------ file helpers

describe("checkSourceFile", () => {
  it.each([
    ["image/jpeg", "a.jpg"],
    ["image/png", "a.png"],
    ["image/webp", "a.webp"],
    ["", "shot.PNG"],
    ["", "shot.jpeg"],
  ])("accepts %s %s", (type, name) => expect(checkSourceFile({ name, type, size: 10 }).ok).toBe(true));

  it("rejects HEIC/HEIF honestly by type or extension", () => {
    for (const f of [{ name: "a.heic", type: "image/heic" }, { name: "a.HEIF", type: "" }, { name: "a.jpg", type: "image/heif" }]) {
      const r = checkSourceFile({ ...f, size: 10 });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe("heic");
        expect(r.message).toMatch(/HEIC/);
      }
    }
  });

  it("rejects empty, oversize, gif and unknown", () => {
    expect(checkSourceFile({ name: "a.png", type: "image/png", size: 0 })).toMatchObject({ ok: false, code: "empty" });
    expect(checkSourceFile({ name: "a.png", type: "image/png", size: 21 * 1024 * 1024 })).toMatchObject({ ok: false, code: "too_large" });
    expect(checkSourceFile({ name: "a.gif", type: "image/gif", size: 10 })).toMatchObject({ ok: false, code: "unsupported" });
    expect(checkSourceFile({ name: "a.txt", type: "", size: 10 })).toMatchObject({ ok: false, code: "unsupported" });
  });
});

describe("boundedJpegUpload", () => {
  it("returns a named JPEG file within the 5 MiB upload bound", () => {
    const out = boundedJpegUpload(new Blob([new Uint8Array(100)], { type: "image/jpeg" }));
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("deal.jpg");
    expect(out.size).toBe(100);
  });

  it("rejects non-JPEG, empty and oversize output", () => {
    expect(() => boundedJpegUpload(new Blob([new Uint8Array(10)], { type: "image/png" }))).toThrow();
    expect(() => boundedJpegUpload(new Blob([], { type: "image/jpeg" }))).toThrow();
    expect(() => boundedJpegUpload(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/jpeg" }))).toThrow();
  });
});

describe("adapters", () => {
  it("setDeps swaps in fresh adapters for the next run", async () => {
    const first = makeDeps();
    const second = makeDeps();
    const flow = new ImageDraftFlow(first.deps);
    flow.selectFile(file());
    flow.setDeps(second.deps);
    await flow.analyze();
    expect(first.deps.upload).not.toHaveBeenCalled();
    expect(second.deps.upload).toHaveBeenCalledTimes(1);
  });
});

describe("source selection", () => {
  it("a bad pick keeps the previous file and reports why; clearing resets", () => {
    const { deps } = makeDeps();
    const flow = new ImageDraftFlow(deps);
    const good = file("flyer.png");
    flow.selectFile(good);
    flow.selectFile(file("photo.heic", "image/heic"));
    const s = flow.getSnapshot().source;
    expect(s.file).toBe(good);
    expect(s.fileError).toMatch(/HEIC/);
    flow.selectFile(file("again.png"));
    expect(flow.getSnapshot().source.fileError).toBeNull();
    flow.selectFile(null);
    expect(flow.getSnapshot().source.file).toBeNull();
  });

  it("returns a stable snapshot until something changes and notifies subscribers", () => {
    const { deps } = makeDeps();
    const flow = new ImageDraftFlow(deps);
    const a = flow.getSnapshot();
    expect(flow.getSnapshot()).toBe(a);
    const seen = vi.fn();
    const off = flow.subscribe(seen);
    flow.setContext({ caption: "hi" });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(flow.getSnapshot()).not.toBe(a);
    off();
    flow.setContext({ caption: "hi2" });
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

// --------------------------------------------------------- upload + extract

describe("analyze: owned upload then extraction", () => {
  it("prepares, uploads with the session token, then extracts with every context field and the receipt id", async () => {
    const { deps, calls } = makeDeps();
    const flow = new ImageDraftFlow(deps);
    flow.selectFile(file());
    flow.setContext({ caption: " cap ", text: " body ", provenanceUrl: "https://www.instagram.com/p/abc/", publishedAt: "2026-10-01" });
    await flow.analyze();
    expect(calls).toEqual(["prepare", "token", "url", "upload", "extract"]);
    expect(deps.upload).toHaveBeenCalledTimes(1);
    expect(deps.upload.mock.calls[0][0]).toMatchObject({ uploadUrl: "https://example.convex.site/deal-image", token: "synthetic-token" });
    expect(deps.extract).toHaveBeenLastCalledWith({
      imageIds: ["storage_id_1_abcdefgh"],
      caption: "cap",
      text: "body",
      provenanceUrl: "https://www.instagram.com/p/abc/",
      publishedAt: "2026-10-01",
    });
  });

  it("omits empty context, and a successful run yields an offer without touching the form", async () => {
    const { flow, deps } = await analyzed();
    expect(deps.extract).toHaveBeenCalledWith({ imageIds: ["storage_id_1_abcdefgh"] });
    const snap = flow.getSnapshot();
    expect(snap.phase).toBe("done");
    expect(snap.offers).toHaveLength(1);
    expect(snap.offers[0]).toMatchObject({ model: "synthetic-model", imageId: "storage_id_1_abcdefgh", noDeal: false, imageName: "menu.png" });
    // Nothing applied automatically: still one blank, unedited form with no image.
    expect(snap.forms).toHaveLength(1);
    expect(isFormEdited(snap.forms[0].draft)).toBe(false);
    expect(snap.forms[0].draft.imageId).toBeNull();
    expect(snap.forms[0].draft.fields.restaurant.value).toBeNull();
  });

  it("keeps the model's own confidence values as suggestions and invents none", async () => {
    const { flow } = await analyzed();
    const draft = flow.getSnapshot().offers[0].drafts[0];
    expect(draft.fields.restaurant.suggestion?.confidence).toBe(0.91);
    expect(draft.fields.priceCad.suggestion?.confidence).toBe(0.8);
    expect(draft.fields.validStart.suggestion?.confidence).toBe(0.6);
    expect(draft.fields.expiresOn.suggestion?.confidence).toBe(0.3);
    expect(draft.fields.address.suggestion?.confidence).toBeUndefined();
    expect(draft.fields.dealText.suggestion?.confidence).toBeUndefined();
    // Suggestions are not accepted or reviewed.
    expect(draft.fields.restaurant.value).toBeNull();
    expect(draft.fields.restaurant.isReviewed).toBe(false);
    expect(draft.imageId).toBe("storage_id_1_abcdefgh");
  });

  it("carries every sidecar review note into the offer draft", async () => {
    const outcome = anOutcome({
      manualReview: [
        { dealIndex: 0, code: "UNSUPPORTED_CONSTRAINT", blocking: true, detail: "members only" },
        { dealIndex: 0, code: "CURRENCY_UNVERIFIED", blocking: false, detail: "USD shown", originalAmount: 9 },
      ],
      requiresBlockingReview: true,
    });
    const { flow } = await analyzed({}, outcome);
    const issues = flow.getSnapshot().offers[0].drafts[0].reviewIssues;
    expect(issues.map((i) => i.code).sort()).toEqual(["CURRENCY_UNVERIFIED", "UNSUPPORTED_CONSTRAINT"]);
    expect(issues.find((i) => i.code === "CURRENCY_UNVERIFIED")).toMatchObject({ originalAmount: 9, blocking: false });
  });

  it("a no-deal result is reported and offers nothing to apply", async () => {
    const { flow } = await analyzed({}, anOutcome({}, []));
    const snap = flow.getSnapshot();
    expect(snap.offers[0]).toMatchObject({ noDeal: true, drafts: [] });
    expect(flow.applyOffer(snap.offers[0].id, 0, { kind: "add" })).toEqual({ ok: false, reason: "no_deal" });
    expect(snap.forms).toHaveLength(1);
  });

  it("text-only (no image) never calls the backend or claims success", async () => {
    const { deps } = makeDeps();
    const flow = new ImageDraftFlow(deps);
    flow.setContext({ caption: "Half price ramen", text: "Mondays" });
    await flow.analyze();
    expect(flow.getSnapshot().phase).toBe("failed");
    expect(flow.getSnapshot().error?.code).toBe("NO_IMAGE");
    expect(flow.getSnapshot().offers).toEqual([]);
    for (const fn of [deps.prepareImage, deps.getToken, deps.generateUploadUrl, deps.upload, deps.extract]) expect(fn).not.toHaveBeenCalled();
  });

  it("rejects bad context before any call and keeps the file and text", async () => {
    const { deps } = makeDeps();
    const flow = new ImageDraftFlow(deps);
    const picked = file();
    flow.selectFile(picked);
    for (const patch of [
      { caption: "x".repeat(MAX_CAPTION_CHARS + 1) },
      { provenanceUrl: "javascript:alert(1)" },
      { provenanceUrl: "https://user:pw@example.com/" },
      { publishedAt: "2026-02-31" },
    ]) {
      flow.setContext({ caption: "", text: "", provenanceUrl: "", publishedAt: "", ...patch });
      await flow.analyze();
      expect(flow.getSnapshot().phase).toBe("failed");
      expect(flow.getSnapshot().error?.code).toBe("INVALID_INPUT");
    }
    expect(deps.prepareImage).not.toHaveBeenCalled();
    expect(flow.getSnapshot().source.file).toBe(picked);
  });
});

describe("analyze: failures preserve photo, context and manual edits", () => {
  it.each([
    ["auth", { ok: false, reason: "auth" }, "AUTH"],
    ["rejected", { ok: false, reason: "rejected" }, "UPLOAD_REJECTED"],
    ["rate limited", { ok: false, reason: "rate_limited" }, "UPLOAD_RATE_LIMITED"],
    ["network", { ok: false, reason: "network" }, "UPLOAD_NETWORK"],
    ["timeout", { ok: false, reason: "timeout" }, "UPLOAD_TIMEOUT"],
    ["unconfirmed", { ok: false, reason: "unexpected" }, "UPLOAD_UNCONFIRMED"],
  ] as const)("upload %s never reaches extraction", async (_n, outcome, code) => {
    const { deps } = makeDeps({ upload: vi.fn(async () => outcome as ImageUploadOutcome) });
    const flow = new ImageDraftFlow(deps);
    const picked = file();
    flow.selectFile(picked);
    flow.setContext({ caption: "keep me" });
    flow.dispatch("form-1", { type: "SET_FIELD", field: "restaurant", value: "My edit" });
    await flow.analyze();
    const snap = flow.getSnapshot();
    expect(snap.phase).toBe("failed");
    expect(snap.error?.code).toBe(code);
    expect(deps.extract).not.toHaveBeenCalled();
    expect(snap.source.file).toBe(picked);
    expect(snap.source.caption).toBe("keep me");
    expect(snap.uploaded).toBe(false);
    expect(form(flow, "form-1").draft.fields.restaurant.value).toBe("My edit");
  });

  it("a missing session token or upload URL stops before upload", async () => {
    const noToken = makeDeps({ getToken: vi.fn(async () => null) });
    const a = new ImageDraftFlow(noToken.deps);
    a.selectFile(file());
    await a.analyze();
    expect(a.getSnapshot().error?.code).toBe("AUTH");
    expect(noToken.deps.upload).not.toHaveBeenCalled();

    const noUrl = makeDeps({ generateUploadUrl: vi.fn(async () => { throw new Error("not configured"); }) });
    const b = new ImageDraftFlow(noUrl.deps);
    b.selectFile(file());
    await b.analyze();
    expect(b.getSnapshot().error?.code).toBe("UPLOAD_UNAVAILABLE");
    expect(noUrl.deps.upload).not.toHaveBeenCalled();
  });

  it("an unreadable image or non-JPEG prepared output is refused before any token or upload", async () => {
    for (const prep of [
      vi.fn(async () => { throw new Error("decode failed"); }),
      vi.fn(async () => ({ name: "x.png", type: "image/png", size: 10 }) as never),
      vi.fn(async () => ({ name: "x.jpg", type: "image/jpeg", size: 6 * 1024 * 1024 }) as never),
    ]) {
      const { deps } = makeDeps({ prepareImage: prep });
      const flow = new ImageDraftFlow(deps);
      flow.selectFile(file());
      await flow.analyze();
      expect(flow.getSnapshot().error?.code).toBe("IMAGE_UNREADABLE");
      expect(deps.getToken).not.toHaveBeenCalled();
      expect(deps.upload).not.toHaveBeenCalled();
    }
  });

  it("a bad upload receipt is not trusted", async () => {
    for (const bad of [{ ok: true, storageId: "" }, { ok: true, storageId: "short" }, { ok: true, storageId: "has space in it" }, { ok: true }, { ok: true, storageId: 5 }]) {
      const { deps } = makeDeps({ upload: vi.fn(async () => bad as unknown as ImageUploadOutcome) });
      const flow = new ImageDraftFlow(deps);
      flow.selectFile(file());
      await flow.analyze();
      expect(flow.getSnapshot().phase).toBe("failed");
      expect(deps.extract).not.toHaveBeenCalled();
      expect(flow.getSnapshot().uploaded).toBe(false);
    }
  });

  it("a failed extraction shows fixed copy (never the server text) and a retry reuses the upload", async () => {
    let attempt = 0;
    const { deps, flow } = await analyzed({
      extract: vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw convexError({ code: "EXTRACTION_FAILED", message: "provider body sk-secret", retryable: true });
        return anOutcome();
      }),
    });
    expect(flow.getSnapshot().phase).toBe("failed");
    expect(flow.getSnapshot().error).toMatchObject({ code: "EXTRACTION_FAILED", retryable: true });
    expect(JSON.stringify(flow.getSnapshot().error)).not.toMatch(/sk-secret|provider body|Request ID/);
    expect(flow.getSnapshot().uploaded).toBe(true);
    await flow.analyze();
    expect(flow.getSnapshot().phase).toBe("done");
    expect(deps.upload).toHaveBeenCalledTimes(1);
    expect(deps.prepareImage).toHaveBeenCalledTimes(1);
    expect(deps.extract).toHaveBeenCalledTimes(2);
  });

  it("an unavailable stored image forgets the receipt so a retry uploads again", async () => {
    let attempt = 0;
    const { deps, flow } = await analyzed({
      extract: vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw convexError({ code: "IMAGE_NOT_AVAILABLE", message: "x", retryable: false });
        return anOutcome();
      }),
    });
    expect(flow.getSnapshot().uploaded).toBe(false);
    await flow.analyze();
    expect(deps.upload).toHaveBeenCalledTimes(2);
    expect(flow.getSnapshot().phase).toBe("done");
    expect(flow.getSnapshot().offers[0].imageId).toBe("storage_id_2_abcdefgh");
  });

  it("classifies server error codes with fixed copy and unknown shapes as retryable generic", () => {
    expect(classifyExtractError(convexError({ code: "CONFIGURATION", message: "Image analysis is not enabled on this server." }))).toMatchObject({ code: "CONFIGURATION", retryable: false });
    expect(classifyExtractError(convexError({ code: "NOT_SIGNED_IN", message: "x" })).message).toMatch(/Sign in/);
    expect(classifyExtractError(new Error("socket hang up"))).toMatchObject({ code: "EXTRACTION_FAILED", retryable: true });
    expect(classifyExtractError(null)).toMatchObject({ code: "EXTRACTION_FAILED", retryable: true });
  });

  it.each([
    ["not an object", "oops"],
    ["null", null],
    ["bare DealResult", { isDeal: true, deals: [aDeal()] }],
    ["extra envelope key", { ...anOutcome(), extra: 1 }],
    ["blank model", anOutcome({ model: "  " })],
    ["requiresBlockingReview contradicts notes", anOutcome({ requiresBlockingReview: true })],
    ["unexpected deal key", anOutcome({}, [aDeal({ startDate: "2027-01-01" })])],
    ["missing confidence", anOutcome({}, [aDeal({ confidence: { restaurant: 1, priceCad: 1, hours: 1 } })])],
    ["bad weekday", anOutcome({}, [aDeal({ validDays: ["funday"] })])],
    ["note index out of range", anOutcome({ manualReview: [{ dealIndex: 4, code: "FUTURE_START", blocking: true, detail: "x" }], requiresBlockingReview: true })],
    ["non-blocking FUTURE_START", anOutcome({ manualReview: [{ dealIndex: 0, code: "FUTURE_START", blocking: false, detail: "x" }], requiresBlockingReview: false })],
    ["isDeal true with no deals", { ...anOutcome(), result: { isDeal: true, deals: [] } }],
  ])("rejects a malformed envelope (%s) and keeps everything", async (_n, bad) => {
    const { flow, deps } = await analyzed({}, bad);
    flow.dispatch("form-1", { type: "SET_FIELD", field: "dealText", value: "typed" });
    const snap = flow.getSnapshot();
    expect(snap.phase).toBe("failed");
    expect(snap.error?.code).toBe("UNUSABLE_RESULT");
    expect(snap.offers).toEqual([]);
    expect(snap.source.file).not.toBeNull();
    expect(snap.uploaded).toBe(true);
    expect(deps.upload).toHaveBeenCalledTimes(1);
    expect(form(flow, "form-1").draft.fields.dealText.value).toBe("typed");
  });
});

// ---------------------------------------------------- cancel / stale results

describe("analyze: cancel, late results and generations", () => {
  it("cancel ignores a late success and keeps the photo, context and typed values", async () => {
    const gate = deferred<unknown>();
    const { deps } = makeDeps({ extract: vi.fn(() => gate.promise) });
    const flow = new ImageDraftFlow(deps);
    const picked = file();
    flow.selectFile(picked);
    flow.setContext({ caption: "keep" });
    flow.dispatch("form-1", { type: "SET_FIELD", field: "restaurant", value: "Typed" });
    const run = flow.analyze();
    await flush();
    expect(flow.getSnapshot().phase).toBe("extracting");
    flow.cancel();
    expect(flow.getSnapshot().phase).toBe("canceled");
    gate.resolve(anOutcome());
    await run;
    const snap = flow.getSnapshot();
    expect(snap.phase).toBe("canceled");
    expect(snap.offers).toEqual([]);
    expect(snap.source.file).toBe(picked);
    expect(snap.source.caption).toBe("keep");
    expect(snap.uploaded).toBe(true); // the real upload survives for a retry
    expect(form(flow, "form-1").draft.fields.restaurant.value).toBe("Typed");
    await flow.analyze();
    expect(deps.upload).toHaveBeenCalledTimes(1);
  });

  it("cancel ignores a late failure too", async () => {
    const gate = deferred<unknown>();
    const { deps } = makeDeps({ extract: vi.fn(() => gate.promise) });
    const flow = new ImageDraftFlow(deps);
    flow.selectFile(file());
    const run = flow.analyze();
    await flush();
    flow.cancel();
    gate.reject(convexError({ code: "EXTRACTION_FAILED", message: "boom" }));
    await run;
    expect(flow.getSnapshot().phase).toBe("canceled");
    expect(flow.getSnapshot().error).toBeNull();
  });

  it("cancel during upload aborts the signal and a late upload outcome cannot start extraction", async () => {
    const gate = deferred<ImageUploadOutcome>();
    let signal: AbortSignal | undefined;
    const { deps } = makeDeps({
      upload: vi.fn(({ signal: s }: { signal: AbortSignal }) => {
        signal = s;
        return gate.promise;
      }) as never,
    });
    const flow = new ImageDraftFlow(deps);
    flow.selectFile(file());
    const run = flow.analyze();
    await flush();
    expect(flow.getSnapshot().phase).toBe("uploading");
    flow.cancel();
    expect(signal?.aborted).toBe(true);
    gate.resolve({ ok: true, storageId: "storage_late_abcdefgh" });
    await run;
    expect(deps.extract).not.toHaveBeenCalled();
    expect(flow.getSnapshot().phase).toBe("canceled");
    // Same file: the finished upload is kept, so a retry goes straight to extraction.
    await flow.analyze();
    expect(deps.upload).toHaveBeenCalledTimes(1);
    expect(deps.extract).toHaveBeenCalledWith({ imageIds: ["storage_late_abcdefgh"] });
  });

  it("out-of-order results: a superseded run resolving late cannot replace the current one", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const queue = [first, second];
    const { deps } = makeDeps({ extract: vi.fn(() => queue.shift()!.promise) });
    const flow = new ImageDraftFlow(deps);
    flow.selectFile(file("a.png"));
    const run1 = flow.analyze();
    await flush();
    flow.selectFile(file("b.png")); // supersedes run 1
    expect(flow.getSnapshot().phase).toBe("idle");
    const run2 = flow.analyze();
    await flush();
    second.resolve(anOutcome({ model: "second" }));
    await run2;
    first.resolve(anOutcome({ model: "first" }));
    await run1;
    const snap = flow.getSnapshot();
    expect(snap.offers.map((o) => o.model)).toEqual(["second"]);
    expect(snap.offers[0].imageName).toBe("b.png");
    expect(snap.offers[0].imageId).toBe("storage_id_2_abcdefgh");
  });

  it("changing the source during upload never attaches the old receipt to the new file", async () => {
    const gate = deferred<ImageUploadOutcome>();
    const { deps } = makeDeps({
      upload: vi
        .fn()
        .mockImplementationOnce(() => gate.promise)
        .mockImplementation(async () => ({ ok: true, storageId: "storage_for_b_abcdefgh" })) as never,
    });
    const flow = new ImageDraftFlow(deps);
    flow.selectFile(file("a.png"));
    const run1 = flow.analyze();
    await flush();
    flow.selectFile(file("b.png"));
    gate.resolve({ ok: true, storageId: "storage_for_a_abcdefgh" });
    await run1;
    expect(flow.getSnapshot().uploaded).toBe(false);
    await flow.analyze();
    expect(deps.extract).toHaveBeenCalledTimes(1);
    expect(deps.extract).toHaveBeenCalledWith({ imageIds: ["storage_for_b_abcdefgh"] });
  });

  it("detach cancels the run (unmount) and its outcome is ignored", async () => {
    const gate = deferred<unknown>();
    const { deps } = makeDeps({ extract: vi.fn(() => gate.promise) });
    const flow = new ImageDraftFlow(deps);
    const detach = flow.attach();
    flow.selectFile(file());
    const run = flow.analyze();
    await flush();
    detach();
    gate.resolve(anOutcome());
    await run;
    expect(flow.getSnapshot().offers).toEqual([]);
    expect(flow.getSnapshot().phase).toBe("canceled");
  });

  it("a second analyze while one is running does not start another", async () => {
    const gate = deferred<unknown>();
    const { deps } = makeDeps({ extract: vi.fn(() => gate.promise) });
    const flow = new ImageDraftFlow(deps);
    flow.selectFile(file());
    const run = flow.analyze();
    await flush();
    await flow.analyze();
    gate.resolve(anOutcome());
    await run;
    expect(deps.extract).toHaveBeenCalledTimes(1);
  });
});

// ----------------------------------------------- explicit apply, manual edits

describe("applying offers", () => {
  it("never overwrites an edited form: add makes a separate form; replace needs explicit confirmation", async () => {
    const { flow } = await analyzed();
    flow.dispatch("form-1", { type: "SET_FIELD", field: "restaurant", value: "My Place" });
    const offerId = flow.getSnapshot().offers[0].id;

    expect(flow.applyOffer(offerId, 0, { kind: "replace", formKey: "form-1" })).toEqual({ ok: false, reason: "confirm_required" });
    expect(form(flow, "form-1").draft.fields.restaurant.value).toBe("My Place");
    expect(form(flow, "form-1").draft.imageId).toBeNull();

    const added = flow.applyOffer(offerId, 0, { kind: "add" });
    expect(added.ok).toBe(true);
    expect(flow.getSnapshot().forms).toHaveLength(2);
    expect(form(flow, "form-1").draft.fields.restaurant.value).toBe("My Place");
    if (added.ok) {
      expect(form(flow, added.formKey).draft.imageId).toBe("storage_id_1_abcdefgh");
      expect(form(flow, added.formKey).draft.fields.restaurant.value).toBeNull(); // suggestion only
      expect(form(flow, added.formKey).draft.fields.restaurant.suggestion?.value).toBe("Ramen Danbo");
    }

    const replaced = flow.applyOffer(offerId, 0, { kind: "replace", formKey: "form-1" }, { confirmReplace: true });
    expect(replaced).toEqual({ ok: true, formKey: "form-1" });
    expect(form(flow, "form-1").draft.fields.restaurant.value).toBeNull();
    expect(form(flow, "form-1").epoch).toBe(1);
    expect(flow.getSnapshot().offers[0].appliedTo).toEqual(["form-1"]);
  });

  it("an unedited form is replaced without confirmation, and the applied draft is a copy", async () => {
    const { flow } = await analyzed();
    const offerId = flow.getSnapshot().offers[0].id;
    expect(flow.applyOffer(offerId, 0, { kind: "replace", formKey: "form-1" })).toEqual({ ok: true, formKey: "form-1" });
    flow.dispatch("form-1", { type: "SET_FIELD", field: "restaurant", value: "Edited" });
    expect(flow.getSnapshot().offers[0].drafts[0].fields.restaurant.isManuallyEdited).toBe(false);
  });

  it("several offers stay unapplied until chosen; each form keeps its own state while switching", async () => {
    const outcome = anOutcome({}, [aDeal(), aDeal({ restaurant: "Second Place", dealText: "Two for one" })]);
    const { flow } = await analyzed({}, outcome);
    const snap = flow.getSnapshot();
    expect(snap.forms).toHaveLength(1);
    expect(snap.offers[0].drafts).toHaveLength(2);
    const id = snap.offers[0].id;

    const a = flow.applyOffer(id, 0, { kind: "add" });
    const b = flow.applyOffer(id, 1, { kind: "add" });
    expect(a.ok && b.ok).toBe(true);
    if (!(a.ok && b.ok)) return;
    flow.dispatch(a.formKey, { type: "SET_FIELD", field: "priceCad", value: 7 });
    flow.dispatch(b.formKey, { type: "SET_FIELD", field: "priceCad", value: 9 });
    flow.setActiveForm(a.formKey);
    flow.setActiveForm(b.formKey);
    expect(form(flow, a.formKey).draft.fields.priceCad.value).toBe(7);
    expect(form(flow, b.formKey).draft.fields.priceCad.value).toBe(9);
    expect(form(flow, b.formKey).draft.fields.restaurant.suggestion?.value).toBe("Second Place");
    // Nothing was published by choosing.
    expect(flow.getSnapshot().forms.every((f) => f.saved === null)).toBe(true);
  });

  it("is bounded: unknown ids and the form cap are refused", async () => {
    const { flow } = await analyzed();
    const id = flow.getSnapshot().offers[0].id;
    expect(flow.applyOffer("nope", 0, { kind: "add" })).toEqual({ ok: false, reason: "unknown_offer" });
    expect(flow.applyOffer(id, 3, { kind: "add" })).toEqual({ ok: false, reason: "unknown_offer" });
    expect(flow.applyOffer(id, 0, { kind: "replace", formKey: "missing" })).toEqual({ ok: false, reason: "unknown_form" });
    for (let i = flow.getSnapshot().forms.length; i < MAX_FORMS; i += 1) expect(flow.applyOffer(id, 0, { kind: "add" }).ok).toBe(true);
    expect(flow.applyOffer(id, 0, { kind: "add" })).toEqual({ ok: false, reason: "too_many_forms" });
  });

  it("the image belongs to the draft, not to the latest selected file", async () => {
    const { flow } = await analyzed();
    const first = flow.getSnapshot().offers[0];
    const applied = flow.applyOffer(first.id, 0, { kind: "replace", formKey: "form-1" });
    expect(applied.ok).toBe(true);
    flow.dispatch("form-1", { type: "ACCEPT_ALL_SUGGESTIONS" });

    flow.selectFile(file("other.png")); // new source selection only
    expect(form(flow, "form-1").draft.imageId).toBe("storage_id_1_abcdefgh");
    expect(form(flow, "form-1").imageName).toBe("menu.png");
    flow.selectFile(null);
    expect(form(flow, "form-1").draft.imageId).toBe("storage_id_1_abcdefgh");

    flow.selectFile(file("other.png"));
    await flow.analyze();
    const second = flow.getSnapshot().offers[1];
    expect(second.imageId).toBe("storage_id_2_abcdefgh");
    // Editing context or applying the new offer is the only way the new image reaches a form.
    expect(form(flow, "form-1").draft.imageId).toBe("storage_id_1_abcdefgh");
    expect(flow.applyOffer(second.id, 0, { kind: "replace", formKey: "form-1" })).toEqual({ ok: false, reason: "confirm_required" });
    flow.applyOffer(second.id, 0, { kind: "replace", formKey: "form-1" }, { confirmReplace: true });
    expect(form(flow, "form-1").draft.imageId).toBe("storage_id_2_abcdefgh");
    expect(form(flow, "form-1").draft.fields.restaurant.value).toBeNull(); // old accepted fields did not carry over
  });

  it("removeImage detaches only that form's image and keeps its edits and suggestions", async () => {
    const { flow } = await analyzed();
    const offer = flow.getSnapshot().offers[0];
    flow.applyOffer(offer.id, 0, { kind: "replace", formKey: "form-1" });
    flow.dispatch("form-1", { type: "SET_FIELD", field: "restaurant", value: "Mine" });
    expect(flow.removeImage("form-1")).toBe(true);
    const f = form(flow, "form-1");
    expect(f.draft.imageId).toBeNull();
    expect(f.imageName).toBeNull();
    expect(f.draft.fields.restaurant.value).toBe("Mine");
    expect(f.draft.fields.priceCad.suggestion?.value).toBe(12.5);
    expect(flow.removeImage("form-1")).toBe(false);
  });

  it("dispatch refuses lifecycle and image actions and survives invalid coordinates", () => {
    const { deps } = makeDeps();
    const flow = new ImageDraftFlow(deps);
    expect(flow.dispatch("form-1", { type: "SET_IMAGE_ID", imageId: "storage_forged_abcdefgh" })).toBe(false);
    expect(flow.dispatch("form-1", { type: "START_EXTRACTION", requestId: "r" })).toBe(false);
    expect(flow.dispatch("form-1", { type: "CONFIRM_LOCATION", lat: 999, lng: 0 })).toBe(false);
    expect(flow.dispatch("missing", { type: "INVALIDATE_LOCATION" })).toBe(false);
    expect(form(flow, "form-1").draft.imageId).toBeNull();
  });

  it("editing restaurant or address clears a confirmed pin (shared reducer)", () => {
    const { deps } = makeDeps();
    const flow = new ImageDraftFlow(deps);
    flow.dispatch("form-1", { type: "SET_FIELD", field: "restaurant", value: "A" });
    flow.dispatch("form-1", { type: "CONFIRM_LOCATION", lat: 49.28, lng: -123.12 });
    expect(form(flow, "form-1").draft.location?.confirmed).toBe(true);
    flow.dispatch("form-1", { type: "SET_FIELD", field: "address", value: "1 Main St" });
    expect(form(flow, "form-1").draft.location).toBeNull();
  });
});

// ------------------------------------------------------------------ publish

describe("publish", () => {
  it("is refused until every field is reviewed and the pin is confirmed; deals.create is not called", async () => {
    const { flow, deps } = await analyzed();
    const offer = flow.getSnapshot().offers[0];
    flow.applyOffer(offer.id, 0, { kind: "replace", formKey: "form-1" });
    let r = await flow.publish("form-1");
    expect(r.ok).toBe(false);
    expect(form(flow, "form-1").publishError).toMatch(/Pending suggestions|explicitly reviewed|Coordinates/);

    flow.dispatch("form-1", { type: "ACCEPT_ALL_SUGGESTIONS" });
    for (const field of ["restaurant", "address", "dealText", "priceCad", "validDays", "validStart", "validEnd", "expiresOn", "conditions"] as DraftFieldKey[]) {
      flow.dispatch("form-1", { type: "REVIEW_FIELD", field });
    }
    r = await flow.publish("form-1");
    expect(r.ok).toBe(false);
    expect(form(flow, "form-1").publishError).toMatch(/Coordinates/);
    expect(deps.createDeal).not.toHaveBeenCalled();
    expect(form(flow, "form-1").saved).toBeNull();
  });

  it("a FUTURE_START note is a hard blocker even after everything is reviewed", async () => {
    const outcome = anOutcome({ manualReview: [{ dealIndex: 0, code: "FUTURE_START", blocking: true, detail: "starts next year" }], requiresBlockingReview: true });
    const { flow, deps } = await analyzed({}, outcome);
    flow.applyOffer(flow.getSnapshot().offers[0].id, 0, { kind: "replace", formKey: "form-1" });
    reviewAll(flow, "form-1");
    const r = await flow.publish("form-1");
    expect(r.ok).toBe(false);
    expect(form(flow, "form-1").publishError).toMatch(/future-start/);
    expect(deps.createDeal).not.toHaveBeenCalled();
  });

  it("an unresolved provider constraint and an unverified currency each block until resolved", async () => {
    const outcome = anOutcome({
      manualReview: [
        { dealIndex: 0, code: "UNSUPPORTED_CONSTRAINT", blocking: true, detail: "members only" },
        { dealIndex: 0, code: "CURRENCY_UNVERIFIED", blocking: false, detail: "USD shown", originalAmount: 9 },
      ],
      requiresBlockingReview: true,
    });
    const { flow, deps } = await analyzed({}, outcome);
    flow.applyOffer(flow.getSnapshot().offers[0].id, 0, { kind: "replace", formKey: "form-1" });
    reviewAll(flow, "form-1");
    let r = await flow.publish("form-1");
    expect(r.ok).toBe(false);
    expect(form(flow, "form-1").publishError).toMatch(/Unresolved provider constraint/);
    expect(form(flow, "form-1").publishError).toMatch(/Currency is unverified/);

    const issue = form(flow, "form-1").draft.reviewIssues.find((i) => i.code === "UNSUPPORTED_CONSTRAINT")!;
    flow.dispatch("form-1", { type: "RESOLVE_REVIEW_ISSUE", issueId: issue.id, resolutionNote: "Checked with the restaurant" });
    flow.dispatch("form-1", { type: "SET_FIELD", field: "priceCad", value: 12 });
    r = await flow.publish("form-1");
    expect(r).toEqual({ ok: true, id: "deal_id_abcdefghij" });
    expect(deps.createDeal).toHaveBeenCalledTimes(1);
  });

  it("publishes the exact canonical fields once: no author/count fields, no undefined keys, receipt image id", async () => {
    const { flow, deps } = await analyzed();
    flow.applyOffer(flow.getSnapshot().offers[0].id, 0, { kind: "replace", formKey: "form-1" });
    reviewAll(flow, "form-1");
    const r = await flow.publish("form-1");
    expect(r).toEqual({ ok: true, id: "deal_id_abcdefghij" });
    expect(deps.createDeal).toHaveBeenCalledTimes(1);
    const args = deps.createDeal.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(args).toEqual({
      restaurant: "Ramen Danbo",
      address: "1333 Robson St, Vancouver",
      dealText: "Lunch combo",
      priceCad: 12.5,
      validDays: ["mon", "tue"],
      validStart: "11:00",
      validEnd: "15:00",
      expiresOn: "2026-12-31",
      conditions: ["Dine-in only"],
      lat: 49.28,
      lng: -123.12,
      imageId: "storage_id_1_abcdefgh",
    });
    for (const banned of ["authorId", "authorName", "stillOnCount", "expiredCount", "sourceUrl"]) expect(banned in args).toBe(false);
    expect(Object.values(args).every((v) => v !== undefined)).toBe(true);
    expect(form(flow, "form-1").saved).toEqual({ id: "deal_id_abcdefghij" });
  });

  it("omits unlisted optional fields instead of sending nulls, and a manual deal needs no image", async () => {
    const { deps } = makeDeps();
    const flow = new ImageDraftFlow(deps);
    flow.dispatch("form-1", { type: "SET_FIELD", field: "restaurant", value: "Corner Cafe" });
    flow.dispatch("form-1", { type: "SET_FIELD", field: "dealText", value: "Free coffee with pastry" });
    for (const field of ["address", "priceCad", "hours", "expiresOn", "validDays", "conditions"] as const) {
      flow.dispatch("form-1", { type: "REVIEW_OMISSION", field });
    }
    flow.dispatch("form-1", { type: "CONFIRM_LOCATION", lat: 49.25, lng: -123.1 });
    expect(await flow.publish("form-1")).toEqual({ ok: true, id: "deal_id_abcdefghij" });
    expect(deps.createDeal.mock.calls[0][0]).toEqual({
      restaurant: "Corner Cafe",
      dealText: "Free coffee with pastry",
      validDays: [],
      conditions: [],
      lat: 49.25,
      lng: -123.1,
    });
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it("a double click shares one in-flight call; a saved form is never published twice", async () => {
    const gate = deferred<unknown>();
    const { flow, deps } = await analyzed({ createDeal: vi.fn(() => gate.promise) });
    flow.applyOffer(flow.getSnapshot().offers[0].id, 0, { kind: "replace", formKey: "form-1" });
    reviewAll(flow, "form-1");
    const a = flow.publish("form-1");
    const b = flow.publish("form-1");
    expect(a).toBe(b);
    expect(form(flow, "form-1").submitting).toBe(true);
    expect(form(flow, "form-1").saved).toBeNull(); // not saved until the receipt
    // Edits are ignored while the request is out, so what was sent is what is saved.
    expect(flow.dispatch("form-1", { type: "SET_FIELD", field: "restaurant", value: "Changed" })).toBe(false);
    gate.resolve("deal_real_id_123456");
    expect(await a).toEqual({ ok: true, id: "deal_real_id_123456" });
    expect(await flow.publish("form-1")).toEqual({ ok: true, id: "deal_real_id_123456" });
    expect(deps.createDeal).toHaveBeenCalledTimes(1);
    expect(flow.dispatch("form-1", { type: "SET_FIELD", field: "restaurant", value: "After" })).toBe(false);
  });

  it("a rejection keeps the form and every edit; a retry calls again and can then succeed once", async () => {
    let attempt = 0;
    const { flow, deps } = await analyzed({
      createDeal: vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw convexError("Create your profile before publishing.");
        if (attempt === 2) throw new Error("[Request ID: 9] Server Error");
        return "deal_after_retry_123";
      }),
    });
    flow.applyOffer(flow.getSnapshot().offers[0].id, 0, { kind: "replace", formKey: "form-1" });
    reviewAll(flow, "form-1");
    flow.dispatch("form-1", { type: "SET_FIELD", field: "dealText", value: "My own wording" });

    let r = await flow.publish("form-1");
    expect(r).toEqual({ ok: false, message: "Create your profile before publishing." });
    expect(form(flow, "form-1").submitting).toBe(false);
    expect(form(flow, "form-1").saved).toBeNull();
    expect(form(flow, "form-1").draft.fields.dealText.value).toBe("My own wording");
    expect(form(flow, "form-1").draft.location?.confirmed).toBe(true);

    r = await flow.publish("form-1");
    expect(r.ok).toBe(false);
    expect(form(flow, "form-1").publishError).not.toMatch(/Request ID|Server Error/);

    r = await flow.publish("form-1");
    expect(r).toEqual({ ok: true, id: "deal_after_retry_123" });
    expect(deps.createDeal).toHaveBeenCalledTimes(3);
    await flow.publish("form-1");
    expect(deps.createDeal).toHaveBeenCalledTimes(3);
  });

  it.each([[undefined], [null], [""], [42], ["x"], [{ id: "deal_object_abcdefg" }]])("a non-receipt result (%j) is not a save", async (bad) => {
    const { flow } = await analyzed({ createDeal: vi.fn(async () => bad) });
    flow.applyOffer(flow.getSnapshot().offers[0].id, 0, { kind: "replace", formKey: "form-1" });
    reviewAll(flow, "form-1");
    const r = await flow.publish("form-1");
    expect(r.ok).toBe(false);
    expect(form(flow, "form-1").saved).toBeNull();
    expect(form(flow, "form-1").submitting).toBe(false);
  });

  it("publishes only one form at a time per key; other forms stay untouched", async () => {
    const outcome = anOutcome({}, [aDeal(), aDeal({ restaurant: "Second Place" })]);
    const { flow, deps } = await analyzed({}, outcome);
    const id = flow.getSnapshot().offers[0].id;
    const a = flow.applyOffer(id, 0, { kind: "add" });
    const b = flow.applyOffer(id, 1, { kind: "add" });
    if (!(a.ok && b.ok)) throw new Error("apply failed");
    reviewAll(flow, a.formKey);
    reviewAll(flow, b.formKey);
    expect((await flow.publish(a.formKey)).ok).toBe(true);
    expect(form(flow, a.formKey).saved).not.toBeNull();
    expect(form(flow, b.formKey).saved).toBeNull();
    expect(deps.createDeal).toHaveBeenCalledTimes(1);
  });

  it("still records a real save after the page detached (the server fact is kept)", async () => {
    const gate = deferred<unknown>();
    const { flow } = await analyzed({ createDeal: vi.fn(() => gate.promise) });
    const detach = flow.attach();
    flow.applyOffer(flow.getSnapshot().offers[0].id, 0, { kind: "replace", formKey: "form-1" });
    reviewAll(flow, "form-1");
    const pending = flow.publish("form-1");
    detach();
    gate.resolve("deal_detached_123456");
    expect(await pending).toEqual({ ok: true, id: "deal_detached_123456" });
    expect(form(flow, "form-1").saved).toEqual({ id: "deal_detached_123456" });
  });

  it("a form never publishes an image id that no upload receipt produced", async () => {
    const { flow, deps } = await analyzed();
    flow.applyOffer(flow.getSnapshot().offers[0].id, 0, { kind: "replace", formKey: "form-1" });
    reviewAll(flow, "form-1");
    // Forge an unreceipted id straight into the snapshot, bypassing the controller API.
    const snap = flow.getSnapshot();
    const forged = { ...snap.forms[0], draft: { ...snap.forms[0].draft, imageId: "storage_forged_abcdefgh" } };
    (flow as unknown as { snap: typeof snap }).snap = { ...snap, forms: [forged] };
    const r = await flow.publish("form-1");
    expect(r.ok).toBe(false);
    expect(deps.createDeal).not.toHaveBeenCalled();
  });
});

describe("publish failure messages", () => {
  it("maps only the known server strings to fixed copy", () => {
    expect(publishMessage(convexError("Not signed in"))).toBe("Your session expired. Sign in again to publish.");
    expect(publishMessage(convexError("Create your profile before publishing."))).toBe("Create your profile before publishing.");
    for (const known of ["That image is not available to you.", "That image is missing, too large, or not a supported image."]) {
      expect(publishMessage(convexError(known))).toMatch(/attached image could not be used/);
    }
  });

  it.each([
    ["an arbitrary backend string", convexError("Internal failure in provider sk-secret at convex/deals.ts:153")],
    ["validation text", convexError("Price must be a finite non-negative number, got -5")],
    ["an object payload with a message", convexError({ code: "X", message: "provider body leaked" })],
    ["a plain Error", new Error("[Request ID: 9] Server Error: key sk-secret")],
    ["a near-match of a known string", convexError("Not signed in; token abc")],
    ["null", null],
    ["a string", "Create your profile before publishing."],
  ])("never echoes %s", (_n, error) => {
    const message = publishMessage(error);
    expect(message).toBe(GENERIC_PUBLISH_FAILURE);
    expect(message).not.toMatch(/sk-secret|provider|Request ID|convex\/deals|token abc|-5/);
  });

  it("the form shows only the safe copy and keeps every edit", async () => {
    const { flow } = await analyzed({ createDeal: vi.fn(async () => { throw convexError("Deal text must not contain secret-internal-detail"); }) });
    flow.applyOffer(flow.getSnapshot().offers[0].id, 0, { kind: "replace", formKey: "form-1" });
    reviewAll(flow, "form-1");
    flow.dispatch("form-1", { type: "SET_FIELD", field: "dealText", value: "My wording" });
    const r = await flow.publish("form-1");
    expect(r).toEqual({ ok: false, message: GENERIC_PUBLISH_FAILURE });
    expect(form(flow, "form-1").publishError).toBe(GENERIC_PUBLISH_FAILURE);
    expect(form(flow, "form-1").draft.fields.dealText.value).toBe("My wording");
    expect(form(flow, "form-1").draft.location?.confirmed).toBe(true);
    expect(form(flow, "form-1").saved).toBeNull();
  });
});

describe("saved deal route and session notice", () => {
  it("routes a saved deal to the map with its id", () => {
    expect(savedDealMapHref("k17abcdefgh")).toBe("/map?deal=k17abcdefgh");
    expect(savedDealMapHref("a b&c")).toBe("/map?deal=a%20b%26c");
  });

  it("tells signed-out and missing-profile users apart, and stays quiet while loading", () => {
    expect(sessionNotice({ isLoading: true, isAuthenticated: false, profile: undefined })).toBe("none");
    expect(sessionNotice({ isLoading: false, isAuthenticated: false, profile: undefined })).toBe("signed_out");
    expect(sessionNotice({ isLoading: false, isAuthenticated: false, profile: false })).toBe("signed_out");
    expect(sessionNotice({ isLoading: false, isAuthenticated: true, profile: false })).toBe("no_profile");
    expect(sessionNotice({ isLoading: false, isAuthenticated: true, profile: undefined })).toBe("none");
    expect(sessionNotice({ isLoading: false, isAuthenticated: true, profile: true })).toBe("none");
  });
});
