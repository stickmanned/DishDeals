/**
 * Browser image resizing and recording frame extraction utilities (T-14A).
 *
 * Implements client-side canvas decoding for deal images and recording video frames.
 * Safe for SSR / module import (no window or document access at top-level).
 */

export const MAX_IMAGE_WIDTH = 1280;
export const MAX_IMAGE_HEIGHT = 3200;
export const MAX_INPUT_BYTES = 20 * 1024 * 1024; // 20 MiB
export const MAX_OUTPUT_FRAME_BYTES = 5 * 1024 * 1024; // 5 MiB
export const MAX_VIDEO_DURATION_SECONDS = 180;
export const DEFAULT_FRAME_COUNT = 4;
export const DEFAULT_JPEG_QUALITY = 0.85;
export const DEFAULT_LOAD_TIMEOUT_MS = 10000;
export const DEFAULT_SEEK_TIMEOUT_MS = 5000;

// Maximum pixel allocation (~4 megapixels) to prevent OOM on very tall or wide images
export const MAX_PIXEL_ALLOCATION = 1280 * 3200;

export const RECOGNIZED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/bmp",
] as const;

export const RECOGNIZED_IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
  ".bmp",
] as const;

export const RECOGNIZED_VIDEO_MIMES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/ogg",
  "video/x-matroska",
] as const;

export const RECOGNIZED_VIDEO_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".mov",
  ".ogg",
  ".mkv",
] as const;

export interface ResizeImageOptions {
  /** Maximum output width in pixels (defaults to 1280, capped at 1280). Never upscales. */
  maxWidth?: number;
  /** Maximum pixel allocation (defaults to 1280*3200 = 4,096,000, capped at default). */
  maxPixels?: number;
  /** JPEG compression quality (0.0 to 1.0, defaults to 0.85). */
  quality?: number;
  /** Optional AbortSignal to cancel decoding and cleanup resources. */
  signal?: AbortSignal;
  /** Image decode timeout in milliseconds (defaults to 10000). */
  timeoutMs?: number;
}

export interface GrabFramesOptions {
  /** Optional AbortSignal to cancel decoding and cleanup resources. */
  signal?: AbortSignal;
  /** Overall metadata/load timeout in milliseconds (defaults to 10000 + count * seekTimeout). */
  timeoutMs?: number;
  /** Individual frame seek and encode timeout in milliseconds (defaults to 5000). */
  seekTimeoutMs?: number;
  /** JPEG compression quality for frames (0.0 to 1.0, defaults to 0.85). */
  quality?: number;
}

/**
 * Validates optional configuration parameters for resizeImage.
 * Enforces positive finite integer bounds capped at safe defaults and quality in 0..1.
 */
export function validateResizeOptions(options?: ResizeImageOptions): void {
  if (!options) return;
  if (options.maxWidth !== undefined) {
    if (
      !Number.isFinite(options.maxWidth) ||
      options.maxWidth <= 0 ||
      options.maxWidth > MAX_IMAGE_WIDTH
    ) {
      throw new Error(
        `Invalid maxWidth: ${options.maxWidth}. Must be a positive finite number <= ${MAX_IMAGE_WIDTH}.`
      );
    }
  }
  if (options.maxPixels !== undefined) {
    if (
      !Number.isFinite(options.maxPixels) ||
      options.maxPixels < 1 ||
      options.maxPixels > MAX_PIXEL_ALLOCATION
    ) {
      throw new Error(
        `Invalid maxPixels: ${options.maxPixels}. Must be a finite number between 1 and ${MAX_PIXEL_ALLOCATION}.`
      );
    }
  }
  if (options.quality !== undefined) {
    if (!Number.isFinite(options.quality) || options.quality < 0 || options.quality > 1) {
      throw new Error(
        `Invalid JPEG quality: ${options.quality}. Quality must be a finite number between 0 and 1.`
      );
    }
  }
  if (options.timeoutMs !== undefined) {
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
      throw new Error(
        `Invalid timeoutMs: ${options.timeoutMs}. Timeout must be a positive finite number.`
      );
    }
  }
}

/**
 * Validates optional configuration parameters for grabFrames.
 */
