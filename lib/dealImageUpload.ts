// Pure rules for the authenticated deal-image upload (convex/dealImage.ts) and its browser helper.
// No Convex, React or window access at import time; nothing logs. A file signature is evidence of the
// file FORMAT only, not proof that the image decodes or contains a deal.
import { MAX_IMAGE_BYTES } from "./dealWrite";

export { MAX_IMAGE_BYTES };
export const UPLOAD_PATH = "/deal-image";
export const READ_DEADLINE_MS = 60_000; // server: total time allowed to receive the body
export const REGISTRY_TTL_MS = 24 * 60 * 60 * 1000; // an unpublished upload expires after 24 hours
export const CLEANUP_BATCH = 100;
export const PUBLISHED_EXPIRY = Number.MAX_SAFE_INTEGER; // published rows never expire (and leave the cleanup scan)
export const DEFAULT_UPLOAD_TIMEOUT_MS = 90_000;
export const MAX_UPLOAD_TIMEOUT_MS = 300_000;

/** Accepted formats. HEIC/HEIF are rejected until a conversion/decode path exists. */
export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];
export const isUploadType = (value: unknown): value is UploadType =>
  typeof value === "string" && (UPLOAD_TYPES as readonly string[]).includes(value);

/** Format from the leading bytes: JPEG, PNG (full 8-byte signature) or WebP (RIFF....WEBP); otherwise null. */
export function classifyUploadImage(b: Uint8Array): UploadType | null {
  const ascii = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  return null;
}

/** No wildcard and no credentials flag: authorization travels in the Bearer header. */
export function imageCorsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

/** `null` header = absent (allowed); a number = a plain integer; `"invalid"` = malformed. */
export function parseDeclaredLength(header: string | null): number | null | "invalid" {
  if (header === null) return null;
  return /^\d{1,9}$/.test(header) ? Number(header) : "invalid";
}

// ----------------------------------------------------------- browser side

export type ImageChoice = { name: string; type: string; size: number };

export function checkImageChoice(file: ImageChoice): "empty" | "too_large" | "unsupported_type" | null {
  if (!Number.isFinite(file.size) || file.size <= 0) return "empty";
  if (file.size > MAX_IMAGE_BYTES) return "too_large";
  const type = file.type.toLowerCase();
  if (type) return isUploadType(type) ? null : "unsupported_type";
  return /\.(jpe?g|png|webp)$/i.test(file.name) ? null : "unsupported_type";
}

export function declaredImageType(file: ImageChoice): UploadType | null {
  const type = file.type.toLowerCase();
  if (isUploadType(type)) return type;
  if (type) return null;
  if (/\.jpe?g$/i.test(file.name)) return "image/jpeg";
  if (/\.png$/i.test(file.name)) return "image/png";
  if (/\.webp$/i.test(file.name)) return "image/webp";
  return null;
}

/** The upload URL is `${CONVEX_SITE_URL}/deal-image` (as returned by deals.generateUploadUrl); validate before use. */
export function validUploadUrl(value: string): boolean {
  try {
    const u = new URL(value);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    return u.pathname === UPLOAD_PATH && !u.search && !u.hash && !u.username && (u.protocol === "https:" || (u.protocol === "http:" && local));
  } catch { return false; }
}

export type ImageUploadOutcome =
  | { ok: true; storageId: string }
  | { ok: false; reason: "invalid" | "auth" | "rejected" | "rate_limited" | "network" | "timeout" | "aborted" | "unexpected" };

const TIMED_OUT = Symbol("timeout");

/**
 * POST the image with the user's Bearer token. One finite deadline covers the request, the response headers and
 * the receipt body; a caller abort ends it as `aborted`. `ok` only for a `{storageId}` receipt (a registered
 * upload), never for a bare 2xx. Nothing is logged.
 */
export async function uploadDealImage(
  args: { uploadUrl: string; token: string; file: Blob & ImageChoice; timeoutMs?: number; signal?: AbortSignal },
  fetchImpl: typeof fetch = fetch,
): Promise<ImageUploadOutcome> {
  const timeoutMs = args.timeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS;
  const declared = declaredImageType(args.file);
  if (!validUploadUrl(args.uploadUrl) || !declared || checkImageChoice(args.file) !== null || !args.token) return { ok: false, reason: "invalid" };
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_UPLOAD_TIMEOUT_MS) return { ok: false, reason: "invalid" };
  if (args.signal?.aborted) return { ok: false, reason: "aborted" };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const deadline = new Promise<typeof TIMED_OUT>(resolve => { timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs); });
  const callerAborted = new Promise<"aborted">(resolve => { onAbort = () => resolve("aborted"); args.signal?.addEventListener("abort", onAbort, { once: true }); });
  const raced = <T,>(p: Promise<T>) => Promise.race([p, deadline, callerAborted]);
  let response: Response | undefined;
  try {
    const sent = await raced(fetchImpl(args.uploadUrl, { method: "POST", headers: { Authorization: `Bearer ${args.token}`, "Content-Type": declared }, body: args.file, signal: controller.signal }));
    if (sent === TIMED_OUT) return { ok: false, reason: "timeout" };
    if (sent === "aborted") return { ok: false, reason: "aborted" };
    response = sent as Response;
    if (response.status === 401) return { ok: false, reason: "auth" };
    if (response.status === 429) return { ok: false, reason: "rate_limited" };
    if (!response.ok) return { ok: false, reason: response.status >= 500 ? "unexpected" : "rejected" };
    const parsed = await raced(response.json().then((b: unknown) => b, () => null));
    if (parsed === TIMED_OUT) return { ok: false, reason: "timeout" };
    if (parsed === "aborted") return { ok: false, reason: "aborted" };
    const id = (parsed as { storageId?: unknown } | null)?.storageId;
    return typeof id === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(id) ? { ok: true, storageId: id } : { ok: false, reason: "unexpected" };
  } catch {
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
    if (onAbort) args.signal?.removeEventListener("abort", onAbort);
    controller.abort();
    void response?.body?.cancel().catch(() => {});
  }
}
