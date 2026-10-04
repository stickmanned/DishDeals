// T-16B tests: opt-in saved-capture replay bound into the REAL ImageDraftFlow controller.
//
// EVERYTHING HERE IS SYNTHETIC. There are no genuine cache fixtures in this repository: the "capture" files below are
// built in the test, labeled synthetic, and served through an injected fetch. The model, uploads, token and backend
// are fakes. Nothing shows a real provider capture, a real recording decode, a browser, a phone or the Gemini key
// being absent in a deployment; those acceptance steps are PENDING.
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { ImageDraftFlow, type FlowDeps } from "../../lib/imageDraftFlow";
import { currentPromptVersion, demoKey, demoKeyFromMaterial, demoMaterial } from "../../lib/demoCache";
import { browserDemoCache, buildDemoMaterial, cachedOfferNote, DEMO_LOOKUP_DEADLINE_MS } from "../../lib/demoCacheFlow";
import type { ExtractOutcome } from "../../lib/extractCore";
import type { ImageUploadOutcome } from "../../lib/dealImageUpload";

afterEach(() => vi.useRealTimers());

// ----------------------------------------------------------------- fixtures

const bytes = (s: string) => new TextEncoder().encode(s);
const ORIGINAL = bytes("synthetic-original-screenshot-bytes");
const PREPARED = bytes("synthetic-resized-jpeg-bytes");
const FRAMES = ["frame-one", "frame-two", "frame-three", "frame-four"].map((n) => bytes(`synthetic-${n}-jpeg`));
const RECORDING = bytes("synthetic-screen-recording-bytes");
const PV = "synthetic-prompt-v1";

const source = (data = ORIGINAL, name = "menu.png", type = "image/png") => new File([data as BlobPart], name, { type });
const jpeg = (data: Uint8Array, name = "deal.jpg") => new File([data as BlobPart], name, { type: "image/jpeg" });
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

const aDeal = (over: Record<string, unknown> = {}) => ({
  restaurant: "Synthetic Ramen", address: "1 Fixture St, Vancouver", dealText: "Synthetic lunch combo", priceCad: 12.5,
  validDays: ["mon"], validStart: "11:00", validEnd: "15:00", expiresOn: "2026-12-31", conditions: [],
  confidence: { restaurant: 0.7, priceCad: 0.6, hours: 0.5, expiresOn: 0.4 }, ...over,
});
const outcome = (over: Partial<ExtractOutcome> = {}, model = "synthetic-model"): ExtractOutcome =>
  ({ result: { isDeal: true, deals: [aDeal()] }, manualReview: [], requiresBlockingReview: false, model, ...over }) as unknown as ExtractOutcome;
const liveOutcome = () => outcome({}, "live-synthetic-model");

type Prepared = { name: string; type: string; size: number };
function makeDeps(over: Partial<FlowDeps> = {}) {
  let n = 0;
  const deps = {
    prepareImage: vi.fn(async () => jpeg(PREPARED) as unknown as Blob & Prepared),
    prepareFrames: vi.fn(async () => FRAMES.map((f, i) => jpeg(f, `frame-${i + 1}.jpg`)) as unknown as (Blob & Prepared)[]),
    getToken: vi.fn(async () => "synthetic-token"),
    generateUploadUrl: vi.fn(async () => "https://example.convex.site/deal-image"),
    upload: vi.fn(async (): Promise<ImageUploadOutcome> => { n += 1; return { ok: true, storageId: `storage_id_${n}_abcdefgh` }; }),
    extract: vi.fn(async (): Promise<unknown> => liveOutcome()),
    createDeal: vi.fn(async (): Promise<unknown> => "deal_id_abcdefghij"),
    ...over,
  };
  return deps as unknown as { [K in keyof FlowDeps]-?: Mock<NonNullable<FlowDeps[K]>> };
}

/** The exact request a user's image analysis makes, as the cache key sees it. */
const imageKey = (context: { caption?: string; text?: string; provenanceUrl?: string; publishedAt?: string } = {}, version = PV, original = ORIGINAL, prepared = PREPARED) =>
  demoKey({ original, images: [{ bytes: prepared, mimeType: "image/jpeg" }], ...context, promptVersion: version });
const recordingKey = (frames = FRAMES, version = PV) =>
  demoKey({ original: RECORDING, images: frames.map((f) => ({ bytes: f, mimeType: "image/jpeg" })), promptVersion: version });

