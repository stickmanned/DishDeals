// Pure helpers for the screen-recording frame source of the canonical post flow (T-14B).
//
// A user-selected local screen recording is decoded in the browser by the existing `grabFrames`
// (lib/image.ts) into exactly RECORDING_FRAME_COUNT bounded JPEG frames. Those frames are then uploaded and
// analyzed by the SAME ImageDraftFlow controller as a screenshot: this module holds only the checks, the
// decoder adapter and the fixed copy. It never uploads, never calls a model and never touches the DOM itself.
//
// Honesty: frames are still images. They carry no audio and nothing here infers speech from them. This is
// the screenshot path fed by a recording; it is NOT the primary Reel video/audio analysis (/reels), and a
// pass here says nothing about that path. No real recording was decoded by any test in this repo.
import { MAX_IMAGE_BYTES, type ImageChoice } from "./dealImageUpload";
import { grabFrames, MAX_INPUT_BYTES, validateVideoSource, type GrabFramesOptions } from "./image";

export const RECORDING_FRAME_COUNT = 4;
export const MAX_RECORDING_BYTES = MAX_INPUT_BYTES;

export type RecordingCheck = { ok: true } | { ok: false; code: "empty" | "too_large" | "unsupported"; message: string };

/** Cheap pre-decode check of the picked file (size and container). Decoding can still fail later. */
export function checkRecordingFile(file: ImageChoice | null | undefined): RecordingCheck {
  if (!file || !Number.isFinite(file.size) || file.size <= 0) return { ok: false, code: "empty", message: "That recording is empty. Choose another." };
  if (file.size > MAX_RECORDING_BYTES) {
    return { ok: false, code: "too_large", message: `That recording is larger than ${MAX_RECORDING_BYTES / 1048576} MB. Trim it or choose a shorter one.` };
  }
  const verdict = validateVideoSource(file as unknown as Blob, RECORDING_FRAME_COUNT);
  if (!verdict.valid) return { ok: false, code: "unsupported", message: "Choose a screen recording in MP4, MOV or WebM format." };
  return { ok: true };
}

export class RecordingFrameError extends Error {
  constructor(readonly code: "wrong_count" | "bad_frame", message: string) {
    super(message);
    this.name = "RecordingFrameError";
  }
}

/**
 * The decoder must hand back exactly four non-empty JPEGs within the upload bound. Anything else is rejected
 * whole: four are never claimed while fewer (or a padded/duplicated set) were produced.
 */
export function namedFrames(frames: unknown): (Blob & ImageChoice)[] {
  if (!Array.isArray(frames) || frames.length !== RECORDING_FRAME_COUNT) {
    throw new RecordingFrameError("wrong_count", `Expected exactly ${RECORDING_FRAME_COUNT} frames.`);
  }
  const seen = new Set<unknown>();
  return frames.map((frame, i) => {
    const blob = frame as Blob | null;
    if (!blob || seen.has(blob) || blob.type !== "image/jpeg" || !(blob.size > 0) || blob.size > MAX_IMAGE_BYTES) {
      throw new RecordingFrameError("bad_frame", `Frame ${i + 1} is not a usable JPEG.`);
    }
    seen.add(blob);
    return new File([blob], `frame-${i + 1}.jpg`, { type: "image/jpeg" });
  });
}

/** Browser adapter for FlowDeps.prepareFrames: the existing grabFrames, then the exact-four check. */
export async function prepareRecordingFrames(
  file: File,
  signal: AbortSignal,
  grab: (video: Blob, count: number, options?: GrabFramesOptions) => Promise<Blob[]> = grabFrames,
): Promise<(Blob & ImageChoice)[]> {
  return namedFrames(await grab(file, RECORDING_FRAME_COUNT, { signal }));
}

/**
 * What the chooser says about the selected recording. Claims about frames are made only for work that has
 * happened: before analysis it is only "selected"; "four frames uploaded" needs all four real receipts
 * (`uploaded` is the controller's receipt flag, never set by picking a file).
 */
export function recordingSelectionLine(name: string, sizeBytes: number, uploaded: boolean): string {
  const base = `${name} · ${(sizeBytes / 1048576).toFixed(1)} MB · recording selected`;
  return uploaded
    ? `${base} · ${RECORDING_FRAME_COUNT} frames taken and uploaded`
    : `${base} · ${RECORDING_FRAME_COUNT} frames will be taken when you ask for suggestions`;
}

export const RECORDING_COPY = {
  heading: "Or a screen recording (optional)",
  explain:
    "When you ask for suggestions, four still frames are taken from the recording on your device, uploaded to your account, and read together as images. Audio is not analyzed here: add anything that was said in the extra text box. This is not the Reel video analysis.",
  decoding: "Taking four frames from your recording…",
  uploading: (done: number, total: number) => `Uploading frame ${Math.min(done + 1, total)} of ${total}…`,
  extracting: "Reading the four frames. This can take a little while.",
  unreadable: "That recording could not be read or turned into four frames. Try a shorter MP4 or MOV screen recording.",
  unsupportedHere: "Screen recordings are not supported in this build. Use a screenshot, or fill in the form by hand.",
} as const;
