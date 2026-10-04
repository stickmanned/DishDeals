// Page-side half of the Android PWA share target (T-13B).
//
// public/sw.js receives the share-target POST, validates it and stores ONE image plus optional
// title/text/url in a private IndexedDB inbox, then answers 303 -> /post?share=<opaque id>. This module is
// the reader: it validates the id, reads and re-validates the stored record (the worker is not trusted to be
// the only writer), turns it into source/context for the canonical ImageDraftFlow, and deletes it only after
// the controller has really adopted it. Nothing here fetches a URL, uploads, publishes or logs; the shared
// link is provenance only. public/sw.js is plain JS and cannot import this file, so the shared constants
// below are duplicated there and kept honest by a round-trip test that runs the real worker and this reader
// against the same store.
//
// Not proof of anything on a real phone: no installed Android PWA or native share sheet was exercised.
import { isValidSourceUrl } from "./dealDraft";
import { classifyUploadImage, MAX_IMAGE_BYTES, isUploadType, type UploadType } from "./dealImageUpload";

export const SHARE_DB_NAME = "dishdeals-share-inbox";
export const SHARE_DB_VERSION = 1;
export const SHARE_STORE = "shares";
export const SHARE_PATH = "/share-target";
export const SHARE_TTL_MS = 24 * 60 * 60 * 1000;
export const SHARE_MAX_ITEMS = 8;
export const SHARE_MAX_IMAGE_BYTES = MAX_IMAGE_BYTES;
export const SHARE_MAX_TITLE = 300;
export const SHARE_MAX_TEXT = 5000;
export const SHARE_MAX_URL = 2048;
export const SHARE_ID_PATTERN = /^[0-9a-f]{32}$/;
export const PENDING_SHARE_KEY = "dishdeals-pending-share";

export const SHARE_ERROR_CODES = ["no_image", "multiple", "unsupported", "too_large", "malformed", "storage", "timeout", "inbox_full", "unavailable"] as const;
export type ShareErrorCode = (typeof SHARE_ERROR_CODES)[number];
export const isShareErrorCode = (value: unknown): value is ShareErrorCode => typeof value === "string" && (SHARE_ERROR_CODES as readonly string[]).includes(value);

/** Fixed copy keyed by code: nothing from the share itself is ever echoed into an error. */
export const SHARE_ERROR_COPY: Record<ShareErrorCode, string> = {
  no_image: "That share had no image. Share a screenshot or flyer (JPEG, PNG or WebP).",
  multiple: "That share had more than one file. Share one image at a time.",
  unsupported: "Only JPEG, PNG or WebP images can be shared here.",
  too_large: "That image is larger than 5 MB. Share a smaller screenshot.",
  malformed: "That share could not be read. Try sharing the image again.",
  storage: "Your browser could not store the shared image. Free some space or choose the image from the post page instead.",
  timeout: "Receiving the shared image took too long and was stopped. Try again.",
  inbox_full: "Too many shared images are waiting on this device. Clear them, then share again.",
  unavailable: "This browser cannot keep shared images. Choose the image from the post page instead.",
};

// ------------------------------------------------------------------ query

export type ShareQuery = { kind: "none" } | { kind: "id"; id: string } | { kind: "error"; code: ShareErrorCode } | { kind: "invalid" };

/**
 * Strict reading of `/post?...`. Only `share` (one 32-hex opaque id) or `share_error` (one known code) is
 * accepted, never both, never repeated, and never together with any other parameter (a token or private text
 * in the URL makes the whole share link invalid and nothing is read).
 */
export function parseShareQuery(search: string): ShareQuery {
  const params = new URLSearchParams(search);
  const share = params.getAll("share");
  const error = params.getAll("share_error");
  if (share.length === 0 && error.length === 0) return { kind: "none" };
  const keys = new Set(params.keys());
  if (share.length + error.length !== 1 || keys.size !== 1) return { kind: "invalid" };
  if (share.length === 1) return SHARE_ID_PATTERN.test(share[0]) ? { kind: "id", id: share[0] } : { kind: "invalid" };
  return isShareErrorCode(error[0]) ? { kind: "error", code: error[0] } : { kind: "invalid" };
}

// ------------------------------------------------------------------ store

