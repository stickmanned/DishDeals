// Pure controller for the canonical screenshot/flyer post flow (T-07C).
//
// No React, Convex, fetch or window access at import time: every backend call is injected through
// `FlowDeps`, so the same controller runs in the page (components/deals/CanonicalPost.tsx) and in the
// synthetic replay tests (tests/import/imageDraftFlow.test.ts). Nothing here logs, fetches a URL or
// stores anything outside memory.
//
// Contract (from the T-07C packet):
// - A selected file and its optional context are a SOURCE SELECTION. They are separate from any applied
//   draft. Applying a model offer is always an explicit, deliberate replace or add; results never
//   overwrite existing edits on their own.
// - A draft's image is the owned storage id of the upload that produced its offer (a real receipt from
//   the authenticated upload route), never "the latest pending file". Changing or clearing the source
//   does not change an applied draft's image, and applying another offer replaces the whole draft.
// - Every run has a generation. Cancel, source switch, retry or unmount invalidates it; a stale outcome,
//   success or failure, is ignored (the SDK action itself cannot be aborted).
// - Manual forms are never gated on analysis. The model is a suggestion; all four confidence values are
//   the model's own, absent values are not invented, and every sidecar review note is carried.
// - T-14B: a screen recording is an alternative SOURCE of the same flow. The injected `prepareFrames` decodes it
//   into exactly four JPEG frames; all four are uploaded (each needs its own real receipt) and analyzed in one
//   extract call. Everything after that (offers, edits, publish, cancel, generations) is unchanged. A recording
//   never attaches a frame as the deal photo, and nothing is inferred about audio.
// - T-16B: opt-in demo replay. When the user switches replay on AND asks for analysis, and an injected `demoCache` exists,
//   the controller first looks for an exact saved capture of the same actual source (after the real uploads, so every
//   published image still has a real owned receipt). A hit becomes the same validated offer, labeled cached, and the
//   live `extract` is skipped; a miss, bad file or slow lookup continues to the live call exactly once. Cancel ignores
//   both a late lookup and the fallback. Only hashes of the prepared bytes are kept in the source receipt.
// - Publishing runs the canonical buildPublishFields gate, calls deals.create once per form (a second
//   click shares the in-flight call), and a form is "saved" only after a real id receipt comes back.

import {
  buildPublishFields,
  createDraft,
  dealDraftReducer,
  DraftValidationError,
  isValidCalendarDate,
  isValidSourceUrl,
  type DealDraft,
  type DealDraftAction,
  type PublishFields,
} from "./dealDraft";
import { checkImageChoice, MAX_IMAGE_BYTES, type ImageChoice, type ImageUploadOutcome } from "./dealImageUpload";
import type { ExtractOutcome } from "./extractCore";
import { extractOutcomeToDrafts, validateExtractOutcome } from "./extractionDraft";
import { checkRecordingFile, RECORDING_COPY, RECORDING_FRAME_COUNT } from "./recordingFrameFlow";
import { demoKeyFromMaterial, type DemoCacheResult, type DemoKey, type DemoMaterial } from "./demoCache";
import { buildDemoMaterial, DEMO_LOOKUP_DEADLINE_MS, type CachedOrigin } from "./demoCacheFlow";

// ------------------------------------------------------------------ limits

/** Input photos are decoded and resized in the browser, so this is the decode bound, not the upload bound. */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
/** Mirrors lib/extractCore LIMITS (not imported: that module also holds server-only provider code). */
export const MAX_CAPTION_CHARS = 10_000;
export const MAX_TEXT_CHARS = 20_000;
export const MAX_FORMS = 10;
export const MAX_OFFERS = 5;
const STORAGE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const DEAL_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

declare const ownedStorage: unique symbol;
/** A storage id that came back in a real upload receipt. Only the controller mints one. */
export type OwnedStorageId = string & { readonly [ownedStorage]: true };

// ---------------------------------------------------------------- file checks

export type SourceFileCheck =
  | { ok: true; type: "image/jpeg" | "image/png" | "image/webp" }
  | { ok: false; code: "empty" | "too_large" | "heic" | "unsupported"; message: string };

export function checkSourceFile(file: ImageChoice): SourceFileCheck {
  if (!file || !Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, code: "empty", message: "That image is empty. Choose another." };
  }
  const type = (file.type ?? "").toLowerCase();
  const name = (file.name ?? "").toLowerCase();
  if (/hei[cf]/.test(type) || /\.hei[cf]$/.test(name)) {
    return {
      ok: false,
      code: "heic",
      message: "HEIC/HEIF photos are not supported yet. Take a screenshot, or export the photo as JPEG, PNG or WebP.",
    };
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return { ok: false, code: "too_large", message: `That image is larger than ${MAX_SOURCE_BYTES / 1048576} MB. Choose a smaller one.` };
  }
  const byType = type === "image/jpeg" || type === "image/png" || type === "image/webp" ? type : null;
  if (byType) return { ok: true, type: byType };
  if (!type) {
    if (/\.jpe?g$/.test(name)) return { ok: true, type: "image/jpeg" };
    if (/\.png$/.test(name)) return { ok: true, type: "image/png" };
    if (/\.webp$/.test(name)) return { ok: true, type: "image/webp" };
  }
  return { ok: false, code: "unsupported", message: "Choose a JPEG, PNG or WebP image." };
}