/** A synthetic capture file for a key. Metadata is an operator assertion; this one is explicitly a test stand-in. */
const capture = (key: Awaited<ReturnType<typeof demoKey>>, envelope: ExtractOutcome = outcome()) => ({
  version: 1, ...key,
  provenance: { kind: "live-provider-capture", capturedAt: "2026-10-04T07:00:00Z", evidenceReference: "synthetic-test-reference-not-real-evidence", model: envelope.model },
  outcome: envelope,
});
/** Same-origin static server double: serves only the given files by original-file hash. */
function server(...files: ReturnType<typeof capture>[]) {
  return vi.fn<typeof fetch>(async (input) => {
    const hit = files.find((f) => String(input) === `/fixtures/demo/${f.sourceSha256}.json`);
    return hit ? new Response(JSON.stringify(hit)) : new Response(null, { status: 404 });
  });
}
const replayDeps = (fetcher: typeof fetch, over: Partial<FlowDeps> = {}) =>
  makeDeps({ demoPromptVersion: vi.fn(async () => PV), loadDemo: vi.fn(browserDemoCache(fetcher).loadDemo), ...over });
function newFlow(deps: ReturnType<typeof makeDeps>, replay = true) {
  const flow = new ImageDraftFlow(deps as unknown as FlowDeps);
  if (replay) flow.setDemoReplay(true);
  flow.selectFile(source());
  return flow;
}
const offers = (flow: ImageDraftFlow) => flow.getSnapshot().offers;

// ------------------------------------------------------------------- hit

describe("a matching saved capture (opt-in)", () => {
  it("skips the live provider call, still uploads for real receipts, and offers the validated envelope labeled cached", async () => {
    const f = capture(await imageKey());
    const fetcher = server(f), deps = replayDeps(fetcher), flow = newFlow(deps);
    await flow.analyze();
    expect(deps.extract).not.toHaveBeenCalled();
    expect(deps.upload).toHaveBeenCalledTimes(1); // the real authenticated upload still happens
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(`/fixtures/demo/${f.sourceSha256}.json`);
    const [offer] = offers(flow);
    expect(flow.getSnapshot()).toMatchObject({ phase: "done", error: null, cacheLookup: false });
    expect(offer).toMatchObject({ source: "image", noDeal: false, imageId: "storage_id_1_abcdefgh", imageIds: ["storage_id_1_abcdefgh"], model: "synthetic-model",
      cached: { capturedAt: "2026-10-04T07:00:00Z", evidenceReference: "synthetic-test-reference-not-real-evidence", model: "synthetic-model" } });
    // Not auto-confirmed: every suggestion is still unreviewed, the location is unset, the form is untouched.
    expect(offer.drafts[0].fields.restaurant.isReviewed).toBe(false);
    expect(offer.drafts[0].location).toBeNull();
    expect(flow.getSnapshot().forms).toHaveLength(1);
    expect(flow.getSnapshot().forms[0].draft.imageId).toBeNull();
  });
  it("keeps the envelope's blocking review (for example a future start) exactly as captured", async () => {
    const blocked = outcome({ manualReview: [{ dealIndex: 0, code: "FUTURE_START", blocking: true, detail: "Synthetic future-start blocker" }], requiresBlockingReview: true } as Partial<ExtractOutcome>);
    const deps = replayDeps(server(capture(await imageKey(), blocked))), flow = newFlow(deps);
    await flow.analyze();
    expect(offers(flow)[0].drafts[0].reviewIssues.some((i) => i.blocking && i.code === "FUTURE_START")).toBe(true);
    expect(deps.extract).not.toHaveBeenCalled();
  });
  it("a hit that finds no deal is still an honest cached no-deal offer", async () => {
    const none = outcome({ result: { isDeal: false, deals: [] } } as Partial<ExtractOutcome>);
    const flow = newFlow(replayDeps(server(capture(await imageKey(), none))));
    await flow.analyze();
    expect(offers(flow)[0]).toMatchObject({ noDeal: true, drafts: [], cached: expect.any(Object) });
  });
  it("works with the server key absent: a hit never calls extract, while a miss reports the live configuration failure honestly", async () => {
    const configuration = Object.assign(new Error("[Request ID: x] provider secret"), { data: { code: "CONFIGURATION" } });
    const keyless = (fetcher: typeof fetch) => replayDeps(fetcher, { extract: vi.fn(async () => { throw configuration; }) });
    const hit = keyless(server(capture(await imageKey()))), flowHit = newFlow(hit);
    await flowHit.analyze();
    expect(offers(flowHit)).toHaveLength(1);
    expect(hit.extract).not.toHaveBeenCalled();
    const miss = keyless(server()), flowMiss = newFlow(miss);
    await flowMiss.analyze();
    expect(flowMiss.getSnapshot()).toMatchObject({ phase: "failed", error: { code: "CONFIGURATION" } });
    expect(miss.extract).toHaveBeenCalledTimes(1);
  });
  it("is the same key the cache computes from the actual bytes: the controller's lookup key equals demoKey of those bytes", async () => {
    const seen: unknown[] = [];
    const deps = replayDeps(server(), { loadDemo: vi.fn(async (key) => { seen.push(key); return { status: "miss", reason: "missing" } as const; }) });
    const flow = newFlow(deps);
    flow.setContext({ caption: "  Lunch  ", text: "extra", provenanceUrl: "https://example.com/post", publishedAt: "2026-10-01" });
    await flow.analyze();
    expect(seen).toEqual([await imageKey({ caption: "Lunch", text: "extra", provenanceUrl: "https://example.com/post", publishedAt: "2026-10-01" })]);
  });
});