export function validateGrabFramesOptions(options?: GrabFramesOptions): void {
  if (!options) return;
  if (options.quality !== undefined) {
    if (!Number.isFinite(options.quality) || options.quality < 0 || options.quality > 1) {
      throw new Error(
        `Invalid JPEG quality: ${options.quality}. Quality must be a finite number between 0 and 1.`
      );
    }
  }
  if (options.timeoutMs !== undefined) {
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
      throw new Error(
        `Invalid timeoutMs: ${options.timeoutMs}. Timeout must be a positive finite number.`
      );
    }
  }
  if (options.seekTimeoutMs !== undefined) {
    if (!Number.isFinite(options.seekTimeoutMs) || options.seekTimeoutMs <= 0) {
      throw new Error(
        `Invalid seekTimeoutMs: ${options.seekTimeoutMs}. Timeout must be a positive finite number.`
      );
    }
  }
}

/**
 * Checks whether the current runtime environment is a browser with DOM canvas support.
 */
export function isBrowserEnvironment(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof document.createElement === "function"
  );
}

/**
 * Extracts a lowercase file extension from a filename or path.
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot < 0) return "";
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Computes constrained target dimensions for resizing in O(1) time without decrement loops.
 *
 * Maintains aspect ratio, bounds width to maxWidth (<= 1280), height to MAX_IMAGE_HEIGHT (3200),
 * and total area to maxPixels (<= 4,096,000). Never upscales smaller images.
 *
 * Aspect ratio quantization note: Due to discrete integer pixel grid constraints (minimum 1px),
 * extreme aspect ratios (e.g. 1x1e9 or 1e9x1) are safely quantized to 1px on the thin axis
 * and capped by MAX_IMAGE_HEIGHT (3200px) or maxWidth (1280px), preserving stability without
 * allocating huge canvas memory.
 */
export function computeTargetDimensions(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number = MAX_IMAGE_WIDTH,
  maxPixels: number = MAX_PIXEL_ALLOCATION
): { width: number; height: number } {
  if (
    !Number.isFinite(srcWidth) ||
    !Number.isFinite(srcHeight) ||
    srcWidth <= 0 ||
    srcHeight <= 0
  ) {
    throw new Error(
      `Invalid source dimensions: ${srcWidth}x${srcHeight}. Dimensions must be positive finite numbers.`
    );
  }

  if (!Number.isFinite(maxWidth) || maxWidth <= 0 || maxWidth > MAX_IMAGE_WIDTH) {
    throw new Error(
      `Invalid maxWidth: ${maxWidth}. maxWidth must be a positive finite number <= ${MAX_IMAGE_WIDTH}.`
    );
  }

  if (!Number.isFinite(maxPixels) || maxPixels < 1 || maxPixels > MAX_PIXEL_ALLOCATION) {
    throw new Error(
      `Invalid maxPixels: ${maxPixels}. maxPixels must be a finite number between 1 and ${MAX_PIXEL_ALLOCATION}.`
    );
  }

  const effectiveMaxWidth = Math.min(MAX_IMAGE_WIDTH, Math.max(1, Math.floor(maxWidth)));
  const effectiveMaxPixels = Math.min(MAX_PIXEL_ALLOCATION, Math.max(1, Math.floor(maxPixels)));

  // Starting scale based on maxWidth and MAX_IMAGE_HEIGHT constraints (never upscale: scale <= 1.0)
  let scale = Math.min(1.0, effectiveMaxWidth / srcWidth, MAX_IMAGE_HEIGHT / srcHeight);

  // If pixel area at this scale exceeds effectiveMaxPixels, scale down further
  const areaAtScale = srcWidth * scale * (srcHeight * scale);
  if (areaAtScale > effectiveMaxPixels) {
    scale = Math.min(scale, Math.sqrt(effectiveMaxPixels / (srcWidth * srcHeight)));
  }

  let w = Math.max(1, Math.min(effectiveMaxWidth, Math.round(srcWidth * scale)));
  let h = Math.max(1, Math.min(MAX_IMAGE_HEIGHT, Math.round(srcHeight * scale)));

  // Direct O(1) floor adjustment if rounding caused w * h to exceed effectiveMaxPixels
  if (w * h > effectiveMaxPixels) {
    if (w >= h) {
      w = Math.max(1, Math.floor(effectiveMaxPixels / h));
    } else {
      h = Math.max(1, Math.floor(effectiveMaxPixels / w));
    }
  }

  // Never upscale: if source dimension was >= 1, output should not exceed original integer dimension
  if (srcWidth >= 1) w = Math.min(w, Math.floor(srcWidth));
  if (srcHeight >= 1) h = Math.min(h, Math.floor(srcHeight));

  w = Math.max(1, Math.min(effectiveMaxWidth, w));
  h = Math.max(1, Math.min(MAX_IMAGE_HEIGHT, h));

  if (w * h > effectiveMaxPixels) {
    if (w >= h) {
      w = Math.max(1, Math.floor(effectiveMaxPixels / h));
    } else {
      h = Math.max(1, Math.floor(effectiveMaxPixels / w));
    }
  }

  return { width: w, height: h };
}