/**
 * The resized canvas output must be a real, bounded JPEG before it is sent. Returns the named upload file.
 * (Browser adapter: `resizeImage(file)` then this.)
 */
export function boundedJpegUpload(blob: Blob): Blob & ImageChoice {
  if (!blob || blob.type !== "image/jpeg" || !(blob.size > 0) || blob.size > MAX_IMAGE_BYTES) {
    throw new Error("The resized image is not a usable JPEG.");
  }
  return new File([blob], "deal.jpg", { type: "image/jpeg" });
}

// ------------------------------------------------------------------ types

export interface ExtractArgs {
  imageIds: OwnedStorageId[];
  caption?: string;
  text?: string;
  provenanceUrl?: string;
  publishedAt?: string;
}

export type CreateDealArgs = Omit<PublishFields, "imageId"> & { imageId?: OwnedStorageId };

export interface FlowDeps {
  /** Browser adapter: resizeImage(file) then boundedJpegUpload. Must reject if the image cannot be decoded. */
  prepareImage(file: File, signal: AbortSignal): Promise<Blob & ImageChoice>;
  /** Optional (T-14B). Browser adapter: grabFrames then the exact-four check. Absent = recordings unsupported. */
  prepareFrames?(file: File, signal: AbortSignal): Promise<(Blob & ImageChoice)[]>;
  getToken(): Promise<string | null>;
  generateUploadUrl(): Promise<string>;
  upload(args: { uploadUrl: string; token: string; file: Blob & ImageChoice; signal: AbortSignal }): Promise<ImageUploadOutcome>;
  extract(args: ExtractArgs): Promise<unknown>;
  createDeal(args: CreateDealArgs): Promise<unknown>;
  /**
   * Optional (T-16B), both needed together. Absent = no demo replay mode; every old caller is unchanged.
   * `demoPromptVersion` is the prompt/contract version a capture must match; `loadDemo` is the same-origin loader.
   */
  demoPromptVersion?(): Promise<string>;
  loadDemo?(key: DemoKey, options: { signal: AbortSignal }): Promise<DemoCacheResult>;
}

export type RunPhase = "idle" | "preparing" | "uploading" | "extracting" | "failed" | "canceled" | "done";
const IN_FLIGHT: ReadonlySet<RunPhase> = new Set(["preparing", "uploading", "extracting"]);
export const isRunning = (phase: RunPhase) => IN_FLIGHT.has(phase);

export interface FlowError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface SourceState {
  file: File | null;
  /** A selected screen recording (T-14B). At most one of `file` and `recording` is set. */
  recording: File | null;
  /** Why the last recording pick was rejected; the previously selected source is kept. */
  recordingError: string | null;
  /** Why the last pick was rejected; the previously selected file is kept. */
  fileError: string | null;
  caption: string;
  text: string;
  provenanceUrl: string;
  publishedAt: string;
}

export interface Offer {
  id: string;
  runId: number;
  model: string;
  /** The image attached to the offered drafts. Null for a recording (its frames are never attached). */
  imageId: OwnedStorageId | null;
  /** Every owned upload that was analyzed together: one for an image, exactly four for a recording. */
  imageIds: OwnedStorageId[];
  source: "image" | "recording";
  imageName: string;
  /** Present only when this offer was replayed from a saved capture (T-16B); absent for live analysis. */
  cached?: CachedOrigin;
  /** The model found no deal; nothing to apply. */
  noDeal: boolean;
  drafts: DealDraft[];
  /** Form key each draft was applied to, or null. */
  appliedTo: (string | null)[];
}

export interface FormEntry {
  key: string;
  /** Bumped when the draft is replaced wholesale so the form's local price text re-initializes. */
  epoch: number;
  draft: DealDraft;
  imageName: string | null;
  submitting: boolean;
  publishError: string | null;
  saved: { id: string } | null;
}

export interface FlowSnapshot {
  source: SourceState;
  phase: RunPhase;
  error: FlowError | null;
  /** True when the current file already has an owned upload, so a retry only re-runs analysis. */
  uploaded: boolean;
  /** Frame upload progress while a recording is being sent; null otherwise. */
  progress: { done: number; total: number } | null;
  /** The user's explicit opt-in to replay a saved demo capture (T-16B). Off until switched on; never persisted. */
  demoReplay: boolean;
  /** True only while a saved-capture lookup is in flight. */
  cacheLookup: boolean;
  offers: Offer[];
  forms: FormEntry[];
  activeFormKey: string;
}