// ------------------------------------------------------- opt-in and old callers

describe("explicit opt-in", () => {
  it("is off by default: nothing is fetched and the live extraction runs even when a capture would match", async () => {
    const fetcher = server(capture(await imageKey())), deps = replayDeps(fetcher), flow = newFlow(deps, false);
    expect(flow.getSnapshot().demoReplay).toBe(false);
    await flow.analyze();
    expect(fetcher).not.toHaveBeenCalled();
    expect(deps.extract).toHaveBeenCalledTimes(1);
    expect(offers(flow)[0].cached).toBeUndefined();
    expect(offers(flow)[0].model).toBe("live-synthetic-model");
  });
  it("old callers without the optional deps ignore replay mode completely", async () => {
    const deps = makeDeps(), flow = newFlow(deps);
    await flow.analyze();
    expect(deps.extract).toHaveBeenCalledTimes(1);
    expect(offers(flow)[0].cached).toBeUndefined();
    expect(flow.getSnapshot().cacheLookup).toBe(false);
  });
  it("toggling after an upload uses the stored key material (no re-reading, re-preparing or re-uploading)", async () => {
    const f = capture(await imageKey()), fetcher = server(f), deps = replayDeps(fetcher), flow = newFlow(deps, false);
    await flow.analyze(); // live, replay off
    expect(deps.extract).toHaveBeenCalledTimes(1);
    flow.setDemoReplay(true);
    await flow.analyze(); // same receipt, now replay
    expect(deps.prepareImage).toHaveBeenCalledTimes(1);
    expect(deps.upload).toHaveBeenCalledTimes(1);
    expect(deps.extract).toHaveBeenCalledTimes(1);
    expect(offers(flow).map((o) => Boolean(o.cached))).toEqual([false, true]);
    flow.setDemoReplay(false);
    await flow.analyze();
    expect(deps.extract).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("a toggle during a run does not change that run", async () => {
    const gate = deferred<Awaited<ReturnType<NonNullable<FlowDeps["loadDemo"]>>>>();
    const deps = replayDeps(server(), { loadDemo: vi.fn(() => gate.promise) }), flow = newFlow(deps);
    const run = flow.analyze();
    await vi.waitFor(() => expect(deps.loadDemo).toHaveBeenCalled());
    flow.setDemoReplay(false);
    gate.resolve({ status: "miss", reason: "missing" });
    await run;
    expect(deps.loadDemo).toHaveBeenCalledTimes(1);
    expect(deps.extract).toHaveBeenCalledTimes(1);
  });
});

// -------------------------------------------------------- misses fall back once

describe("anything but an exact usable capture continues to the live extraction exactly once", () => {
  it.each([
    ["missing file", async () => server()],
    ["server error", async () => vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }))],
    ["malformed JSON", async () => vi.fn<typeof fetch>(async () => new Response("{broken"))],
    ["fixture for a different request hash", async () => server({ ...capture(await imageKey()), requestSha256: "a".repeat(64) })],
    ["fixture with a stripped sidecar (bare result)", async () => server({ ...capture(await imageKey()), outcome: outcome().result } as never)],
    ["fixture with invented confidence", async () => { const f = capture(await imageKey()); (f.outcome.result.deals[0].confidence as { hours: number }).hours = 7; return server(f); }],
    ["loader that throws", async () => vi.fn<typeof fetch>(async () => { throw new Error("network"); })],
  ])("%s", async (_name, build) => {
    const deps = replayDeps(await build()), flow = newFlow(deps);
    await flow.analyze();
    expect(deps.extract).toHaveBeenCalledTimes(1);
    expect(offers(flow)).toHaveLength(1);
    expect(offers(flow)[0].cached).toBeUndefined();
    expect(flow.getSnapshot()).toMatchObject({ phase: "done", cacheLookup: false });
  });
  it("wrong SOURCE bytes: a capture of another image is a miss", async () => {
    const other = capture(await imageKey({}, PV, bytes("a-different-original-image")));
    const deps = replayDeps(server(other)), flow = newFlow(deps);
    await flow.analyze();
    expect(deps.extract).toHaveBeenCalledTimes(1);
    expect(offers(flow)[0].cached).toBeUndefined();
  });
  it("wrong PREPARED bytes (same original, different resized upload) is a miss", async () => {
    const f = capture(await imageKey({}, PV, ORIGINAL, bytes("other-resized-bytes")));
    const deps = replayDeps(server(f)), flow = newFlow(deps);
    await flow.analyze();
    expect(deps.extract).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["caption", { caption: "Different caption" }], ["text", { text: "Different text" }],
    ["provenance link", { provenanceUrl: "https://example.com/other" }], ["publication date", { publishedAt: "2026-01-02" }],
  ])("wrong CONTEXT: a capture made without this %s is a miss; the matching context is a hit", async (_name, context) => {
    const f = capture(await imageKey()), fetcher = server(f);
    const miss = replayDeps(fetcher), missFlow = newFlow(miss);
    missFlow.setContext(context);
    await missFlow.analyze();
    expect(miss.extract).toHaveBeenCalledTimes(1);
    const hit = replayDeps(fetcher), hitFlow = newFlow(hit);
    await hitFlow.analyze();
    expect(hit.extract).not.toHaveBeenCalled();
  });
  it("wrong PROMPT/contract version is a miss, and the current version is the one tied to lib/prompt.ts", async () => {
    const f = capture(await imageKey({}, "synthetic-older-prompt"));
    const deps = replayDeps(server(f)), flow = newFlow(deps);
    await flow.analyze();
    expect(deps.extract).toHaveBeenCalledTimes(1);
    const version = await currentPromptVersion();
    expect(version).toMatch(/^extract-outcome-v1:[a-f0-9]{24}$/);
    expect(await currentPromptVersion()).toBe(version);
    const page = browserDemoCache();
    expect(await page.demoPromptVersion()).toBe(version);
  });
  it("a miss does not loop: one lookup, one live call per request", async () => {
    const deps = replayDeps(server()), flow = newFlow(deps);
    await flow.analyze();
    expect(deps.loadDemo).toHaveBeenCalledTimes(1);
    expect(deps.extract).toHaveBeenCalledTimes(1);
  });
});

