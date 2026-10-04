// Synthetic replay tests for the screen-recording frame source (T-14B).
// The decoder, upload, token and extract calls are injected fakes: no browser, no real recording, no
// canvas, no Convex deployment, provider, network or phone. The "recordings" and "frames" below are
// labeled stand-ins; nothing here shows that a real 10 s clip decodes or that a model reads real frames.
import { describe, expect, it, vi, type Mock } from "vitest";
import { ImageDraftFlow, type FlowDeps } from "../../lib/imageDraftFlow";
import type { ExtractOutcome } from "../../lib/extractCore";
import type { ImageUploadOutcome } from "../../lib/dealImageUpload";
import {
  checkRecordingFile,
  namedFrames,
  prepareRecordingFrames,
  recordingSelectionLine,
  RecordingFrameError,
  RECORDING_FRAME_COUNT,
} from "../../lib/recordingFrameFlow";

// ----------------------------------------------------------------- fixtures

const recording = (name = "synthetic-screen-recording.mov", type = "video/quicktime", size = 4096) => ({ name, type, size }) as unknown as File;
const image = (name = "menu.png") => ({ name, type: "image/png", size: 2048 }) as unknown as File;
const frame = (type = "image/jpeg", size = 1000) => ({ type, size }) as unknown as Blob;
const frames = (n = RECORDING_FRAME_COUNT) =>
  Array.from({ length: n }, (_, i) => ({ name: `frame-${i + 1}.jpg`, type: "image/jpeg", size: 1000 + i })) as unknown as (Blob & { name: string; type: string; size: number })[];
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

const outcome = (): ExtractOutcome =>
  ({
    result: {
      isDeal: true,
      deals: [
        {
          restaurant: "Synthetic Diner",
          address: "1 Fixture St, Vancouver",
          dealText: "Synthetic combo",
          priceCad: 9.5,
          validDays: [],
          validStart: null,
          validEnd: null,
          expiresOn: null,
          conditions: [],
          confidence: { restaurant: 0.9, priceCad: 0.8, hours: 0.5, expiresOn: 0.3 },
        },
      ],
    },
    manualReview: [],
    requiresBlockingReview: false,
    model: "synthetic-model",
  }) as unknown as ExtractOutcome;

function makeDeps(over: Partial<FlowDeps> = {}) {
  let n = 0;
  const deps = {
    prepareImage: vi.fn(async () => ({ name: "deal.jpg", type: "image/jpeg", size: 1000 }) as unknown as Blob & { name: string; type: string; size: number }),
    prepareFrames: vi.fn(async () => frames()),
    getToken: vi.fn(async () => "synthetic-token"),
    generateUploadUrl: vi.fn(async () => "https://example.convex.site/deal-image"),
    upload: vi.fn(async (): Promise<ImageUploadOutcome> => {
      n += 1;
      return { ok: true, storageId: `frame_id_${n}_abcdefgh` };
    }),
    extract: vi.fn(async (): Promise<unknown> => outcome()),
    createDeal: vi.fn(async (): Promise<unknown> => "deal_id_abcdefghij"),
    ...over,
  };
  return deps as unknown as { [K in keyof FlowDeps]-?: Mock<NonNullable<FlowDeps[K]>> };
}

const withRecording = (over: Partial<FlowDeps> = {}) => {
  const deps = makeDeps(over);
  const flow = new ImageDraftFlow(deps as unknown as FlowDeps);
  flow.selectRecording(recording());
  return { deps, flow };
};
const ids = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `frame_id_${from + i}_abcdefgh`);

// ------------------------------------------------------------ pure helpers