export type ApplyResult =
  | { ok: true; formKey: string }
  | { ok: false; reason: "unknown_offer" | "no_deal" | "unknown_form" | "form_busy" | "confirm_required" | "too_many_forms" };

export type PublishResult = { ok: true; id: string } | { ok: false; message: string };

// ----------------------------------------------------------------- helpers

/** True when the user has put anything in this form (replacing it would lose work). */
export function isFormEdited(draft: DealDraft): boolean {
  if (draft.location !== null) return true;
  return Object.values(draft.fields).some((f) => f.isManuallyEdited || f.isReviewed);
}

const BLOCKED_ACTIONS: ReadonlySet<DealDraftAction["type"]> = new Set([
  "START_EXTRACTION",
  "FINISH_EXTRACTION_SUCCESS",
  "FINISH_EXTRACTION_ERROR",
  "CANCEL_EXTRACTION",
  "SET_IMAGE_ID",
]);

function errorData(error: unknown): Record<string, unknown> | null {
  const data = (error as { data?: unknown } | null)?.data;
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
}

/** Fixed copy keyed by the server's sanitized code; the server message and any provider text are never shown. */
export function classifyExtractError(error: unknown): FlowError {
  const data = errorData(error);
  const code = typeof data?.code === "string" ? data.code : "";
  const retryable = data?.retryable === true;
  switch (code) {
    case "NOT_SIGNED_IN":
      return { code, message: "Your session expired. Sign in again.", retryable: false };
    case "CONFIGURATION":
      return { code, message: "Image analysis is not available right now. You can fill in the form by hand.", retryable: false };
    case "IMAGE_NOT_AVAILABLE":
    case "INVALID_IMAGE":
      return { code, message: "The uploaded image could not be used. Try again to upload it afresh.", retryable: true };
    case "INVALID_INPUT":
    case "TEXT_TOO_LONG":
    case "TOO_MANY_IMAGES":
    case "IMAGE_TOO_LARGE":
      return { code, message: "The image or details were not accepted. Check them and try again.", retryable: false };
    default:
      return {
        code: code || "EXTRACTION_FAILED",
        message: "The analysis did not finish. Your image and details are kept; try again, or fill in the form by hand.",
        retryable: code ? retryable : true,
      };
  }
}

const UPLOAD_FAILURES: Record<Extract<ImageUploadOutcome, { ok: false }>["reason"], FlowError> = {
  invalid: { code: "UPLOAD_INVALID", message: "That image could not be uploaded. Choose another.", retryable: false },
  auth: { code: "AUTH", message: "Your session expired. Sign in again.", retryable: false },
  rejected: { code: "UPLOAD_REJECTED", message: "The server did not accept this image. Try a JPEG, PNG or WebP screenshot.", retryable: false },
  rate_limited: { code: "UPLOAD_RATE_LIMITED", message: "Too many uploads right now. Try again later.", retryable: true },
  network: { code: "UPLOAD_NETWORK", message: "The upload did not reach the server. Your image and details are kept; try again.", retryable: true },
  timeout: { code: "UPLOAD_TIMEOUT", message: "The upload took too long and was stopped. Your image and details are kept; try again.", retryable: true },
  aborted: { code: "UPLOAD_ABORTED", message: "The upload was canceled.", retryable: true },
  unexpected: { code: "UPLOAD_UNCONFIRMED", message: "The upload could not be confirmed. Try again.", retryable: true },
};

/**
 * Publish failures show fixed copy only. The few server strings that `deals.create` and the image claim throw
 * on purpose are matched exactly and replaced with our own wording; every other message, object payload or
 * thrown Error (validation text, request ids, provider or backend internals) becomes the generic line.
 */
const PUBLISH_FAILURES: ReadonlyMap<string, string> = new Map([
  ["Not signed in", "Your session expired. Sign in again to publish."],
  ["Create your profile before publishing.", "Create your profile before publishing."],
  ["That image is not available to you.", "The attached image could not be used. Remove it or choose another, then publish again."],
  ["That image is missing, too large, or not a supported image.", "The attached image could not be used. Remove it or choose another, then publish again."],
]);
export const GENERIC_PUBLISH_FAILURE = "Could not publish. Your edits are kept; check your connection and try again.";

export function publishMessage(error: unknown): string {
  const data = (error as { data?: unknown } | null)?.data;
  return (typeof data === "string" && PUBLISH_FAILURES.get(data.trim())) || GENERIC_PUBLISH_FAILURE;
}

/** Where a saved deal is shown: the map route selects and fits the deal given by `deal`. */
export function savedDealMapHref(id: string): string {
  return `/map?deal=${encodeURIComponent(id)}`;
}

export type SessionNotice = "none" | "signed_out" | "no_profile";

/**
 * What to tell a user who still has work on the page. Signed out and missing profile are different
 * problems; loading states say nothing. Publishing is always re-authorized by the backend.
 */