// ----------------------------------------------------------------- retry

describe("retry", () => {
  it("after a live failure retries the lookup then the live call once more, re-using the same upload", async () => {
    const failure = Object.assign(new Error("x"), { data: { code: "EXTRACTION_FAILED", retryable: true } });
    const extract = vi.fn<NonNullable<FlowDeps["extract"]>>().mockRejectedValueOnce(failure).mockResolvedValueOnce(liveOutcome());
    const deps = replayDeps(server(), { extract }), flow = newFlow(deps);
    await flow.analyze();
    expect(flow.getSnapshot()).toMatchObject({ phase: "failed", uploaded: true });
    await flow.analyze();
    expect(deps.upload).toHaveBeenCalledTimes(1);
    expect(deps.prepareImage).toHaveBeenCalledTimes(1);
    expect(deps.loadDemo).toHaveBeenCalledTimes(2);
    expect(extract).toHaveBeenCalledTimes(2);
    expect(flow.getSnapshot().phase).toBe("done");
  });
  it("editing the context between tries changes the key, so a capture for the new context is found without re-uploading", async () => {
    const f = capture(await imageKey({ caption: "Happy hour" })), deps = replayDeps(server(f)), flow = newFlow(deps);
    await flow.analyze(); // no caption: miss, live
    expect(offers(flow)[0].cached).toBeUndefined();
    flow.setContext({ caption: "Happy hour" });
    await flow.analyze();
    expect(offers(flow)[1].cached).toBeDefined();
    expect(deps.upload).toHaveBeenCalledTimes(1);
  });
  it("picking a different image discards the old key material: the old capture no longer matches", async () => {
    const f = capture(await imageKey()), deps = replayDeps(server(f)), flow = newFlow(deps);
    await flow.analyze();
    expect(offers(flow)[0].cached).toBeDefined();
    flow.selectFile(source(bytes("a-different-original-image"), "other.png"));
    await flow.analyze();
    expect(offers(flow)[1].cached).toBeUndefined();
    expect(deps.upload).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------- cancel and non-settling lookups

describe("cancel and slow lookups", () => {
  it("cancel during the lookup suppresses BOTH the late cache result and the live fallback", async () => {
    const gate = deferred<Awaited<ReturnType<NonNullable<FlowDeps["loadDemo"]>>>>();
    const deps = replayDeps(server(), { loadDemo: vi.fn(() => gate.promise) }), flow = newFlow(deps);
    const run = flow.analyze();
    await vi.waitFor(() => expect(deps.loadDemo).toHaveBeenCalled());
    expect(flow.getSnapshot()).toMatchObject({ phase: "extracting", cacheLookup: true });
    flow.cancel();
    expect(flow.getSnapshot()).toMatchObject({ phase: "canceled", cacheLookup: false });
    gate.resolve({ status: "hit", outcome: outcome(), provenance: { kind: "live-provider-capture", capturedAt: "2026-10-04T07:00:00Z", evidenceReference: "x", model: "synthetic-model" } });
    await run;
    await flush();
    expect(offers(flow)).toEqual([]);
    expect(deps.extract).not.toHaveBeenCalled();
    expect(flow.getSnapshot().phase).toBe("canceled");
  });
  it("a late MISS after cancel does not start the live fallback", async () => {
    const gate = deferred<Awaited<ReturnType<NonNullable<FlowDeps["loadDemo"]>>>>();
    const deps = replayDeps(server(), { loadDemo: vi.fn(() => gate.promise) }), flow = newFlow(deps);
    const run = flow.analyze();
    await vi.waitFor(() => expect(deps.loadDemo).toHaveBeenCalled());
    flow.cancel();
    gate.resolve({ status: "miss", reason: "missing" });
    await run;
    expect(deps.extract).not.toHaveBeenCalled();
    expect(flow.getSnapshot().error).toBeNull();
  });
  it("unmount (detach) during the lookup also stops everything", async () => {
    const gate = deferred<Awaited<ReturnType<NonNullable<FlowDeps["loadDemo"]>>>>();
    const deps = replayDeps(server(), { loadDemo: vi.fn(() => gate.promise) }), flow = newFlow(deps);
    const detach = flow.attach();
    const run = flow.analyze();
    await vi.waitFor(() => expect(deps.loadDemo).toHaveBeenCalled());
    detach();
    gate.resolve({ status: "miss", reason: "missing" });
    await run;
    expect(deps.extract).not.toHaveBeenCalled();
    expect(offers(flow)).toEqual([]);
  });
  it("a lookup that never settles is bounded by the controller's own deadline, then the live call runs once", async () => {
    vi.useFakeTimers();
    const deps = replayDeps(server(), { loadDemo: vi.fn(() => new Promise<never>(() => {})) }), flow = newFlow(deps);
    const run = flow.analyze();
    await vi.waitFor(() => expect(deps.loadDemo).toHaveBeenCalled()); // hashing is real async work; the deadline starts after it
    await vi.advanceTimersByTimeAsync(DEMO_LOOKUP_DEADLINE_MS + 1);
    await run;
    expect(deps.extract).toHaveBeenCalledTimes(1);
    expect(offers(flow)[0].cached).toBeUndefined();
    expect(flow.getSnapshot()).toMatchObject({ phase: "done", cacheLookup: false });
  });
  it("a non-settling real loader transport (stalled headers) falls back via the loader's own bound", async () => {
    vi.useFakeTimers();
    const stalled = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const deps = replayDeps(stalled), flow = newFlow(deps);
    const run = flow.analyze();
    await vi.waitFor(() => expect(stalled).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(DEMO_LOOKUP_DEADLINE_MS + 1);
    await run;
    expect(deps.extract).toHaveBeenCalledTimes(1);
    expect(stalled.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("cancel aborts the in-flight loader request signal", async () => {
    const stalled = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const deps = replayDeps(stalled), flow = newFlow(deps);
    void flow.analyze();
    await vi.waitFor(() => expect(stalled).toHaveBeenCalled());
    flow.cancel();
    expect(stalled.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(deps.extract).not.toHaveBeenCalled();
  });
});

// ----------------------------------------------- receipts, uploads and manual edits

describe("real receipts and ownership are never bypassed", () => {
  it("does not look up any capture when the upload fails or no token is available: no invented receipts", async () => {
    const f = capture(await imageKey());
    for (const over of [
      { upload: vi.fn(async (): Promise<ImageUploadOutcome> => ({ ok: false, reason: "rejected" })) },
      { getToken: vi.fn(async () => null) },
    ]) {
      const fetcher = server(f), deps = replayDeps(fetcher, over as Partial<FlowDeps>), flow = newFlow(deps);
      await flow.analyze();
      expect(flow.getSnapshot().phase).toBe("failed");
      expect(deps.loadDemo).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
      expect(offers(flow)).toEqual([]);
    }
  });
  it("a cached offer's image is the real upload receipt; the published deal references it, and unowned ids are refused", async () => {
    const deps = replayDeps(server(capture(await imageKey()))), flow = newFlow(deps);
    await flow.analyze();
    const offer = offers(flow)[0];
    const applied = flow.applyOffer(offer.id, 0, { kind: "add" });
    expect(applied.ok).toBe(true);
    const key = (applied as { formKey: string }).formKey;
    expect(flow.getSnapshot().forms.find((x) => x.key === key)!.draft.imageId).toBe("storage_id_1_abcdefgh");
    // Not publishable until the user reviews everything and confirms a location (the canonical gate is unchanged).
    const result = await flow.publish(key);
    expect(result.ok).toBe(false);
    expect(deps.createDeal).not.toHaveBeenCalled();
  });
  it("manual edits are never overwritten: the cached offer waits, and replacing an edited form needs confirmation", async () => {
    const deps = replayDeps(server(capture(await imageKey()))), flow = newFlow(deps);
    flow.dispatch("form-1", { type: "SET_FIELD", field: "restaurant", value: "My own place" } as never);
    const before = structuredClone(flow.getSnapshot().forms[0].draft);
    await flow.analyze();
    expect(flow.getSnapshot().forms[0].draft).toEqual(before);
    const offer = offers(flow)[0];
    expect(flow.applyOffer(offer.id, 0, { kind: "replace", formKey: "form-1" })).toEqual({ ok: false, reason: "confirm_required" });
    expect(flow.getSnapshot().forms[0].draft).toEqual(before);
  });
});

// ---------------------------------------------------------------- recordings

describe("screen-recording source (exactly four actual frames; no video or audio claim)", () => {
  const recordingFile = () => new File([RECORDING as BlobPart], "synthetic-screen-recording.mov", { type: "video/quicktime" });
  const flowFor = (deps: ReturnType<typeof makeDeps>) => { const flow = new ImageDraftFlow(deps as unknown as FlowDeps); flow.setDemoReplay(true); flow.selectRecording(recordingFile()); return flow; };
  it("matches only the original recording plus its four frames in order, uploads four distinct receipts, and labels the offer a recording", async () => {
    const deps = replayDeps(server(capture(await recordingKey())), {}), flow = flowFor(deps);
    await flow.analyze();
    expect(deps.extract).not.toHaveBeenCalled();
    expect(deps.upload).toHaveBeenCalledTimes(4);
    const [offer] = offers(flow);
    expect(offer).toMatchObject({ source: "recording", imageId: null, cached: expect.any(Object) });
    expect(new Set(offer.imageIds).size).toBe(4);
    expect(offer.drafts[0].imageId).toBeNull(); // a frame is never attached as the deal photo
    expect(cachedOfferNote(offer.cached!, "recording")).toMatch(/4 frames/);
    expect(cachedOfferNote(offer.cached!, "recording")).toMatch(/no audio or video was analyzed/);
  });
  it("frame ORDER matters: the same frames reordered is a miss and the live path runs once", async () => {
    const reordered = [FRAMES[1], FRAMES[0], FRAMES[2], FRAMES[3]];
    const deps = replayDeps(server(capture(await recordingKey(reordered))), {}), flow = flowFor(deps);
    await flow.analyze();
    expect(deps.extract).toHaveBeenCalledTimes(1);
    expect(offers(flow)[0].cached).toBeUndefined();
  });
  it("a different frame, a different recording or a different prompt version is a miss", async () => {
    for (const key of [
      await recordingKey([FRAMES[0], FRAMES[1], FRAMES[2], bytes("synthetic-other-frame")]),
      await recordingKey(FRAMES, "synthetic-older-prompt"),
      await demoKey({ original: bytes("another-recording"), images: FRAMES.map((f) => ({ bytes: f, mimeType: "image/jpeg" })), promptVersion: PV }),
    ]) {
      const deps = replayDeps(server(capture(key)), {}), flow = flowFor(deps);
      await flow.analyze();
      expect(deps.extract).toHaveBeenCalledTimes(1);
      expect(offers(flow)[0].cached).toBeUndefined();
    }
  });
  it("an image-key capture never matches a recording of the same original bytes", async () => {
    const asImage = capture(await demoKey({ original: RECORDING, images: [{ bytes: PREPARED, mimeType: "image/jpeg" }], promptVersion: PV }));
    const deps = replayDeps(server(asImage), {}), flow = flowFor(deps);
    await flow.analyze();
    expect(deps.extract).toHaveBeenCalledTimes(1);
  });
});

// ------------------------------------------------------------ key material

describe("key material and bounds", () => {
  it("demoKeyFromMaterial reproduces demoKey exactly, and only hashes are kept", async () => {
    const material = await demoMaterial(ORIGINAL, [{ bytes: PREPARED, mimeType: "image/jpeg" }]);
    expect(Object.keys(material).sort()).toEqual(["images", "sourceSha256"]);
    expect(JSON.stringify(material)).not.toContain("synthetic-resized");
    expect(await demoKeyFromMaterial(material, { caption: "c", text: "t" }, PV)).toEqual(await imageKey({ caption: "c", text: "t" }));
  });
  it("buildDemoMaterial returns null (no cache, never a throw) for unreadable, empty or oversized sources", async () => {
    expect(await buildDemoMaterial({} as never, [jpeg(PREPARED)])).toBeNull();
    expect(await buildDemoMaterial(source(new Uint8Array()), [jpeg(PREPARED)])).toBeNull();
    expect(await buildDemoMaterial(source(new Uint8Array(20 * 1024 * 1024 + 1)), [jpeg(PREPARED)])).toBeNull();
    expect(await buildDemoMaterial(source(), [jpeg(new Uint8Array(5 * 1024 * 1024 + 1))])).toBeNull();
    expect(await buildDemoMaterial(source(), [])).toBeNull();
    expect(await buildDemoMaterial(source(), [jpeg(PREPARED)])).not.toBeNull();
  });
  it("a source that cannot be hashed (plain-object file) just has no cache: live extraction, no error", async () => {
    const deps = replayDeps(server(capture(await imageKey()))), flow = new ImageDraftFlow(deps as unknown as FlowDeps);
    flow.setDemoReplay(true);
    flow.selectFile({ name: "menu.png", type: "image/png", size: 2048 } as unknown as File);
    await flow.analyze();
    expect(deps.loadDemo).not.toHaveBeenCalled();
    expect(deps.extract).toHaveBeenCalledTimes(1);
    expect(flow.getSnapshot().phase).toBe("done");
  });
  it("cached copy never claims a live analysis, confirmation or an unknown date", () => {
    const note = cachedOfferNote({ capturedAt: "garbage", evidenceReference: "r", model: "m" }, "image");
    expect(note).toMatch(/did not call the live service/);
    expect(note).toMatch(/needs your review/);
    expect(note).toMatch(/an earlier date/);
  });
});
