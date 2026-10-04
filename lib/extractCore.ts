import { addAsCondition, isOrdinaryRestriction, isYearlessEventDate, mentionsForeignCurrency } from "./benignRestrictions";
import { z } from "zod";
import { DealResult } from "./dealSchema";
import { buildContextText, RESPONSE_JSON_SCHEMA, SYSTEM_PROMPT } from "./prompt";

// Headless, server-side deal extraction core (T-05A). No Convex, UI, SDK or
// storage imports. The caller supplies bytes/text and an optional fetch; the
// API key is explicit server-only config and never appears in errors.
//
// Reuse inventory from teammate 91b957a (ai-workflow/src/gemini.ts, errors.ts,
// network.ts), narrowly: generateContent REST request shape, candidate/
// finishReason parsing, safe error codes, retry on 429/5xx. NOT reused: the
// url_context URL reader, Geoapify, standalone jobs/deals schema, scalar
// confidence, `confidence < threshold` rejection.

export const PRIMARY_MODEL = "gemini-3.8-flash";
export const FALLBACK_MODEL = "gemini-3.5-flash-lite";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

// Documented limits. Gemini's inline-data request cap is 20MB total.
export const LIMITS = {
  maxImages: 8,
  maxImageBytes: 5 * 1024 * 1024,
  maxRequestBytes: 18 * 1024 * 1024, // base64 images + text, under the 20MB cap
  maxCaptionChars: 10_000,
  maxTextChars: 20_000,
  maxDeals: 10,
  defaultTimeoutMs: 45_000,
  maxTimeoutMs: 120_000, // timeoutMs must be finite, > 0 and <= this; covers headers AND body
} as const;

export const SUPPORTED_IMAGE_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
type ImageMime = (typeof SUPPORTED_IMAGE_MIME)[number];

export type ExtractErrorCode =
  | "CONFIGURATION"
  | "EMPTY_SOURCE"
  | "UNSUPPORTED_SOURCE"
  | "INVALID_INPUT"
  | "INVALID_IMAGE"
  | "IMAGE_TOO_LARGE"
  | "TOO_MANY_IMAGES"
  | "REQUEST_TOO_LARGE"
  | "TEXT_TOO_LONG"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_BUSY"
  | "PROVIDER_AUTH"
  | "PROVIDER_REQUEST"
  | "PROVIDER_BLOCKED"
  | "INVALID_MODEL_OUTPUT";

export class ExtractError extends Error {
  constructor(
    public readonly code: ExtractErrorCode,
    message: string,
    public readonly retryable = false,
    /** Provider HTTP status and Retry-After hint, for diagnostics and pacing only. Never carries a body. */
    public readonly httpStatus?: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ExtractError";
  }
}

export type ExtractImage = { mimeType: string; bytes: Uint8Array };

export type ExtractInput = {
  images?: ExtractImage[];
  caption?: string;
  text?: string;
  /** Provenance only: never fetched, never sent to the model. */
  provenanceUrl?: string;
  /** Supplied publication time (ISO date or datetime); the only basis for relative dates. */
  publishedAt?: string;
};

export type ExtractConfig = {
  apiKey?: string;
  model?: string;
  fallbackModel?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

/**
 * Limits the canonical Deal cannot carry. `dealIndex` is the index into
 * `result.deals`. `blocking: true` (FUTURE_START, UNSUPPORTED_CONSTRAINT)
 * means the deal must not be presented as publishable/currently valid until a
 * person resolves it. CURRENCY_UNVERIFIED is non-blocking: canonical priceCad
 * is null and `originalAmount` is the unresolved amount the model read.
 */
export type ManualReviewNote = {
  dealIndex: number;
  code: "FUTURE_START" | "UNSUPPORTED_CONSTRAINT" | "CURRENCY_UNVERIFIED";
  blocking: boolean;
  detail: string;
  originalAmount?: number;
};

/**
 * Envelope returned by the public `extract.extractDeal` action (convex/extract.ts,
 * owner-approved contract revision: this envelope, not a bare DealResult). `result`
 * is canonical and every field is a suggestion for explicit user acceptance.
 * `manualReview` is a sidecar the canonical shape cannot carry: a caller MUST carry
 * blocking notes (FUTURE_START, UNSUPPORTED_CONSTRAINT) by deal index to the form
 * and must never return or store `result` alone.
 */
export type ExtractOutcome = {
  result: DealResult;
  manualReview: ManualReviewNote[];
  /** True when any note is blocking. */
  requiresBlockingReview: boolean;
  model: string;
};

// ---------------------------------------------------------------- validation

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isRealIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
  );
}