export function sessionNotice(state: { isLoading: boolean; isAuthenticated: boolean; profile: boolean | undefined }): SessionNotice {
  if (state.isLoading) return "none";
  if (!state.isAuthenticated) return "signed_out";
  return state.profile === false ? "no_profile" : "none";
}

function blankForm(key: string): FormEntry {
  return { key, epoch: 0, draft: createDraft(), imageName: null, submitting: false, publishError: null, saved: null };
}

// -------------------------------------------------------------- controller

export class ImageDraftFlow {
  private snap: FlowSnapshot;
  private readonly listeners = new Set<() => void>();
  private runId = 0;
  private fileSeq = 0;
  private idSeq = 1;
  private abort: AbortController | null = null;
  private attached = true;
  private receipt: { fileSeq: number; storageIds: OwnedStorageId[]; fileName: string; kind: "image" | "recording"; demo: DemoMaterial | null } | null = null;
  /** Every storage id a real upload receipt produced; the only ids a publish may reference. */
  private readonly owned = new Set<string>();
  private readonly inflight = new Map<string, Promise<PublishResult>>();

  constructor(private deps: FlowDeps) {
    this.snap = {
      source: { file: null, recording: null, recordingError: null, fileError: null, caption: "", text: "", provenanceUrl: "", publishedAt: "" },
      phase: "idle",
      error: null,
      uploaded: false,
      progress: null,
      demoReplay: false,
      cacheLookup: false,
      offers: [],
      forms: [blankForm("form-1")],
      activeFormKey: "form-1",
    };
  }

  /** Swap in fresh backend adapters (hook functions can change between renders). Runs in flight keep their calls. */
  setDeps(deps: FlowDeps): void {
    this.deps = deps;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): FlowSnapshot => this.snap;

  /** Mark the controller live; the returned function detaches it (any in-flight run becomes stale). */
  attach(): () => void {
    this.attached = true;
    return () => {
      this.attached = false;
      this.runId += 1;
      this.abort?.abort();
      this.abort = null;
      if (isRunning(this.snap.phase)) this.snap = { ...this.snap, phase: "canceled", error: null };
    };
  }

  private set(patch: Partial<FlowSnapshot>): void {
    // Progress only means something while a run is in flight.
    const idle = patch.phase !== undefined && !isRunning(patch.phase);
    this.snap = { ...this.snap, ...patch, ...(idle && !("progress" in patch) ? { progress: null } : {}), ...(idle && !("cacheLookup" in patch) ? { cacheLookup: false } : {}) };
    for (const listener of [...this.listeners]) listener();
  }

  private updateForm(key: string, fn: (form: FormEntry) => FormEntry): void {
    this.set({ forms: this.snap.forms.map((f) => (f.key === key ? fn(f) : f)) });
  }

  private nextId(prefix: string): string {
    this.idSeq += 1;
    return `${prefix}-${this.idSeq}`;
  }

  // ------------------------------------------------------------- source

  /** Pick (or clear, with null) the screenshot/flyer. An invalid pick keeps the previous selection. */
  selectFile(file: File | null): void {
    if (file === null) {
      this.cancelRun();
      this.fileSeq += 1;
      this.receipt = null;
      this.set({ source: { ...this.snap.source, file: null, recording: null, fileError: null, recordingError: null }, phase: "idle", error: null, uploaded: false });
      return;
    }
    const check = checkSourceFile(file);
    if (!check.ok) {
      this.set({ source: { ...this.snap.source, fileError: check.message } });
      return;
    }
    this.cancelRun();
    this.fileSeq += 1;
    this.receipt = null;
    this.set({ source: { ...this.snap.source, file, recording: null, fileError: null, recordingError: null }, phase: "idle", error: null, uploaded: false });
  }

  /**
   * Pick (or clear, with null) a screen recording instead of an image. An invalid pick keeps the previous
   * selection. Picking replaces any selected image (the source is one or the other), never form edits.
   */
  selectRecording(file: File | null): void {
    if (file === null) return this.selectFile(null);
    const check = checkRecordingFile(file);
    if (!check.ok) {
      this.set({ source: { ...this.snap.source, recordingError: check.message } });
      return;
    }
    this.cancelRun();
    this.fileSeq += 1;
    this.receipt = null;
    this.set({ source: { ...this.snap.source, file: null, recording: file, fileError: null, recordingError: null }, phase: "idle", error: null, uploaded: false });
  }

  /** Explicit opt-in for demo replay. Applies to the NEXT analysis; a run already in flight keeps what it started with. */
  setDemoReplay(on: boolean): void {
    this.set({ demoReplay: on === true });
  }

  setContext(patch: Partial<Pick<SourceState, "caption" | "text" | "provenanceUrl" | "publishedAt">>): void {
    this.set({ source: { ...this.snap.source, ...patch } });
  }