/** The only operations the page needs. The IDB adapter and test fakes both implement it. */
export interface ShareStore {
  get(id: string): Promise<unknown>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

export function isShareInboxSupported(factory: unknown = (globalThis as { indexedDB?: unknown }).indexedDB): boolean {
  return typeof factory === "object" && factory !== null && typeof (factory as { open?: unknown }).open === "function";
}

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(SHARE_DB_NAME, SHARE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SHARE_STORE)) db.createObjectStore(SHARE_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("open failed"));
    request.onblocked = () => reject(new Error("open blocked"));
  });
}

/** Same-origin IndexedDB only (the factory belongs to this origin's global). Each call opens and closes the db. */
export function createIdbShareStore(factory: IDBFactory | undefined = (globalThis as { indexedDB?: IDBFactory }).indexedDB): ShareStore {
  async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    if (!factory || !isShareInboxSupported(factory)) throw new Error("IndexedDB unavailable");
    const db = await openDb(factory);
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(SHARE_STORE, mode);
        let result: T;
        const request = op(tx.objectStore(SHARE_STORE));
        request.onsuccess = () => {
          result = request.result;
        };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error ?? new Error("transaction failed"));
        tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
      });
    } finally {
      db.close();
    }
  }
  return {
    get: (id) => run("readonly", (s) => s.get(id)),
    delete: async (id) => {
      await run("readwrite", (s) => s.delete(id));
    },
    clear: async () => {
      await run("readwrite", (s) => s.clear());
    },
  };
}

// ----------------------------------------------------------------- reading

export interface LoadedShare {
  id: string;
  file: File;
  title: string;
  text: string;
  url: string;
  expiresAt: number;
}

export type ReadShareResult = { ok: true; share: LoadedShare } | { ok: false; reason: "invalid_id" | "missing" | "expired" | "invalid" | "unavailable" };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const EXT: Record<UploadType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

/** Re-validates a stored record from scratch. Anything unexpected is "invalid", never partially used. */
async function toLoadedShare(raw: unknown, id: string): Promise<LoadedShare | null> {
  if (!isObject(raw) || raw.v !== 1 || raw.id !== id) return null;
  const { mime, image, title, text, url, expiresAt, createdAt } = raw;
  if (!isUploadType(mime) || typeof image !== "object" || image === null || typeof (image as Blob).size !== "number") return null;
  const blob = image as Blob;
  if (!(blob.size > 0) || blob.size > SHARE_MAX_IMAGE_BYTES) return null;
  if (!boundedString(title, SHARE_MAX_TITLE) || !boundedString(text, SHARE_MAX_TEXT) || !boundedString(url, SHARE_MAX_URL)) return null;
  if (url !== "" && !isValidSourceUrl(url)) return null;
  if (typeof expiresAt !== "number" || typeof createdAt !== "number" || !Number.isFinite(expiresAt) || expiresAt - createdAt > SHARE_TTL_MS) return null;
  let head: Uint8Array;
  try {
    head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  } catch {
    return null;
  }
  if (classifyUploadImage(head) !== mime) return null;
  return { id, file: new File([blob], `shared-image.${EXT[mime]}`, { type: mime }), title, text, url, expiresAt };
}