describe("checkRecordingFile", () => {
  it.each([
    ["clip.mp4", "video/mp4"],
    ["clip.mov", "video/quicktime"],
    ["clip.webm", "video/webm"],
    ["clip.mov", ""],
  ])("accepts %s (%s)", (name, type) => expect(checkRecordingFile({ name, type, size: 10 }).ok).toBe(true));

  it("rejects empty, oversize, images and unknown containers", () => {
    expect(checkRecordingFile({ name: "a.mov", type: "video/quicktime", size: 0 })).toMatchObject({ ok: false, code: "empty" });
    expect(checkRecordingFile({ name: "a.mov", type: "video/quicktime", size: 21 * 1024 * 1024 })).toMatchObject({ ok: false, code: "too_large" });
    expect(checkRecordingFile({ name: "a.png", type: "image/png", size: 10 })).toMatchObject({ ok: false, code: "unsupported" });
    expect(checkRecordingFile({ name: "a.xyz", type: "", size: 10 })).toMatchObject({ ok: false, code: "unsupported" });
    expect(checkRecordingFile(null)).toMatchObject({ ok: false, code: "empty" });
  });
});

describe("recordingSelectionLine", () => {
  it("claims nothing is produced until the controller has all four receipts", async () => {
    const before = recordingSelectionLine("clip.mov", 1048576, false);
    expect(before).toMatch(/recording selected/);
    expect(before).toMatch(/will be taken/);
    expect(before).not.toMatch(/uploaded/);
    expect(recordingSelectionLine("clip.mov", 1048576, true)).toMatch(/4 frames taken and uploaded/);

    // The flag the UI passes is the controller's: false after picking, after a failed decode, true only after receipts.
    const bad = withRecording({ prepareFrames: vi.fn(async () => frames(3)) as unknown as FlowDeps["prepareFrames"] });
    expect(bad.flow.getSnapshot().uploaded).toBe(false);
    await bad.flow.analyze();
    expect(bad.flow.getSnapshot().uploaded).toBe(false);
    const good = withRecording();
    await good.flow.analyze();
    expect(good.flow.getSnapshot().uploaded).toBe(true);
  });
});

describe("namedFrames", () => {
  it("returns four named JPEG files", () => {
    const named = namedFrames([frame(), frame(), frame(), frame()]);
    expect(named.map((f) => f.name)).toEqual(["frame-1.jpg", "frame-2.jpg", "frame-3.jpg", "frame-4.jpg"]);
    expect(named.every((f) => f.type === "image/jpeg")).toBe(true);
  });

  it("rejects anything but exactly four usable frames", () => {
    for (const n of [0, 1, 3, 5]) expect(() => namedFrames(Array.from({ length: n }, () => frame()))).toThrow(RecordingFrameError);
    expect(() => namedFrames("nope")).toThrow(RecordingFrameError);
    expect(() => namedFrames([frame(), frame(), frame(), frame("image/png")])).toThrow(/Frame 4/);
    expect(() => namedFrames([frame(), frame(), frame(), frame("image/jpeg", 0)])).toThrow(RecordingFrameError);
    expect(() => namedFrames([frame(), frame(), frame(), frame("image/jpeg", 6 * 1024 * 1024)])).toThrow(RecordingFrameError);
    const same = frame();
    expect(() => namedFrames([same, same, frame(), frame()])).toThrow(/Frame 2/); // never pad four from fewer
  });
});

describe("prepareRecordingFrames (production adapter)", () => {
  it("calls the grabFrames contract with count 4 and the abort signal, then enforces four", async () => {
    const grab = vi.fn(async () => [frame(), frame(), frame(), frame()]);
    const controller = new AbortController();
    const out = await prepareRecordingFrames(recording(), controller.signal, grab);
    expect(out).toHaveLength(4);
    expect(grab).toHaveBeenCalledWith(expect.anything(), 4, { signal: controller.signal });
    await expect(prepareRecordingFrames(recording(), controller.signal, async () => [frame()])).rejects.toThrow(RecordingFrameError);
  });

  it("propagates decoder failures and the real grabFrames refuses outside a browser", async () => {
    await expect(prepareRecordingFrames(recording(), new AbortController().signal, async () => { throw new Error("corrupt"); })).rejects.toThrow("corrupt");
    await expect(prepareRecordingFrames(recording(), new AbortController().signal)).rejects.toThrow(/browser/);
  });
});

// ------------------------------------------------------------- flow: happy