  private cancelRun(): void {
    this.runId += 1;
    this.abort?.abort();
    this.abort = null;
  }

  /** Stop watching the current run. The SDK action cannot be aborted, so its outcome is simply ignored. */
  cancel(): void {
    if (!isRunning(this.snap.phase)) return;
    this.cancelRun();
    this.set({ phase: "canceled", error: null });
  }

  // ------------------------------------------------------------ analysis

  private validateContext(): { args: Omit<ExtractArgs, "imageIds"> } | { error: FlowError } {
    const { caption, text, provenanceUrl, publishedAt } = this.snap.source;
    const bad = (message: string): { error: FlowError } => ({ error: { code: "INVALID_INPUT", message, retryable: false } });
    if (caption.trim().length > MAX_CAPTION_CHARS) return bad(`The caption is longer than ${MAX_CAPTION_CHARS} characters.`);
    if (text.trim().length > MAX_TEXT_CHARS) return bad(`The extra text is longer than ${MAX_TEXT_CHARS} characters.`);
    const url = provenanceUrl.trim();
    if (url && !isValidSourceUrl(url)) return bad("The source link must be an http(s) address without a username or password.");
    const published = publishedAt.trim();
    if (published && !isValidCalendarDate(published)) return bad("The posted date must be a real date.");
    return {
      args: {
        ...(caption.trim() ? { caption: caption.trim() } : {}),
        ...(text.trim() ? { text: text.trim() } : {}),
        ...(url ? { provenanceUrl: url } : {}),
        ...(published ? { publishedAt: published } : {}),
      },
    };
  }

  /**
   * Upload (once per selected file) and analyze the selected image. The provenance link is sent as
   * provenance only. Every failure keeps the file, the context and all form edits.
   */
  async analyze(): Promise<void> {
    if (isRunning(this.snap.phase)) return;
    const recording = this.snap.source.recording;
    const file = recording ?? this.snap.source.file;
    if (!file) {
      this.set({ phase: "failed", error: { code: "NO_IMAGE", message: "Choose a screenshot, flyer or screen recording to analyze, or fill in the form by hand.", retryable: false } });
      return;
    }
    const context = this.validateContext();
    if ("error" in context) {
      this.set({ phase: "failed", error: context.error });
      return;
    }

    const replay = this.snap.demoReplay && !!this.deps.demoPromptVersion && !!this.deps.loadDemo;
    const myRun = ++this.runId;
    const myFile = this.fileSeq;
    const controller = new AbortController();
    this.abort = controller;
    const stale = () => !this.attached || this.runId !== myRun;
    const fail = (error: FlowError) => {
      if (!stale()) this.set({ phase: "failed", error });
    };

    let receipt = this.receipt && this.receipt.fileSeq === myFile ? this.receipt : null;
    this.set({ phase: receipt ? "extracting" : "preparing", error: null, progress: null });
    try {
      if (!receipt && recording) {
        const outcome = await this.uploadRecording(recording, myFile, controller, stale);
        if (outcome === "stale") return;
        if ("error" in outcome) return fail(outcome.error);
        receipt = outcome.receipt;
      } else if (!receipt) {
        let prepared: Blob & ImageChoice;
        try {
          prepared = await this.deps.prepareImage(file, controller.signal);
        } catch {
          return fail({ code: "IMAGE_UNREADABLE", message: "That image could not be read or resized. Try a JPEG, PNG or WebP screenshot.", retryable: false });
        }
        if (stale()) return;
        if (prepared.type !== "image/jpeg" || checkImageChoice(prepared) !== null) {
          return fail({ code: "IMAGE_UNREADABLE", message: "That image could not be prepared for upload.", retryable: false });
        }
        // Hashes of the ORIGINAL file and the prepared upload, kept in the receipt for retries (bytes are not kept).
        const demo = this.deps.loadDemo ? await buildDemoMaterial(file as unknown as Blob, [prepared]) : null;
        if (stale()) return;

        this.set({ phase: "uploading" });
        let token: string | null;
        try {
          token = await this.deps.getToken();
        } catch {
          token = null;
        }
        if (stale()) return;
        if (!token) return fail(UPLOAD_FAILURES.auth);

        let uploadUrl: string;
        try {
          uploadUrl = await this.deps.generateUploadUrl();
        } catch {
          return fail({ code: "UPLOAD_UNAVAILABLE", message: "Image upload is not available right now. You can fill in the form by hand.", retryable: true });
        }
        if (stale()) return;

        let outcome: ImageUploadOutcome;
        try {
          outcome = await this.deps.upload({ uploadUrl, token, file: prepared, signal: controller.signal });
        } catch {
          outcome = { ok: false, reason: "network" };
        }
        if (outcome.ok && typeof outcome.storageId === "string" && STORAGE_ID_PATTERN.test(outcome.storageId)) {
          const storageId = outcome.storageId as OwnedStorageId;
          this.owned.add(storageId);
          // The upload is real even if the run was canceled meanwhile; keep it for a retry of the same file.
          if (this.fileSeq === myFile) {
            this.receipt = { fileSeq: myFile, storageIds: [storageId], fileName: file.name, kind: "image", demo };
            receipt = this.receipt;
            this.set({ uploaded: true });
          }
        }
        if (stale()) return;
        if (!outcome.ok) return fail(UPLOAD_FAILURES[outcome.reason] ?? UPLOAD_FAILURES.unexpected);
        if (!receipt) return fail(UPLOAD_FAILURES.unexpected);
        this.set({ phase: "extracting" });
      }

      const source = receipt;
      // Build the offer's drafts from a validated envelope; throws if it is not usable.
      const build = (raw: unknown) => {
        validateExtractOutcome(raw);
        const outcome = raw as ExtractOutcome;
        const noDeal = !outcome.result.isDeal || outcome.result.deals.length === 0;
        const drafts = noDeal ? [] : extractOutcomeToDrafts(outcome, { sourceUrl: context.args.provenanceUrl ?? null, imageId: source.kind === "image" ? source.storageIds[0] : null });
        return { model: outcome.model, noDeal, drafts };
      };

      // Opt-in replay: look for an exact saved capture first. Anything but a usable hit continues to the live call once.
      let built: ReturnType<typeof build> | null = null;
      let cached: CachedOrigin | undefined;
      if (replay) {
        const hit = await this.lookupCache(receipt, context.args, controller, stale);
        if (hit === "stale") return;
        if (hit) {
          try {
            built = build(hit.outcome);
            cached = hit.origin;
          } catch {
            built = null;
          }
        }
      }

      if (!built) {
        let raw: unknown;
        try {
          raw = await this.deps.extract({ imageIds: [...receipt.storageIds], ...context.args });
        } catch (error) {
          if (stale()) return;
          const failure = classifyExtractError(error);
          if (failure.code === "IMAGE_NOT_AVAILABLE" || failure.code === "INVALID_IMAGE") {
            if (this.receipt?.fileSeq === myFile) this.receipt = null;
            this.set({ uploaded: false });
          }
          return fail(failure);
        }
        if (stale()) return;
        try {
          built = build(raw);
        } catch {
          return fail({ code: "UNUSABLE_RESULT", message: "The analysis result was not usable. Try again, or fill in the form by hand.", retryable: true });
        }
      }
      const { model, noDeal, drafts } = built;

      const offer: Offer = {
        id: this.nextId("offer"),
        runId: myRun,
        model,
        imageId: receipt.kind === "image" ? receipt.storageIds[0] : null,
        imageIds: [...receipt.storageIds],
        source: receipt.kind,
        imageName: receipt.fileName,
        ...(cached ? { cached } : {}),
        noDeal,
        drafts,
        appliedTo: drafts.map(() => null),
      };
      this.set({ phase: "done", error: null, offers: [...this.snap.offers, offer].slice(-MAX_OFFERS) });
    } catch {
      fail({ code: "UNEXPECTED", message: "Something went wrong. Your image and details are kept; try again.", retryable: true });
    } finally {
      if (this.runId === myRun) this.abort = null;
    }
  }