/**
 * Computes deterministic interior sample times for extracting video frames.
 * Avoids 0.0s (often black / uninitialized) and duration (end-of-stream freeze) seek bugs.
 * Formula: duration * (i + 0.5) / count.
 */
export function computeFrameSampleTimes(
  duration: number,
  count: number = DEFAULT_FRAME_COUNT
): number[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(
      `Invalid video duration: ${duration}. Duration must be a positive finite number.`
    );
  }

  if (duration > MAX_VIDEO_DURATION_SECONDS) {
    throw new Error(
      `Video duration (${duration.toFixed(1)}s) exceeds maximum allowed duration of ${MAX_VIDEO_DURATION_SECONDS}s.`
    );
  }

  if (!Number.isInteger(count) || count < 1 || count > 4) {
    throw new Error(
      `Invalid frame count: ${count}. Frame count must be an integer between 1 and 4.`
    );
  }

  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    times.push((duration * (i + 0.5)) / count);
  }
  return times;
}

/**
 * Validates an image source blob or file against size bounds and recognized containers.
 * Explicitly rejects HEIC with a descriptive pending notice and rejects arbitrary non-image text.
 */
export function validateImageSource(file: Blob | File): {
  valid: boolean;
  error?: string;
  mimeType: string;
} {
  if (!file || typeof file.size !== "number") {
    return { valid: false, error: "Invalid image file input.", mimeType: "" };
  }

  if (file.size === 0) {
    return { valid: false, error: "Image file is empty (0 bytes).", mimeType: "" };
  }

  if (file.size > MAX_INPUT_BYTES) {
    return {
      valid: false,
      error: `Image size (${(file.size / (1024 * 1024)).toFixed(1)} MiB) exceeds maximum allowed limit of 20 MiB.`,
      mimeType: file.type || "",
    };
  }

  const rawMime = file.type ? file.type.toLowerCase().trim() : "";
  const filename = "name" in file && typeof file.name === "string" ? file.name : "";
  const ext = filename ? getFileExtension(filename) : "";

  // Check for HEIC / HEIF
  if (rawMime === "image/heic" || rawMime === "image/heif" || ext === ".heic" || ext === ".heif") {
    return {
      valid: false,
      error:
        "HEIC format is not universally supported in browser canvas; native HEIC conversion is pending.",
      mimeType: rawMime || "image/heic",
    };
  }

  if (rawMime) {
    const isRecognized = (RECOGNIZED_IMAGE_MIMES as readonly string[]).includes(rawMime);
    if (!isRecognized) {
      return {
        valid: false,
        error: `Unsupported image MIME type: ${rawMime}. Supported formats: JPEG, PNG, WebP, GIF, AVIF, BMP.`,
        mimeType: rawMime,
      };
    }
    return { valid: true, mimeType: rawMime };
  }

  // Fallback to filename extension when blob MIME type is empty
  if (ext) {
    const isRecognizedExt = (RECOGNIZED_IMAGE_EXTENSIONS as readonly string[]).includes(ext);
    if (!isRecognizedExt) {
      return {
        valid: false,
        error: `Unrecognized image extension: ${ext}. Supported formats: JPEG, PNG, WebP, GIF, AVIF, BMP.`,
        mimeType: "",
      };
    }
    return { valid: true, mimeType: `image/${ext.replace(".", "")}` };
  }

  return {
    valid: false,
    error: "Cannot determine image format: empty MIME type and no filename provided.",
    mimeType: "",
  };
}

/**
 * Validates a video source blob or file against size bounds, duration bounds, and recognized containers.
 */