describe("recording source through the canonical controller", () => {
  it("uploads all four frames, analyzes them in one extract call and attaches no frame as the photo", async () => {
    const { deps, flow } = withRecording();
    flow.setContext({ caption: "cap", text: "someone says half price after 9pm", provenanceUrl: "https://example.invalid/reel", publishedAt: "2026-10-01" });
    const phases: string[] = [];
    flow.subscribe(() => phases.push(`${flow.getSnapshot().phase}:${flow.getSnapshot().progress?.done ?? "-"}`));
    await flow.analyze();

    expect(deps.prepareFrames).toHaveBeenCalledTimes(1);
    expect(deps.upload).toHaveBeenCalledTimes(4);
    expect(deps.generateUploadUrl).toHaveBeenCalledTimes(4);
    expect(deps.extract).toHaveBeenCalledTimes(1);
    expect(deps.extract).toHaveBeenCalledWith({
      imageIds: ids(4),
      caption: "cap",
      text: "someone says half price after 9pm", // the user's own words; nothing is inferred from the frames
      provenanceUrl: "https://example.invalid/reel",
      publishedAt: "2026-10-01",
    });
    expect(deps.upload.mock.calls.map((c) => (c as unknown[])[0] as { file: { name: string } }).map((a) => a.file.name)).toEqual(["frame-1.jpg", "frame-2.jpg", "frame-3.jpg", "frame-4.jpg"]);

    const snap = flow.getSnapshot();
    expect(snap.phase).toBe("done");
    expect(snap.progress).toBeNull();
    expect(snap.uploaded).toBe(true);
    expect(phases).toContain("uploading:0");
    expect(phases).toContain("uploading:3");
    expect(snap.offers[0]).toMatchObject({ source: "recording", imageId: null, imageIds: ids(4), imageName: "synthetic-screen-recording.mov", model: "synthetic-model" });
    expect(snap.offers[0].drafts[0].imageId).toBeNull();
    expect(snap.forms[0].draft.imageId).toBeNull(); // nothing applied until the user chooses
  });

  it("applies the common editable offer and publishes through the unchanged confirmed gate, without an image", async () => {
    const { deps, flow } = withRecording();
    await flow.analyze();
    const applied = flow.applyOffer(flow.getSnapshot().offers[0].id, 0, { kind: "replace", formKey: "form-1" });
    expect(applied.ok).toBe(true);
    // Unreviewed suggestions cannot be published: same canonical gate as screenshots.
    const blocked = await flow.publish("form-1");
    expect(blocked.ok).toBe(false);
    expect(deps.createDeal).not.toHaveBeenCalled();
  });

  it("a screenshot still sends exactly one image id and the recording is cleared by it", async () => {
    const deps = makeDeps();
    const flow = new ImageDraftFlow(deps as unknown as FlowDeps);
    flow.selectRecording(recording());
    flow.selectFile(image());
    expect(flow.getSnapshot().source.recording).toBeNull();
    await flow.analyze();
    expect(deps.prepareFrames).not.toHaveBeenCalled();
    expect(deps.prepareImage).toHaveBeenCalledTimes(1);
    expect((deps.extract.mock.calls[0][0] as { imageIds: string[] }).imageIds).toEqual(ids(1));
    expect(flow.getSnapshot().offers[0]).toMatchObject({ source: "image", imageId: ids(1)[0], imageIds: ids(1) });
    flow.selectRecording(recording());
    expect(flow.getSnapshot().source.file).toBeNull();
  });

  it("an invalid recording pick keeps the previous selection and says why", () => {
    const { flow } = withRecording();
    flow.selectRecording({ name: "x.png", type: "image/png", size: 10 } as unknown as File);
    const s = flow.getSnapshot().source;
    expect(s.recording?.name).toBe("synthetic-screen-recording.mov");
    expect(s.recordingError).toMatch(/MP4/);
    flow.selectRecording(null);
    expect(flow.getSnapshot().source.recording).toBeNull();
  });

  it("runs only once at a time (single flight)", async () => {
    const gate = deferred<(Blob & { name: string; type: string; size: number })[]>();
    const { deps, flow } = withRecording({ prepareFrames: vi.fn(() => gate.promise) as unknown as FlowDeps["prepareFrames"] });
    const first = flow.analyze();
    await flow.analyze();
    gate.resolve(frames());
    await first;
    expect(deps.prepareFrames).toHaveBeenCalledTimes(1);
    expect(deps.extract).toHaveBeenCalledTimes(1);
  });
});