  /**
   * Ask the injected demo cache for an exact saved capture of this receipt's source plus the current context.
   * Returns "stale" if the run was canceled/superseded meanwhile (the caller must then do nothing at all), a hit, or
   * null for any miss, invalid file, error or timeout. Bounded by its own deadline even if the loader never settles.
   */
  private async lookupCache(
    receipt: NonNullable<ImageDraftFlow["receipt"]>,
    args: Omit<ExtractArgs, "imageIds">,
    controller: AbortController,
    stale: () => boolean,
  ): Promise<"stale" | { outcome: ExtractOutcome; origin: CachedOrigin } | null> {
    const { demoPromptVersion, loadDemo } = this.deps;
    if (!demoPromptVersion || !loadDemo || !receipt.demo) return null;
    // A recording matches only its exact four frames; anything else is a miss.
    if (receipt.kind === "recording" && receipt.demo.images.length !== RECORDING_FRAME_COUNT) return null;
    this.set({ cacheLookup: true });
    const bounded = <T,>(work: Promise<T>): Promise<T | null> =>
      new Promise<T | null>((resolve) => {
        const done = (value: T | null) => {
          clearTimeout(timer);
          controller.signal.removeEventListener("abort", onAbort);
          resolve(value);
        };
        const onAbort = () => done(null);
        const timer = setTimeout(() => done(null), DEMO_LOOKUP_DEADLINE_MS);
        controller.signal.addEventListener("abort", onAbort, { once: true });
        work.then(done, () => done(null));
      });
    let found: { outcome: ExtractOutcome; origin: CachedOrigin } | null = null;
    try {
      const version = await bounded(demoPromptVersion());
      if (stale()) return "stale";
      if (version) {
        const key = await demoKeyFromMaterial(receipt.demo, args, version);
        const result = await bounded(loadDemo(key, { signal: controller.signal }));
        if (stale()) return "stale";
        if (result && result.status === "hit") {
          found = { outcome: result.outcome, origin: { capturedAt: result.provenance.capturedAt, evidenceReference: result.provenance.evidenceReference, model: result.provenance.model } };
        }
      }
    } catch {
      found = null;
    }
    if (stale()) return "stale";
    this.set({ cacheLookup: false });
    return found;
  }

