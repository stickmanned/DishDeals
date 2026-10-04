// Pure rules for a user-supplied Reel recording, shared by the Convex HTTP
// route (convex/reelSource.ts) and the browser upload helper. No Convex, React
// or window access at import time. Nothing here logs or fetches by itself.
//
// The recording is the user's own screen recording or Photos/Files video of
// the same Reel. Nothing here downloads or resolves an Instagram URL.

export const MAX_MEDIA_BYTES = 12 * 1024 * 1024; // 12 MiB request body
export const MIN_DURATION_SECONDS = 1;
export const MAX_DURATION_SECONDS = 180;
export const MAX_CAPTION_CHARS = 2200;
export const MAX_URL_CHARS = 8000;
export const UPLOAD_PATH = "/reel-source";

/** Container types the upload accepts, by what the client declares. */
export const DECLARED_TYPES = ["video/mp4", "video/quicktime"] as const;
export type DeclaredType = (typeof DECLARED_TYPES)[number];
/** The MIME type sent to Gemini (its video docs list video/mp4 and video/mov). */
export type ProviderMime = "video/mp4" | "video/mov";

const MP4_BRANDS = ["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "M4VH", "dash", "mmp4"];
const QUICKTIME_BRAND = "qt  ";

export type MediaClass = { declared: DeclaredType; providerMime: ProviderMime };

/**
 * Classify bytes by their ISO-BMFF `ftyp` box. This is signature validation
 * only: it rejects wrong containers (HTML, images, other formats) but is not
 * proof that the video decodes or that the provider accepts it.
 */
export function classifyMedia(bytes: Uint8Array): MediaClass | null {
  if (bytes.length < 16) return null;
  const ascii = (i: number) => String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
  if (ascii(4) !== "ftyp") return null;
  const size = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  if (size < 16 || size > bytes.length) return null;
  const major = ascii(8);
  if (major === QUICKTIME_BRAND) return { declared: "video/quicktime", providerMime: "video/mov" };
  if (MP4_BRANDS.includes(major)) return { declared: "video/mp4", providerMime: "video/mp4" };
  return null;
}

export const isDeclaredType = (value: unknown): value is DeclaredType =>
  typeof value === "string" && (DECLARED_TYPES as readonly string[]).includes(value);

export function validateDuration(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= MIN_DURATION_SECONDS && value <= MAX_DURATION_SECONDS
    ? value
    : null;
}

/** Trimmed caption, `undefined` if blank, `null` if invalid (too long or control characters). */
export function validateCaption(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length > MAX_CAPTION_CHARS) return null;
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return null;
  return text || undefined;
}

/** Real ISO date (`YYYY-MM-DD`) or full ISO datetime, not more than a day in the future. */
export function validatePublishedAt(value: unknown, now: number = Date.now()): string | undefined | null {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > 40) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed > now + 86_400_000) return null;
  return value;
}

export type UploadQuery = { itemId: string; duration: number; publishedAt?: string; caption?: string };

/** Strict parse of the upload URL query. Unknown or repeated keys are rejected. */
export function parseUploadQuery(url: URL, now: number = Date.now()): UploadQuery | null {
  if (url.href.length > MAX_URL_CHARS || url.pathname !== UPLOAD_PATH) return null;
  const allowed = new Set(["itemId", "duration", "publishedAt", "caption"]);
  const seen = new Set<string>();
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || seen.has(key)) return null;
    seen.add(key);
  }
  const itemId = url.searchParams.get("itemId");
  const rawDuration = url.searchParams.get("duration");
  if (!itemId || !/^[A-Za-z0-9]{10,64}$/.test(itemId)) return null;
  if (!rawDuration || !/^\d{1,3}(\.\d{1,3})?$/.test(rawDuration)) return null;
  const duration = validateDuration(Number(rawDuration));
  const caption = validateCaption(url.searchParams.get("caption") ?? undefined);
  const publishedAt = validatePublishedAt(url.searchParams.get("publishedAt") ?? undefined, now);
  if (duration === null || caption === null || publishedAt === null) return null;
  return { itemId, duration, ...(publishedAt ? { publishedAt } : {}), ...(caption ? { caption } : {}) };
}

// ------------------------------------------------------------------ origin

export type OriginConfig = { ok: true; origin: string } | { ok: false };

/**
 * REEL_WEB_ORIGIN must be an exact https origin (no path, credentials, query).
 * An http origin is accepted only for an explicitly configured localhost or
 * 127.0.0.1 development origin.
 */
export function parseConfiguredOrigin(value: string | undefined): OriginConfig {
  if (!value) return { ok: false };
  let url: URL;
  try { url = new URL(value); } catch { return { ok: false }; }
  if (!/^[A-Za-z0-9.-]+$/.test(url.hostname)) return { ok: false }; // no wildcards or odd hosts
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const schemeOk = url.protocol === "https:" || (url.protocol === "http:" && local);
  if (!schemeOk || url.username || url.password || url.search || url.hash || url.pathname !== "/" || url.origin === "null" || value.endsWith("/")) {
    return { ok: false };
  }
  return { ok: true, origin: url.origin };
}

