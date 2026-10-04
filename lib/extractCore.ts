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
};

export type ManualReviewNote = {
  dealIndex: number;
  code: "FUTURE_START" | "UNSUPPORTED_CONSTRAINT" | "CURRENCY_UNVERIFIED";
  detail: string;
};

export type ExtractOutcome = {
  /** Canonical DealResult. Every field is a suggestion for explicit user acceptance. */
  result: DealResult;
  /** Limits the canonical shape cannot carry. Non-empty = manual review before publish. */
  manualReview: ManualReviewNote[];
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

// Model-side deal: canonical Deal fields plus extras the canonical shape
// cannot carry. The extras are stripped from the returned DealResult.
const ModelDeal = z.object({
  restaurant: z.string(),
  address: z.string().nullable(),
  dealText: z.string(),
  priceCad: z
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
  confidence: z.object({
    restaurant: unit,
    priceCad: unit,
    hours: unit,
    expiresOn: unit,
  }),
});
const ModelResult = z.object({
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
        detail: `Offer starts on ${d.startDate}, which the canonical Deal cannot represent.`,
      });
    }
    for (const c of d.unsupportedConstraints) {
      if (c.trim()) {
        manualReview.push({ dealIndex, code: "UNSUPPORTED_CONSTRAINT", detail: c.trim() });
      }
    }
    if (d.priceCad !== null && !d.cadEvidence?.trim()) {
      manualReview.push({
        dealIndex,
        code: "CURRENCY_UNVERIFIED",
        detail: "A price was suggested without explicit CAD evidence in the source.",
      });
    }
    return {
      restaurant: d.restaurant.trim(),
      address: d.address?.trim() || null,
      dealText,
      priceCad: d.priceCad,
      validDays: d.validDays,
      validStart: d.validStart,
      validEnd: d.validEnd,
      expiresOn: d.expiresOn,
      conditions: d.conditions.map((c) => c.trim()).filter(Boolean),
      confidence: d.confidence,
    };
  });
  return { result: DealResult.parse({ isDeal, deals: out }), manualReview };
}

// ----------------------------------------------------------- input / request

function matchesMagic(mime: ImageMime, b: Uint8Array): boolean {
  const at = (i: number, s: string) =>
    [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  switch (mime) {
    case "image/png":
      return b.length > 8 && b[0] === 0x89 && at(1, "PNG");
    case "image/jpeg":
      return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/webp":
      return b.length > 12 && at(0, "RIFF") && at(8, "WEBP");
    case "image/heic":
    case "image/heif":
      return b.length > 12 && at(4, "ftyp");
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

async function callModel(
  model: string,
  body: object,
  cfg: Required<Pick<ExtractConfig, "fetch" | "timeoutMs">> & { apiKey: string },
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  let response: Response;
  try {
    response = await cfg.fetch(`${API_BASE}${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    // Never surface the underlying error: it can embed the URL or request.
    throw controller.signal.aborted
      ? new ExtractError("PROVIDER_TIMEOUT", "The model request timed out.", true)
      : new ExtractError("PROVIDER_UNAVAILABLE", "The model service could not be reached.", true);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const s = response.status;
    if (s === 401 || s === 403) {
      throw new ExtractError("PROVIDER_AUTH", "Check the server-side Gemini API key and permissions.");
    }
    if (s === 429 || (s >= 500 && s <= 599)) {
      throw new ExtractError("PROVIDER_BUSY", "The model service is busy or unavailable.", true);
    }
    throw new ExtractError("PROVIDER_REQUEST", `The model service rejected the request (HTTP ${s}).`);
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ExtractError("INVALID_MODEL_OUTPUT", "The model service returned invalid JSON.", true);
  }
  return json;
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
  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (!fetchImpl) throw new ExtractError("CONFIGURATION", "No fetch implementation available.");
  const sleep = config.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const { encoded, contextText } = validateInput(input);
  const body = buildRequestBody(contextText, encoded);
  const today = vancouverToday((config.now ?? (() => new Date()))());
  const call = {
    fetch: fetchImpl,
    timeoutMs: config.timeoutMs ?? LIMITS.defaultTimeoutMs,
    apiKey,
  };

  const plan = primary === fallback ? [primary, primary] : [primary, primary, fallback];
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
      return { ...validateModelOutput(raw, today), model: plan[i] };
    } catch (e) {
      if (!(e instanceof ExtractError)) {
        throw new ExtractError("INVALID_MODEL_OUTPUT", "Extraction failed unexpectedly.", true);
      }
      if (e.code === "PROVIDER_AUTH" || e.code === "PROVIDER_BLOCKED") throw e;
      last = e;
      // A rejected request will not change on an identical retry of the same model.
      if (e.code === "PROVIDER_REQUEST" && plan[i + 1] === plan[i]) i++;
      if (i < plan.length - 1) await sleep(300);
    }
  }
  throw last ?? new ExtractError("PROVIDER_UNAVAILABLE", "Extraction failed.", true);
}