const unit = z
  .number()
  .refine((n) => Number.isFinite(n) && n >= 0 && n <= 1, "score outside 0..1");

// Model-side deal: canonical fields plus explicitly named sidecar fields.
// Strict everywhere: an unexpected key (for example an unmodelled constraint)
// is rejected, never silently stripped.
const ModelDeal = z.strictObject({
  restaurant: z.string(),
  address: z.string().nullable(),
  dealText: z.string(),
  statedPrice: z
    .number()
    .refine((n) => Number.isFinite(n) && n >= 0, "price must be finite and nonnegative")
    .nullable(),
  cadEvidence: z.string().nullable(),
  validDays: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])),
  validStart: z.string().regex(TIME).nullable(),
  validEnd: z.string().regex(TIME).nullable(),
  expiresOn: z.string().refine(isRealIsoDate, "not a real ISO date").nullable(),
  startDate: z.string().refine(isRealIsoDate, "not a real ISO date").nullable(),
  conditions: z.array(z.string()),
  unsupportedConstraints: z.array(z.string()),
  confidence: z.strictObject({
    restaurant: unit,
    priceCad: unit,
    hours: unit,
    expiresOn: unit,
  }),
});
const ModelResult = z.strictObject({
  isDeal: z.boolean(),
  deals: z.array(ModelDeal).max(LIMITS.maxDeals),
});

export function vancouverToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}


/** Strict semantic validation of raw model JSON into a canonical DealResult. */
export function validateModelOutput(
  raw: unknown,
  today: string,
  /** Caller-supplied caption/text; the only place CAD evidence can be verified. */
  suppliedText = "",
): { result: DealResult; manualReview: ManualReviewNote[] } {
  const parsed = ModelResult.safeParse(raw);
  if (!parsed.success) {
    throw new ExtractError(
      "INVALID_MODEL_OUTPUT",
      "The model returned fields that failed validation.",
      true,
    );
  }
  const { isDeal, deals } = parsed.data;
  if (isDeal !== deals.length > 0) {
    throw new ExtractError(
      "INVALID_MODEL_OUTPUT",
      "The model returned an inconsistent isDeal and deals pair.",
      true,
    );
  }
  const manualReview: ManualReviewNote[] = [];
  const out = deals.map((d, dealIndex) => {
    const dealText = d.dealText.trim();
    if (!dealText || new Set(d.validDays).size !== d.validDays.length) {
      throw new ExtractError(
        "INVALID_MODEL_OUTPUT",
        "The model returned an empty offer or duplicate weekdays.",
        true,
      );
    }
    if (d.startDate !== null && d.startDate > today) {
      manualReview.push({
        dealIndex,
        code: "FUTURE_START",
        blocking: true,
        detail: `Offer starts on ${d.startDate}, which the canonical Deal cannot represent.`,
      });
    }
    // Ordinary restrictions (per-person limits, supplies last, ...) become visible conditions; others block.
    let conditions = d.conditions.map((c) => c.trim()).filter(Boolean);
    for (const c of d.unsupportedConstraints) {
      if (!c.trim() || isYearlessEventDate(c)) continue;
      const added = isOrdinaryRestriction(c) ? addAsCondition(conditions, { detail: c }) : null;
      if (added?.absorbed) {
        conditions = added.conditions;
        continue;
      }
      manualReview.push({
        dealIndex,
        code: "UNSUPPORTED_CONSTRAINT",
        blocking: true,
        detail: c.trim(),
      });
    }
    // A price is Canadian dollars (every venue is in Metro Vancouver) unless the source names another currency.
    let priceCad: number | null = null;
    if (d.statedPrice !== null) {
      if (mentionsForeignCurrency(`${suppliedText} ${d.cadEvidence ?? ""}`)) {
        manualReview.push({
          dealIndex,
          code: "CURRENCY_UNVERIFIED",
          blocking: false,
          detail: `Price ${d.statedPrice} may not be in CAD (the source names another currency). Choose the currency manually.`,
          originalAmount: d.statedPrice,
        });
      } else {
        priceCad = d.statedPrice;
      }
    }
    return {
      restaurant: d.restaurant.trim(),
      address: d.address?.trim() || null,
      dealText,
      priceCad,
      validDays: d.validDays,
      validStart: d.validStart,
      validEnd: d.validEnd,
      expiresOn: d.expiresOn,
      conditions,
      confidence: d.confidence,
    };
  });
  return { result: DealResult.parse({ isDeal, deals: out }), manualReview };
}