export const originAllowed = (requestOrigin: string | null, configured: OriginConfig): boolean =>
  configured.ok && requestOrigin !== null && requestOrigin === configured.origin;

/** No wildcard and no credentials flag: authorization travels in the Bearer header. */
export function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

// ----------------------------------------------------------- browser side

export type FileChoice = { name: string; type: string; size: number };
export type FileProblem = "empty" | "too_large" | "unsupported_type";

/** Pre-upload checks on the picked file. Extension is only a fallback when the browser reports no type. */
export function checkFileChoice(file: FileChoice): FileProblem | null {
  if (!Number.isFinite(file.size) || file.size <= 0) return "empty";
  if (file.size > MAX_MEDIA_BYTES) return "too_large";
  const type = file.type.toLowerCase();
  if (type) return isDeclaredType(type) ? null : "unsupported_type";
  return /\.(mp4|mov)$/i.test(file.name) ? null : "unsupported_type";
}

export const declaredTypeFor = (file: FileChoice): DeclaredType | null => {
  const type = file.type.toLowerCase();
  if (isDeclaredType(type)) return type;
  if (type) return null;
  if (/\.mp4$/i.test(file.name)) return "video/mp4";
  if (/\.mov$/i.test(file.name)) return "video/quicktime";
  return null;
};

export type VideoProbe = {
  createObjectURL: (file: unknown) => string;
  revokeObjectURL: (url: string) => void;
  createVideo: () => {
    preload: string;
    muted: boolean;
    src: string;
    duration: number;
    onloadedmetadata: (() => void) | null;
    onerror: (() => void) | null;
    removeAttribute: (name: string) => void;
    load: () => void;
  };
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (id: unknown) => void;
};

/**
 * Read the real duration from the file's own metadata in the browser. The
 * object URL and element are always released. Resolves null on error, timeout
 * or an out-of-range duration; this is browser-supplied, not server-proven.
 */
export function readVideoDuration(file: unknown, probe: VideoProbe, timeoutMs = 10_000): Promise<number | null> {
  return new Promise(resolve => {
    let url = "";
    let done = false;
    const video = probe.createVideo();
    const finish = (value: number | null) => {
      if (done) return;
      done = true;
      probe.clearTimer(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      try { video.load(); } catch { /* releasing the element is best effort */ }
      if (url) probe.revokeObjectURL(url);
      resolve(value);
    };
    const timer = probe.setTimer(() => finish(null), timeoutMs);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => finish(validateDuration(video.duration));
    video.onerror = () => finish(null);
    try {
      url = probe.createObjectURL(file);
      video.src = url;
    } catch {
      finish(null);
    }
  });
}

export function buildUploadUrl(siteUrl: string, q: UploadQuery): string | null {
  let base: URL;
  try { base = new URL(siteUrl); } catch { return null; }
  if (base.protocol !== "https:" && !(base.protocol === "http:" && (base.hostname === "localhost" || base.hostname === "127.0.0.1"))) return null;
  const url = new URL(UPLOAD_PATH, base.origin);
  url.searchParams.set("itemId", q.itemId);
  url.searchParams.set("duration", String(q.duration));
  if (q.publishedAt) url.searchParams.set("publishedAt", q.publishedAt);
  if (q.caption) url.searchParams.set("caption", q.caption);
  return url.href.length <= MAX_URL_CHARS ? url.href : null;
}

export type UploadOutcome =
  | { ok: true; generation: number }
  | { ok: false; reason: "invalid" | "auth" | "rejected" | "rate_limited" | "network" | "unexpected" };

/**
 * Upload the picked file with the user's Bearer token. The caller keeps its
 * own file/caption/date state on any failure; nothing is logged here. `ok`
 * is reported only for the server's association receipt, not a bare 2xx.
 */
export async function uploadSuppliedReel(
  args: { siteUrl: string; token: string; query: UploadQuery; file: Blob & FileChoice },
  fetchImpl: typeof fetch = fetch,
): Promise<UploadOutcome> {
  const declared = declaredTypeFor(args.file);
  const url = buildUploadUrl(args.siteUrl, args.query);
  if (!url || !declared || checkFileChoice(args.file) !== null || !args.token) return { ok: false, reason: "invalid" };
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${args.token}`, "Content-Type": declared },
      body: args.file,
    });
  } catch {
    return { ok: false, reason: "network" };
  }
  if (response.status === 401) return { ok: false, reason: "auth" };
  if (response.status === 429) return { ok: false, reason: "rate_limited" };
  if (!response.ok) return { ok: false, reason: response.status >= 500 ? "unexpected" : "rejected" };
  try {
    const body: unknown = await response.json();
    const b = body as { status?: unknown; generation?: unknown };
    if (b && b.status === "attached" && typeof b.generation === "number" && Number.isSafeInteger(b.generation) && b.generation >= 0) {
      return { ok: true, generation: b.generation };
    }
  } catch { /* fall through */ }
  return { ok: false, reason: "unexpected" };
}