/** Read one share by its (already strictly parsed) id. Expired and corrupt records are deleted. */
export async function readShare(store: ShareStore, id: string, now: number = Date.now()): Promise<ReadShareResult> {
  if (!SHARE_ID_PATTERN.test(id)) return { ok: false, reason: "invalid_id" };
  let raw: unknown;
  try {
    raw = await store.get(id);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (raw === undefined || raw === null) return { ok: false, reason: "missing" };
  const expires = isObject(raw) ? raw.expiresAt : undefined;
  if (typeof expires === "number" && expires <= now) {
    await store.delete(id).catch(() => undefined);
    return { ok: false, reason: "expired" };
  }
  const share = await toLoadedShare(raw, id);
  if (!share) {
    await store.delete(id).catch(() => undefined);
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, share };
}

/** Delete exactly one share. Resolves false (never throws) when the store refuses. */
export async function discardShare(store: ShareStore, id: string): Promise<boolean> {
  if (!SHARE_ID_PATTERN.test(id)) return false;
  try {
    await store.delete(id);
    return true;
  } catch {
    return false;
  }
}

export async function clearShares(store: ShareStore): Promise<boolean> {
  try {
    await store.clear();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- adoption

export interface ShareContext {
  caption?: string;
  text?: string;
  provenanceUrl?: string;
}

/**
 * Title becomes the caption, text stays text, and the shared link is provenance only (never opened or fetched).
 * Android often puts the link in `text`; when the whole text is exactly one valid link it is used as provenance
 * instead of text.
 */
export function shareContext(share: Pick<LoadedShare, "title" | "text" | "url">): ShareContext {
  const title = share.title.trim();
  let text = share.text.trim();
  let url = share.url.trim();
  if (!url && text && isValidSourceUrl(text)) {
    url = text;
    text = "";
  }
  return { ...(title ? { caption: title } : {}), ...(text ? { text } : {}), ...(url ? { provenanceUrl: url } : {}) };
}

/** The slice of ImageDraftFlow adoption needs (structural, so tests use the real controller). */
export interface AdoptTarget {
  getSnapshot(): { phase: string; source: { file: File | null; recording: File | null; caption: string; text: string; provenanceUrl: string } };
  selectFile(file: File | null): void;
  setContext(patch: ShareContext): void;
}

const RUNNING = new Set(["preparing", "uploading", "extracting"]);

export type AdoptResult =
  | { ok: true; applied: { caption: boolean; text: boolean; provenanceUrl: boolean } }
  | { ok: false; reason: "busy" | "source_exists" | "rejected" };

/**
 * Apply a consented share to the canonical controller. The user's own input always wins: nothing is adopted
 * while a run is in flight or an image/recording is already chosen, and a context field is filled only when
 * it is currently empty. Forms are never touched, nothing is uploaded or published.
 */
export function adoptShare(target: AdoptTarget, share: LoadedShare): AdoptResult {
  const before = target.getSnapshot();
  if (RUNNING.has(before.phase)) return { ok: false, reason: "busy" };
  if (before.source.file !== null || before.source.recording !== null) return { ok: false, reason: "source_exists" };
  target.selectFile(share.file);
  if (target.getSnapshot().source.file !== share.file) return { ok: false, reason: "rejected" };
  const wanted = shareContext(share);
  const now = target.getSnapshot().source;
  const patch: ShareContext = {};
  if (wanted.caption && !now.caption.trim()) patch.caption = wanted.caption;
  if (wanted.text && !now.text.trim()) patch.text = wanted.text;
  if (wanted.provenanceUrl && !now.provenanceUrl.trim()) patch.provenanceUrl = wanted.provenanceUrl;
  if (Object.keys(patch).length > 0) target.setContext(patch);
  return { ok: true, applied: { caption: "caption" in patch, text: "text" in patch, provenanceUrl: "provenanceUrl" in patch } };
}

// ------------------------------------------- remembered pending id (sign-in)

export interface TinyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Only the opaque id is remembered (never text, link or bytes) so a sign-in detour does not lose the receipt. */
export function rememberPendingShare(storage: TinyStorage | null | undefined, id: string): void {
  if (!storage || !SHARE_ID_PATTERN.test(id)) return;
  try {
    storage.setItem(PENDING_SHARE_KEY, id);
  } catch {
    /* storage may be blocked; the share link itself still works */
  }
}

export function recallPendingShare(storage: TinyStorage | null | undefined): string | null {
  if (!storage) return null;
  try {
    const id = storage.getItem(PENDING_SHARE_KEY);
    return id && SHARE_ID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function forgetPendingShare(storage: TinyStorage | null | undefined): void {
  try {
    storage?.removeItem(PENDING_SHARE_KEY);
  } catch {
    /* ignore */
  }
}

// ------------------------------------------------------------ registration

export type RegisterResult = "registered" | "unsupported" | "failed";

/**
 * Register /sw.js when the browser has service workers (secure contexts only; WKWebView and old browsers do
 * not, and that must never matter). Failure is swallowed: the app works without the worker.
 */
export async function registerShareWorker(nav: { serviceWorker?: { register(url: string, options?: { scope?: string; updateViaCache?: "none" | "all" | "imports" }): Promise<unknown> } } | undefined): Promise<RegisterResult> {
  if (!nav || !nav.serviceWorker || typeof nav.serviceWorker.register !== "function") return "unsupported";
  try {
    await nav.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    return "registered";
  } catch {
    return "failed";
  }
}