export function validateVideoSource(
  file: Blob | File,
  count: number = DEFAULT_FRAME_COUNT
): {
  valid: boolean;
  error?: string;
  count: number;
  mimeType: string;
} {
  if (!file || typeof file.size !== "number") {
    return { valid: false, error: "Invalid video file input.", count, mimeType: "" };
  }

  if (file.size === 0) {
    return { valid: false, error: "Video file is empty (0 bytes).", count, mimeType: "" };
  }

  if (file.size > MAX_INPUT_BYTES) {
    return {
      valid: false,
      error: `Video size (${(file.size / (1024 * 1024)).toFixed(1)} MiB) exceeds maximum allowed limit of 20 MiB.`,
      count,
      mimeType: file.type || "",
    };
  }

  if (!Number.isInteger(count) || count < 1 || count > 4) {
    return {
      valid: false,
      error: `Frame count must be an integer between 1 and 4, received ${count}.`,
      count,
      mimeType: file.type || "",
    };
  }

  const rawMime = file.type ? file.type.toLowerCase().trim() : "";
  const filename = "name" in file && typeof file.name === "string" ? file.name : "";
  const ext = filename ? getFileExtension(filename) : "";

  if (rawMime) {
    const isRecognized = (RECOGNIZED_VIDEO_MIMES as readonly string[]).includes(rawMime);
    if (!isRecognized) {
      return {
        valid: false,
        error: `Unsupported video MIME type: ${rawMime}. Supported formats: MP4, WebM, QuickTime (MOV), Ogg, MKV.`,
        count,
        mimeType: rawMime,
      };
    }
    return { valid: true, count, mimeType: rawMime };
  }

  if (ext) {
    const isRecognizedExt = (RECOGNIZED_VIDEO_EXTENSIONS as readonly string[]).includes(ext);
    if (!isRecognizedExt) {
      return {
        valid: false,
        error: `Unrecognized video extension: ${ext}. Supported formats: MP4, WebM, QuickTime (MOV), Ogg, MKV.`,
        count,
        mimeType: "",
      };
    }
    return { valid: true, count, mimeType: `video/${ext.replace(".", "")}` };
  }

  return {
    valid: false,
    error: "Cannot determine video format: empty MIME type and no filename provided.",
    count,
    mimeType: "",
  };
}

/**
 * Resizes an image file in the browser using HTML5 Canvas.
 * Bounds max width to 1280px without upscaling, preserves aspect ratio,
 * paints a white background for JPEG transparency compatibility, and returns a JPEG Blob.
 */