// ----------------------------------------------------------------- failures

describe("failures keep edits and source", () => {
  const typed = (flow: ImageDraftFlow) => flow.dispatch("form-1", { type: "SET_FIELD", field: "restaurant", value: "Typed By Hand" });
  const restaurant = (flow: ImageDraftFlow) => flow.getSnapshot().forms[0].draft.fields.restaurant.value;

  it("decode failure: no upload, fixed copy, edits and recording kept", async () => {
    const { deps, flow } = withRecording({ prepareFrames: vi.fn(async () => { throw new Error("Failed to load video: sk-secret"); }) as unknown as FlowDeps["prepareFrames"] });
    typed(flow);
    await flow.analyze();
    const snap = flow.getSnapshot();
    expect(snap.phase).toBe("failed");
    expect(snap.error?.code).toBe("RECORDING_UNREADABLE");
    expect(snap.error?.message).not.toMatch(/sk-secret/);
    expect(deps.upload).not.toHaveBeenCalled();
    expect(snap.source.recording).not.toBeNull();
    expect(restaurant(flow)).toBe("Typed By Hand");
  });

  it.each([[0], [3], [5]])("a decoder returning %i frames is rejected before any upload", async (n) => {
    const { deps, flow } = withRecording({ prepareFrames: vi.fn(async () => frames(n)) as unknown as FlowDeps["prepareFrames"] });
    await flow.analyze();
    expect(flow.getSnapshot().error?.code).toBe("RECORDING_UNREADABLE");
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it("a non-JPEG or oversize frame is rejected before any upload", async () => {
    const bad = frames();
    (bad[2] as unknown as { type: string }).type = "image/png";
    const big = frames();
    (big[0] as unknown as { size: number }).size = 6 * 1024 * 1024;
    for (const set of [bad, big]) {
      const { deps, flow } = withRecording({ prepareFrames: vi.fn(async () => set) as unknown as FlowDeps["prepareFrames"] });
      await flow.analyze();
      expect(flow.getSnapshot().phase).toBe("failed");
      expect(deps.upload).not.toHaveBeenCalled();
    }
  });

  it("without a frame decoder the recording is honestly unsupported", async () => {
    const deps = makeDeps();
    delete (deps as { prepareFrames?: unknown }).prepareFrames;
    const flow = new ImageDraftFlow(deps as unknown as FlowDeps);
    flow.selectRecording(recording());
    await flow.analyze();
    expect(flow.getSnapshot().error).toMatchObject({ code: "RECORDING_UNSUPPORTED", retryable: false });
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it("signed out stops before any upload", async () => {
    const { deps, flow } = withRecording({ getToken: vi.fn(async () => null) });
    await flow.analyze();
    expect(flow.getSnapshot().error?.code).toBe("AUTH");
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it("a failed frame upload fails the run with no partial receipt; retry decodes and uploads all four again", async () => {
    let call = 0;
    const upload = vi.fn(async (): Promise<ImageUploadOutcome> => {
      call += 1;
      return call === 3 ? { ok: false, reason: "network" } : { ok: true, storageId: `frame_id_${call}_abcdefgh` };
    });
    const { deps, flow } = withRecording({ upload });
    typed(flow);
    await flow.analyze();
    expect(flow.getSnapshot()).toMatchObject({ phase: "failed", uploaded: false, progress: null });
    expect(flow.getSnapshot().error?.code).toBe("UPLOAD_NETWORK");
    expect(deps.extract).not.toHaveBeenCalled();
    expect(restaurant(flow)).toBe("Typed By Hand");

    await flow.analyze();
    expect(deps.prepareFrames).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledTimes(3 + 4);
    expect((deps.extract.mock.calls[0][0] as { imageIds: string[] }).imageIds).toEqual(["frame_id_4_abcdefgh", "frame_id_5_abcdefgh", "frame_id_6_abcdefgh", "frame_id_7_abcdefgh"]);
    expect(flow.getSnapshot().phase).toBe("done");
  });

  it("four receipts must be distinct real ids", async () => {
    const upload = vi.fn(async (): Promise<ImageUploadOutcome> => ({ ok: true, storageId: "same_id_abcdefgh" }));
    const { deps, flow } = withRecording({ upload });
    await flow.analyze();
    expect(flow.getSnapshot().error?.code).toBe("UPLOAD_UNCONFIRMED");
    expect(flow.getSnapshot().uploaded).toBe(false);
    expect(deps.extract).not.toHaveBeenCalled();

    const garbage = vi.fn(async (): Promise<ImageUploadOutcome> => ({ ok: true, storageId: "x" }));
    const second = withRecording({ upload: garbage });
    await second.flow.analyze();
    expect(second.flow.getSnapshot().error?.code).toBe("UPLOAD_UNCONFIRMED");
    expect(second.deps.extract).not.toHaveBeenCalled();
  });

  it("an extract failure keeps the four receipts: retry only re-analyzes the same four ids", async () => {
    const extract = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("boom"), { data: { code: "EXTRACTION_FAILED", retryable: true } }))
      .mockResolvedValueOnce(outcome());
    const { deps, flow } = withRecording({ extract });
    await flow.analyze();
    expect(flow.getSnapshot()).toMatchObject({ phase: "failed", uploaded: true });
    await flow.analyze();
    expect(deps.prepareFrames).toHaveBeenCalledTimes(1);
    expect(deps.upload).toHaveBeenCalledTimes(4);
    expect(extract.mock.calls[1][0]).toMatchObject({ imageIds: ids(4) });
    expect(flow.getSnapshot().phase).toBe("done");
  });

  it("when a frame is no longer available the receipts are dropped and a retry starts over", async () => {
    const extract = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("gone"), { data: { code: "IMAGE_NOT_AVAILABLE", retryable: true } }))
      .mockResolvedValueOnce(outcome());
    const { deps, flow } = withRecording({ extract });
    await flow.analyze();
    expect(flow.getSnapshot().uploaded).toBe(false);
    await flow.analyze();
    expect(deps.prepareFrames).toHaveBeenCalledTimes(2);
    expect(deps.upload).toHaveBeenCalledTimes(8);
  });
});

// ------------------------------------------------------ cancel and late output

describe("cancel, source switch and late results", () => {
  it("cancel during decode aborts the decoder signal and ignores its late frames", async () => {
    const gate = deferred<(Blob & { name: string; type: string; size: number })[]>();
    let signal!: AbortSignal;
    const { deps, flow } = withRecording({
      prepareFrames: vi.fn((_f: File, s: AbortSignal) => {
        signal = s;
        return gate.promise;
      }) as unknown as FlowDeps["prepareFrames"],
    });
    flow.dispatch("form-1", { type: "SET_FIELD", field: "restaurant", value: "Typed By Hand" });
    const run = flow.analyze();
    await flush();
    expect(flow.getSnapshot().phase).toBe("preparing");
    flow.cancel();
    expect(signal.aborted).toBe(true);
    expect(flow.getSnapshot().phase).toBe("canceled");
    gate.resolve(frames()); // late output of the canceled run
    await run;
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.extract).not.toHaveBeenCalled();
    expect(flow.getSnapshot()).toMatchObject({ phase: "canceled", offers: [], progress: null });
    expect(flow.getSnapshot().forms[0].draft.fields.restaurant.value).toBe("Typed By Hand");
    expect(flow.getSnapshot().source.recording).not.toBeNull();
  });

  it("cancel mid-upload stops after the in-flight frame; no extract, no offer, no resurrected state", async () => {
    const gate = deferred<ImageUploadOutcome>();
    let call = 0;
    const upload = vi.fn((): Promise<ImageUploadOutcome> => {
      call += 1;
      return call === 2 ? gate.promise : Promise.resolve({ ok: true, storageId: `frame_id_${call}_abcdefgh` });
    });
    const { deps, flow } = withRecording({ upload });
    const run = flow.analyze();
    await flush();
    expect(flow.getSnapshot().progress).toEqual({ done: 1, total: 4 });
    flow.cancel();
    gate.resolve({ ok: true, storageId: "frame_id_2_abcdefgh" });
    await run;
    expect(upload).toHaveBeenCalledTimes(2);
    expect(deps.extract).not.toHaveBeenCalled();
    expect(flow.getSnapshot()).toMatchObject({ phase: "canceled", offers: [], uploaded: false, progress: null });
  });

  it("a canceled run's late extract result is ignored; a fresh run is independent", async () => {
    const gate = deferred<unknown>();
    const extract = vi.fn().mockReturnValueOnce(gate.promise).mockResolvedValue(outcome());
    const { deps, flow } = withRecording({ extract });
    const first = flow.analyze();
    await flush();
    await flush();
    await flush();
    expect(flow.getSnapshot().phase).toBe("extracting");
    flow.cancel();
    gate.resolve(outcome());
    await first;
    expect(flow.getSnapshot().offers).toHaveLength(0);
    await flow.analyze(); // same recording, receipts kept: only analysis repeats
    expect(deps.prepareFrames).toHaveBeenCalledTimes(1);
    expect(flow.getSnapshot().offers).toHaveLength(1);
    expect(extract).toHaveBeenCalledTimes(2);
  });

  it("switching the source mid-run discards the old run's output", async () => {
    const gate = deferred<(Blob & { name: string; type: string; size: number })[]>();
    const { deps, flow } = withRecording({ prepareFrames: vi.fn(() => gate.promise) as unknown as FlowDeps["prepareFrames"] });
    const run = flow.analyze();
    await flush();
    flow.selectFile(image());
    gate.resolve(frames());
    await run;
    expect(deps.upload).not.toHaveBeenCalled();
    expect(flow.getSnapshot()).toMatchObject({ phase: "idle", offers: [], uploaded: false });
    expect(flow.getSnapshot().source.recording).toBeNull();
  });

  it("detaching (unmount) cancels the run and a later outcome is ignored", async () => {
    const gate = deferred<unknown>();
    const { deps, flow } = withRecording({ extract: vi.fn(() => gate.promise) as unknown as FlowDeps["extract"] });
    const detach = flow.attach();
    const run = flow.analyze();
    await flush();
    await flush();
    await flush();
    detach();
    gate.resolve(outcome());
    await run;
    expect(deps.extract).toHaveBeenCalledTimes(1);
    expect(flow.getSnapshot().offers).toHaveLength(0);
  });
});

// ------------------------------------------------------------ manual edits

describe("manual edits are never overwritten", () => {
  it("model output waits as an offer; replacing an edited form needs explicit confirmation", async () => {
    const { flow } = withRecording();
    flow.dispatch("form-1", { type: "SET_FIELD", field: "restaurant", value: "My Place" });
    flow.dispatch("form-1", { type: "SET_FIELD", field: "priceCad", value: 12 }); // typed price (partial text lives in the form component)
    await flow.analyze();
    const before = flow.getSnapshot().forms[0];
    expect(before.draft.fields.restaurant.value).toBe("My Place");
    expect(before.draft.fields.priceCad.value).toBe(12);
    expect(before.epoch).toBe(0);
    const offerId = flow.getSnapshot().offers[0].id;
    expect(flow.applyOffer(offerId, 0, { kind: "replace", formKey: "form-1" })).toEqual({ ok: false, reason: "confirm_required" });
    expect(flow.getSnapshot().forms[0].draft.fields.restaurant.value).toBe("My Place");
    expect(flow.applyOffer(offerId, 0, { kind: "add" })).toMatchObject({ ok: true });
    expect(flow.getSnapshot().forms).toHaveLength(2);
    expect(flow.getSnapshot().forms[0].draft.fields.restaurant.value).toBe("My Place");
  });

  it("the provenance link and recording survive a failed run and remain the offer's source", async () => {
    const extract = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValueOnce(outcome());
    const { flow } = withRecording({ extract });
    flow.setContext({ provenanceUrl: "https://example.invalid/reel" });
    await flow.analyze();
    expect(flow.getSnapshot().source.provenanceUrl).toBe("https://example.invalid/reel");
    await flow.analyze();
    expect(flow.getSnapshot().offers[0].drafts[0].sourceUrl).toBe("https://example.invalid/reel");
  });
});