  /**
   * Decode the recording into exactly four frames and upload each, one at a time. All four must come back
   * with distinct real receipts or the run fails and keeps no partial receipt (a retry decodes again). Late
   * completions of a canceled or superseded run still count as owned uploads but never touch the draft state.
   */
  private async uploadRecording(
    recording: File,
    myFile: number,
    controller: AbortController,
    stale: () => boolean,
  ): Promise<"stale" | { error: FlowError } | { receipt: NonNullable<ImageDraftFlow["receipt"]> }> {
    const failure = (code: string, message: string, retryable: boolean) => ({ error: { code, message, retryable } });
    if (!this.deps.prepareFrames) return failure("RECORDING_UNSUPPORTED", RECORDING_COPY.unsupportedHere, false);

    let frames: (Blob & ImageChoice)[];
    try {
      frames = await this.deps.prepareFrames(recording, controller.signal);
    } catch {
      return stale() ? "stale" : failure("RECORDING_UNREADABLE", RECORDING_COPY.unreadable, false);
    }
    if (stale()) return "stale";
    if (
      !Array.isArray(frames) ||
      frames.length !== RECORDING_FRAME_COUNT ||
      frames.some((f) => f.type !== "image/jpeg" || checkImageChoice(f) !== null)
    ) {
      return failure("RECORDING_UNREADABLE", RECORDING_COPY.unreadable, false);
    }

    // Exactly four frames, hashed with the ORIGINAL recording for the demo key (hashes only are kept).
    const demo = this.deps.loadDemo ? await buildDemoMaterial(recording as unknown as Blob, frames) : null;
    if (stale()) return "stale";

    this.set({ phase: "uploading", progress: { done: 0, total: frames.length } });
    let token: string | null;
    try {
      token = await this.deps.getToken();
    } catch {
      token = null;
    }
    if (stale()) return "stale";
    if (!token) return { error: UPLOAD_FAILURES.auth };

    const ids: OwnedStorageId[] = [];
    for (const frame of frames) {
      let uploadUrl: string;
      try {
        uploadUrl = await this.deps.generateUploadUrl();
      } catch {
        return stale() ? "stale" : failure("UPLOAD_UNAVAILABLE", "Image upload is not available right now. You can fill in the form by hand.", true);
      }
      if (stale()) return "stale";
      let outcome: ImageUploadOutcome;
      try {
        outcome = await this.deps.upload({ uploadUrl, token, file: frame, signal: controller.signal });
      } catch {
        outcome = { ok: false, reason: "network" };
      }
      if (outcome.ok && typeof outcome.storageId === "string" && STORAGE_ID_PATTERN.test(outcome.storageId)) {
        this.owned.add(outcome.storageId); // a real receipt, even if this run was canceled meanwhile
        if (!ids.includes(outcome.storageId as OwnedStorageId)) ids.push(outcome.storageId as OwnedStorageId);
      }
      if (stale()) return "stale";
      if (!outcome.ok) return { error: UPLOAD_FAILURES[outcome.reason] ?? UPLOAD_FAILURES.unexpected };
      if (ids.length === 0 || !STORAGE_ID_PATTERN.test(outcome.storageId)) return { error: UPLOAD_FAILURES.unexpected };
      this.set({ progress: { done: ids.length, total: frames.length } });
    }
    if (ids.length !== RECORDING_FRAME_COUNT || this.fileSeq !== myFile) return { error: UPLOAD_FAILURES.unexpected };

    this.receipt = { fileSeq: myFile, storageIds: ids, fileName: recording.name, kind: "recording", demo };
    this.set({ uploaded: true, phase: "extracting" });
    return { receipt: this.receipt };
  }

  dismissOffer(offerId: string): void {
    this.set({ offers: this.snap.offers.filter((o) => o.id !== offerId) });
  }

  // -------------------------------------------------------------- forms

  setActiveForm(formKey: string): void {
    if (this.snap.forms.some((f) => f.key === formKey)) this.set({ activeFormKey: formKey });
  }