export async function resizeImage(
  file: Blob | File,
  options?: ResizeImageOptions
): Promise<Blob> {
  if (!isBrowserEnvironment()) {
    throw new Error("resizeImage is only supported in a browser environment with canvas support.");
  }

  validateResizeOptions(options);

  if (options?.signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  const validation = validateImageSource(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const maxWidth = options?.maxWidth ?? MAX_IMAGE_WIDTH;
  const maxPixels = options?.maxPixels ?? MAX_PIXEL_ALLOCATION;
  const quality = options?.quality ?? DEFAULT_JPEG_QUALITY;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS;

  const objectUrl = URL.createObjectURL(file);
  const img = new Image();

  return new Promise<Blob>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let abortHandler: (() => void) | null = null;

    function cleanup() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (options?.signal && abortHandler) {
        options.signal.removeEventListener("abort", abortHandler);
        abortHandler = null;
      }
      img.onload = null;
      img.onerror = null;
      URL.revokeObjectURL(objectUrl);
      img.src = "";
    }

    function settleReject(err: Error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }

    function settleResolve(blob: Blob) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(blob);
    }

    if (options?.signal) {
      abortHandler = () => {
        settleReject(new DOMException("The operation was aborted.", "AbortError"));
      };
      if (options.signal.aborted) {
        settleReject(new DOMException("The operation was aborted.", "AbortError"));
        return;
      }
      options.signal.addEventListener("abort", abortHandler, { once: true });
    }

    timer = setTimeout(() => {
      settleReject(new Error(`Image decode timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    img.onload = () => {
      if (settled) return;

      try {
        const naturalWidth = img.naturalWidth || img.width;
        const naturalHeight = img.naturalHeight || img.height;

        if (!naturalWidth || !naturalHeight || naturalWidth <= 0 || naturalHeight <= 0) {
          settleReject(new Error("Decoded image has invalid dimensions (0x0)."));
          return;
        }

        const target = computeTargetDimensions(naturalWidth, naturalHeight, maxWidth, maxPixels);
        const canvas = document.createElement("canvas");
        canvas.width = target.width;
        canvas.height = target.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          settleReject(new Error("Unable to obtain 2D canvas rendering context."));
          return;
        }

        // Paint white background to prevent black background when transparent PNG/WebP converts to JPEG
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, target.width, target.height);
        ctx.drawImage(img, 0, 0, target.width, target.height);

        canvas.toBlob(
          (blob) => {
            if (settled) return; // Guard stale toBlob callback after cancel or timeout
            if (!blob) {
              settleReject(new Error("Canvas failed to encode image into JPEG blob."));
              return;
            }
            if (blob.size > MAX_OUTPUT_FRAME_BYTES) {
              settleReject(
                new Error(
                  `Resized image output size (${(blob.size / (1024 * 1024)).toFixed(1)} MiB) exceeds maximum 5 MiB frame limit.`
                )
              );
              return;
            }
            settleResolve(blob);
          },
          "image/jpeg",
          quality
        );
      } catch (err) {
        settleReject(
          err instanceof Error
            ? err
            : new Error("An unexpected error occurred during image canvas processing.")
        );
      }
    };

    img.onerror = () => {
      if (settled) return;
      settleReject(
        new Error("Failed to decode image: data is corrupted or unsupported format.")
      );
    };

    img.src = objectUrl;
  });
}

/**
 * Extracts an ordered array of sampled JPEG frames from a video file in the browser.
 * Uses deterministic interior sample times (avoiding 0.0s and duration), bounds dimensions to 1280px,
 * cleans up DOM resources and object URLs, enforces finite overall/seek deadlines, single settlement,
 * active inner step rejection on cancellation/timeout, and AbortSignal cancellation.
 */
export async function grabFrames(
  videoFile: Blob | File,
  frameCount: number = DEFAULT_FRAME_COUNT,
  options?: GrabFramesOptions
): Promise<Blob[]> {
  if (!isBrowserEnvironment()) {
    throw new Error("grabFrames is only supported in a browser environment with canvas support.");
  }

  validateGrabFramesOptions(options);

  if (options?.signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  const validation = validateVideoSource(videoFile, frameCount);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const count = validation.count;
  const seekTimeoutMs = options?.seekTimeoutMs ?? DEFAULT_SEEK_TIMEOUT_MS;
  const timeoutMs =
    options?.timeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS + count * seekTimeoutMs;
  const quality = options?.quality ?? DEFAULT_JPEG_QUALITY;

  const objectUrl = URL.createObjectURL(videoFile);
  const video = document.createElement("video");

  // Prevent background audio, playback controls, or hidden screen capture
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  return new Promise<Blob[]>((resolve, reject) => {
    let settled = false;
    let overallTimer: ReturnType<typeof setTimeout> | null = null;
    let seekTimer: ReturnType<typeof setTimeout> | null = null;
    let abortHandler: (() => void) | null = null;
    let cancelActiveStep: ((err: Error) => void) | null = null;

    function cleanup() {
      if (overallTimer) {
        clearTimeout(overallTimer);
        overallTimer = null;
      }
      if (seekTimer) {
        clearTimeout(seekTimer);
        seekTimer = null;
      }
      // Actively reject any currently awaited inner seek/encode step so the async coroutine immediately exits
      if (cancelActiveStep) {
        cancelActiveStep(
          options?.signal?.aborted
            ? new DOMException("The operation was aborted.", "AbortError")
            : new Error("Frame extraction was cancelled or timed out.")
        );
        cancelActiveStep = null;
      }
      if (options?.signal && abortHandler) {
        options.signal.removeEventListener("abort", abortHandler);
        abortHandler = null;
      }
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        // Ignore synthetic element errors
      }
      URL.revokeObjectURL(objectUrl);
    }

    function finishReject(err: Error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }

    function finishResolve(frames: Blob[]) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(frames);
    }

    if (options?.signal) {
      abortHandler = () => {
        finishReject(new DOMException("The operation was aborted.", "AbortError"));
      };
      if (options.signal.aborted) {
        finishReject(new DOMException("The operation was aborted.", "AbortError"));
        return;
      }
      options.signal.addEventListener("abort", abortHandler, { once: true });
    }

    // Overall operation deadline covering metadata load, all seeks, and all canvas encodings
    overallTimer = setTimeout(() => {
      finishReject(
        new Error(`Frame extraction timed out after overall deadline of ${timeoutMs}ms.`)
      );
    }, timeoutMs);

    video.onerror = () => {
      if (settled) return;
      finishReject(new Error("Failed to load video: media file is corrupted or unsupported format."));
    };

    video.onloadedmetadata = async () => {
      if (settled) return;

      try {
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) {
          finishReject(
            new Error(`Video has invalid or unknown duration (${duration}). Cannot extract frames.`)
          );
          return;
        }

        if (duration > MAX_VIDEO_DURATION_SECONDS) {
          finishReject(
            new Error(
              `Video duration (${duration.toFixed(1)}s) exceeds maximum allowed limit of ${MAX_VIDEO_DURATION_SECONDS}s.`
            )
          );
          return;
        }

        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        if (!videoWidth || !videoHeight || videoWidth <= 0 || videoHeight <= 0) {
          finishReject(new Error("Video has invalid dimensions (0x0)."));
          return;
        }

        const sampleTimes = computeFrameSampleTimes(duration, count);
        const target = computeTargetDimensions(videoWidth, videoHeight, MAX_IMAGE_WIDTH);

        const canvas = document.createElement("canvas");
        canvas.width = target.width;
        canvas.height = target.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finishReject(new Error("Unable to obtain 2D canvas context for frame extraction."));
          return;
        }

        const capturedFrames: Blob[] = [];

        // Sequentially seek and capture each frame
        for (let i = 0; i < sampleTimes.length; i++) {
          if (settled || options?.signal?.aborted) {
            finishReject(new DOMException("The operation was aborted.", "AbortError"));
            return;
          }

          const targetTime = sampleTimes[i];
          const frameBlob = await new Promise<Blob>((resolveSeek, rejectSeek) => {
            let seekStepFinished = false;

            cancelActiveStep = (stepErr: Error) => {
              if (seekStepFinished || settled) return;
              seekStepFinished = true;
              if (seekTimer) {
                clearTimeout(seekTimer);
                seekTimer = null;
              }
              video.onseeked = null;
              rejectSeek(stepErr);
            };

            // Timer covers BOTH the seeked event AND canvas.toBlob encoding (prevents hung encoder)
            seekTimer = setTimeout(() => {
              if (seekStepFinished || settled) return;
              seekStepFinished = true;
              video.onseeked = null;
              cancelActiveStep = null;
              rejectSeek(
                new Error(
                  `Seek or encode for frame ${i + 1} at ${targetTime.toFixed(2)}s timed out after ${seekTimeoutMs}ms.`
                )
              );
            }, seekTimeoutMs);

            video.onseeked = () => {
              if (seekStepFinished || settled) return;
              video.onseeked = null;

              try {
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, target.width, target.height);
                ctx.drawImage(video, 0, 0, target.width, target.height);

                canvas.toBlob(
                  (blob) => {
                    // Check if step or entire operation finished/timed out while encoding
                    if (seekStepFinished || settled) return;
                    seekStepFinished = true;
                    cancelActiveStep = null;
                    if (seekTimer) {
                      clearTimeout(seekTimer);
                      seekTimer = null;
                    }

                    if (!blob) {
                      rejectSeek(new Error(`Failed to encode frame ${i + 1} to JPEG blob.`));
                      return;
                    }
                    if (blob.size > MAX_OUTPUT_FRAME_BYTES) {
                      rejectSeek(
                        new Error(
                          `Extracted frame ${i + 1} size exceeds maximum upload limit of 5 MiB.`
                        )
                      );
                      return;
                    }
                    resolveSeek(blob);
                  },
                  "image/jpeg",
                  quality
                );
              } catch (drawErr) {
                if (seekStepFinished || settled) return;
                seekStepFinished = true;
                cancelActiveStep = null;
                if (seekTimer) {
                  clearTimeout(seekTimer);
                  seekTimer = null;
                }
                rejectSeek(
                  drawErr instanceof Error
                    ? drawErr
                    : new Error(`Failed to capture video frame at ${targetTime.toFixed(2)}s.`)
                );
              }
            };

            video.currentTime = targetTime;
          });

          cancelActiveStep = null;
          if (settled) return;
          capturedFrames.push(frameBlob);
        }

        // Return ordered frames without emitting partial arrays
        finishResolve(capturedFrames);
      } catch (procErr) {
        finishReject(
          procErr instanceof Error
            ? procErr
            : new Error("An unexpected error occurred during frame extraction.")
        );
      }
    };

    video.src = objectUrl;
  });
}