// ----------------------------------------------------------- input / request

// Signature validation only: it rejects obvious wrong containers (for example
// MP4 or AVIF declared as HEIC) but is NOT proof the file decodes or that the
// provider accepts it. Genuine decode evidence needs a live provider call.
const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"];
const GENERIC_HEIF_BRANDS = ["mif1", "msf1"];

function matchesMagic(mime: ImageMime, b: Uint8Array): boolean {
  const ascii = (i: number, n: number) =>
    String.fromCharCode(...b.subarray(i, i + n));
  switch (mime) {
    case "image/png":
      return (
        b.length > 8 &&
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)
      );
    case "image/jpeg":
      return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/webp":
      return b.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
    case "image/heic":
    case "image/heif": {
      if (b.length < 16 || ascii(4, 4) !== "ftyp") return false;
      const size = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
      if (size < 16 || size > b.length) return false;
      const major = ascii(8, 4);
      const compatible: string[] = [];
      for (let i = 16; i + 4 <= size; i += 4) compatible.push(ascii(i, 4));
      if (HEIC_BRANDS.includes(major)) return true;
      // Generic HEIF majors must also list an HEVC-image brand (excludes AVIF/MP4).
      return (
        GENERIC_HEIF_BRANDS.includes(major) &&
        compatible.some((c) => HEIC_BRANDS.includes(c))
      );
    }
  }
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

export function validateInput(input: ExtractInput) {
  const images = input.images ?? [];
  const caption = input.caption?.trim() || undefined;
  const text = input.text?.trim() || undefined;
  if (images.length > LIMITS.maxImages) {
    throw new ExtractError("TOO_MANY_IMAGES", `At most ${LIMITS.maxImages} images are supported.`);
  }
  if ((caption?.length ?? 0) > LIMITS.maxCaptionChars || (text?.length ?? 0) > LIMITS.maxTextChars) {
    throw new ExtractError("TEXT_TOO_LONG", "The supplied caption or text is too long.");
  }
  if (input.publishedAt !== undefined) {
    const d = input.publishedAt.slice(0, 10);
    if (!isRealIsoDate(d) || Number.isNaN(Date.parse(input.publishedAt))) {
      throw new ExtractError("INVALID_INPUT", "publishedAt must be an ISO date or datetime.");
    }
  }
  let imageBytes = 0;
  const encoded = images.map((img) => {
    if (!(SUPPORTED_IMAGE_MIME as readonly string[]).includes(img.mimeType)) {
      throw new ExtractError("INVALID_IMAGE", "Unsupported image type.");
    }
    if (img.bytes.length === 0) {
      throw new ExtractError("INVALID_IMAGE", "An image is empty or inaccessible.");
    }
    if (img.bytes.length > LIMITS.maxImageBytes) {
      throw new ExtractError("IMAGE_TOO_LARGE", "An image is too large; resize it first.");
    }
    if (!matchesMagic(img.mimeType as ImageMime, img.bytes)) {
      throw new ExtractError("INVALID_IMAGE", "Image bytes do not match the declared type.");
    }
    imageBytes += Math.ceil(img.bytes.length / 3) * 4;
    return { mimeType: img.mimeType, data: toBase64(img.bytes) };
  });
  if (images.length === 0 && !caption && !text) {
    if (input.provenanceUrl) {
      throw new ExtractError(
        "UNSUPPORTED_SOURCE",
        "A link alone cannot be read. Supply a screenshot or the post text.",
      );
    }
    throw new ExtractError("EMPTY_SOURCE", "No images or text were supplied.");
  }
  const contextText = buildContextText({
    caption,
    text,
    publishedAt: input.publishedAt,
    imageCount: images.length,
  });
  if (imageBytes + utf8Bytes(contextText) + utf8Bytes(SYSTEM_PROMPT) > LIMITS.maxRequestBytes) {
    throw new ExtractError("REQUEST_TOO_LARGE", "The supplied source is too large in total.");
  }
  return { encoded, contextText };
}