  /**
   * Deliberately put one offer draft into a form: add a new form, or replace an existing one. Replacing a
   * form the user has edited needs `confirmReplace`. Nothing is merged: the whole draft, including its
   * image, review notes and provenance, comes from the single offer.
   */
  applyOffer(
    offerId: string,
    draftIndex: number,
    target: { kind: "add" } | { kind: "replace"; formKey: string },
    options: { confirmReplace?: boolean } = {},
  ): ApplyResult {
    const offer = this.snap.offers.find((o) => o.id === offerId);
    if (!offer) return { ok: false, reason: "unknown_offer" };
    if (offer.noDeal || !Number.isInteger(draftIndex) || draftIndex < 0 || draftIndex >= offer.drafts.length) {
      return { ok: false, reason: offer.noDeal ? "no_deal" : "unknown_offer" };
    }
    const draft = structuredClone(offer.drafts[draftIndex]);
    let formKey: string;
    let forms: FormEntry[];
    if (target.kind === "add") {
      if (this.snap.forms.length >= MAX_FORMS) return { ok: false, reason: "too_many_forms" };
      formKey = this.nextId("form");
      forms = [...this.snap.forms, { ...blankForm(formKey), draft, imageName: offer.imageName }];
    } else {
      const existing = this.snap.forms.find((f) => f.key === target.formKey);
      if (!existing) return { ok: false, reason: "unknown_form" };
      if (existing.saved || existing.submitting) return { ok: false, reason: "form_busy" };
      if (isFormEdited(existing.draft) && !options.confirmReplace) return { ok: false, reason: "confirm_required" };
      formKey = existing.key;
      forms = this.snap.forms.map((f) =>
        f.key === formKey ? { ...f, epoch: f.epoch + 1, draft, imageName: offer.imageName, publishError: null } : f,
      );
    }
    const offers = this.snap.offers.map((o) =>
      o.id === offerId ? { ...o, appliedTo: o.appliedTo.map((k, i) => (i === draftIndex ? formKey : k)) } : o,
    );
    this.set({ forms, offers, activeFormKey: formKey });
    return { ok: true, formKey };
  }

  /** Edit a form through the canonical reducer. Ignored while that form is publishing or already saved. */
  dispatch(formKey: string, action: DealDraftAction): boolean {
    if (BLOCKED_ACTIONS.has(action.type)) return false;
    const form = this.snap.forms.find((f) => f.key === formKey);
    if (!form || form.saved || form.submitting) return false;
    let next: DealDraft;
    try {
      next = dealDraftReducer(form.draft, action);
    } catch {
      return false;
    }
    if (next === form.draft) return true;
    this.updateForm(formKey, (f) => ({ ...f, draft: next }));
    return true;
  }

  /** Detach the image from a form (explicit user choice). The upload itself is untouched. */
  removeImage(formKey: string): boolean {
    const form = this.snap.forms.find((f) => f.key === formKey);
    if (!form || form.saved || form.submitting || form.draft.imageId === null) return false;
    // Not SET_IMAGE_ID: that action also clears the form's pending model suggestions.
    this.updateForm(formKey, (f) => ({ ...f, draft: { ...f.draft, imageId: null }, imageName: null }));
    return true;
  }

  // ------------------------------------------------------------ publish

  publish(formKey: string): Promise<PublishResult> {
    const pending = this.inflight.get(formKey);
    if (pending) return pending;
    const form = this.snap.forms.find((f) => f.key === formKey);
    if (!form) return Promise.resolve({ ok: false, message: "That form no longer exists." });
    if (form.saved) return Promise.resolve({ ok: true, id: form.saved.id });
    const run = this.runPublish(form);
    this.inflight.set(formKey, run);
    const clear = () => {
      if (this.inflight.get(formKey) === run) this.inflight.delete(formKey);
    };
    void run.then(clear, clear);
    return run;
  }

  private async runPublish(form: FormEntry): Promise<PublishResult> {
    const rejected = (message: string): PublishResult => {
      this.updateForm(form.key, (f) => ({ ...f, submitting: false, publishError: message }));
      return { ok: false, message };
    };

    let fields: PublishFields;
    try {
      fields = buildPublishFields(form.draft);
    } catch (error) {
      const message = error instanceof DraftValidationError ? error.errors.join(" ") : "This deal is not ready to publish.";
      return rejected(message);
    }
    if (fields.imageId !== undefined && !this.owned.has(fields.imageId)) {
      return rejected("The attached image is not a verified upload. Remove it or upload it again.");
    }

    const { imageId, ...rest } = fields;
    // The id is typed as owned only here, after the receipt check above.
    const args: CreateDealArgs = imageId === undefined ? rest : { ...rest, imageId: imageId as OwnedStorageId };

    this.updateForm(form.key, (f) => ({ ...f, submitting: true, publishError: null }));
    let created: unknown;
    try {
      created = await this.deps.createDeal(args);
    } catch (error) {
      return rejected(publishMessage(error));
    }
    if (typeof created !== "string" || !DEAL_ID_PATTERN.test(created)) {
      return rejected("The save could not be confirmed. Your edits are kept; check the map before trying again.");
    }
    this.updateForm(form.key, (f) => ({ ...f, submitting: false, publishError: null, saved: { id: created as string } }));
    return { ok: true, id: created };
  }
}