export function buildRequestBody(contextText: string, encoded: { mimeType: string; data: string }[]) {
  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        // Text first, then every supplied image, in order.
        parts: [
          { text: contextText },
          ...encoded.map((e) => ({ inlineData: { mimeType: e.mimeType, data: e.data } })),
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_JSON_SCHEMA,
    },
  };
}

// ----------------------------------------------------------------- transport

const ProviderResponse = z.object({
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z
          .object({
            parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })),
          })
          .optional(),
      }),
    )
    .optional(),
});

// One deadline covers connect, headers AND the body read: a response whose
// headers arrive but whose body stalls is aborted too. Errors are sanitized;
// the underlying error (which can embed the URL or request) is never exposed.
async function callModel(
  model: string,
  body: object,
  cfg: { fetch: typeof fetch; timeoutMs: number; apiKey: string },
): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ExtractError("PROVIDER_TIMEOUT", "The model request timed out.", true));
    }, cfg.timeoutMs);
  });
  deadline.catch(() => {}); // avoid an unhandled rejection after an early return
  const raced = <T,>(p: Promise<T>): Promise<T> => Promise.race([p, deadline]);
  let response: Response | undefined;
  try {
    try {
      response = await raced(
        cfg.fetch(`${API_BASE}${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
          body: JSON.stringify(body),
          signal: controller.signal,
        }),
      );
    } catch (e) {
      if (e instanceof ExtractError) throw e;
      throw new ExtractError("PROVIDER_UNAVAILABLE", "The model service could not be reached.", true);
    }
    if (!response.ok) {
      const s = response.status;
      const retryAfter = response.headers.get("retry-after");
      void response.body?.cancel().catch(() => {});
      if (s === 401 || s === 403) {
        throw new ExtractError("PROVIDER_AUTH", "Check the server-side Gemini API key and permissions.");
      }
      if (s === 429 || (s >= 500 && s <= 599)) {
        throw new ExtractError("PROVIDER_BUSY", "The model service is busy or unavailable.", true, s, retryAfterMs(retryAfter));
      }
      throw new ExtractError("PROVIDER_REQUEST", `The model service rejected the request (HTTP ${s}).`, false, s);
    }
    try {
      return await raced(response.json());
    } catch (e) {
      if (e instanceof ExtractError) throw e;
      throw new ExtractError("INVALID_MODEL_OUTPUT", "The model service returned an unreadable body.", true);
    }
  } finally {
    clearTimeout(timer);
    if (controller.signal.aborted) void response?.body?.cancel().catch(() => {});
  }
}

function textFromResponse(json: unknown): string {
  const parsed = ProviderResponse.safeParse(json);
  if (!parsed.success) {
    throw new ExtractError("INVALID_MODEL_OUTPUT", "The model returned an unexpected response.", true);
  }
  if (parsed.data.promptFeedback?.blockReason) {
    throw new ExtractError("PROVIDER_BLOCKED", "The source was blocked by the model's safety filters.");
  }
  const candidate = parsed.data.candidates?.[0];
  // Only an explicitly finished candidate may be used.
  if (!candidate || candidate.finishReason !== "STOP") {
    throw new ExtractError("INVALID_MODEL_OUTPUT", "The model did not finish the extraction.", true);
  }
  const text = (candidate.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
  if (!text.trim()) {
    throw new ExtractError("INVALID_MODEL_OUTPUT", "The model returned no content.", true);
  }
  return text;
}

// ---------------------------------------------------------------------- core

const MODEL_NAME = /^[a-zA-Z0-9._-]+$/;

/** Longest wait honored from a provider Retry-After; a longer ask is capped so the user is not left hanging. */
const MAX_RETRY_AFTER_MS = 8_000;
/** Pause before the 2nd and 3rd attempt when the provider is busy: gives a per-minute quota or overload time to clear. */
const BUSY_BACKOFF_MS = [1_000, 2_500] as const;

/** Seconds form of Retry-After only (the form Google sends); anything else is ignored. */
function retryAfterMs(header: string | null): number | undefined {
  if (header === null || !/^\d{1,6}$/.test(header.trim())) return undefined;
  return Math.min(Number(header.trim()) * 1000, MAX_RETRY_AFTER_MS);
}

function pauseBefore(next: number, e: ExtractError, random: () => number): number {
  if (e.code !== "PROVIDER_BUSY" && e.code !== "PROVIDER_UNAVAILABLE" && e.code !== "PROVIDER_TIMEOUT") return 300;
  const base = BUSY_BACKOFF_MS[Math.min(next - 1, BUSY_BACKOFF_MS.length - 1)];
  const jitter = Math.floor(random() * 250);
  return Math.max(e.retryAfterMs ?? 0, base + jitter);
}

/**
 * Extract deal suggestions from supplied images and text. Order of attempts:
 * primary, primary once more, then the fallback model. Auth failures, blocked
 * content and local input errors stop immediately.
 */
export async function extractDealCore(
  input: ExtractInput,
  config: ExtractConfig,
): Promise<ExtractOutcome> {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) {
    throw new ExtractError("CONFIGURATION", "The server-side Gemini API key is not configured.");
  }
  const primary = config.model ?? PRIMARY_MODEL;
  const fallback = config.fallbackModel ?? FALLBACK_MODEL;
  for (const m of [primary, fallback]) {
    if (!MODEL_NAME.test(m)) throw new ExtractError("CONFIGURATION", "Invalid model name.");
  }
  const timeoutMs = config.timeoutMs ?? LIMITS.defaultTimeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > LIMITS.maxTimeoutMs) {
    throw new ExtractError("CONFIGURATION", "timeoutMs must be a finite positive number within the documented bound.");
  }
  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new ExtractError("CONFIGURATION", "No fetch implementation available.");
  const sleep = config.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const { encoded, contextText } = validateInput(input);
  const body = buildRequestBody(contextText, encoded);
  const today = vancouverToday((config.now ?? (() => new Date()))());
  const call = {
    fetch: fetchImpl,
    timeoutMs,
    apiKey,
  };

  const random = config.random ?? Math.random;
  // Three attempts either way. With no distinct fallback model the same model is simply tried a third time.
  const plan = primary === fallback ? [primary, primary, primary] : [primary, primary, fallback];
  let last: ExtractError | undefined;
  for (let i = 0; i < plan.length; i++) {
    try {
      const json = await callModel(plan[i], body, call);
      const text = textFromResponse(json);
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new ExtractError("INVALID_MODEL_OUTPUT", "The model returned malformed JSON.", true);
      }
      const suppliedText = [input.caption, input.text].filter(Boolean).join("\n");
      const checked = validateModelOutput(raw, today, suppliedText);
      return {
        ...checked,
        requiresBlockingReview: checked.manualReview.some((n) => n.blocking),
        model: plan[i],
      };
    } catch (e) {
      if (!(e instanceof ExtractError)) {
        throw new ExtractError("INVALID_MODEL_OUTPUT", "Extraction failed unexpectedly.", true);
      }
      if (e.code === "PROVIDER_AUTH" || e.code === "PROVIDER_BLOCKED") throw e;
      last = e;
      // A rejected request will not change on an identical retry of the same model.
      if (e.code === "PROVIDER_REQUEST" && plan[i + 1] === plan[i]) i++;
      if (i < plan.length - 1) await sleep(pauseBefore(i + 1, e, random));
    }
  }
  throw last ?? new ExtractError("PROVIDER_UNAVAILABLE", "Extraction failed.", true);
}
