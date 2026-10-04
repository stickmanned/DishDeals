/**
 * Tests for browser image resizing and video frame extraction (T-14A).
 *
 * Covers pure dimension constraints, deterministic sample timing,
 * file validation bounds, browser environment guards, option validation,
 * and synthetic DOM decoder stubs (hung encoder, stalled seek, late metadata,
 * abort cancellation during encode, and object URL / listener cleanup).
 *
 * NOTE: Synthetic DOM decoder stubs are unit test fixtures, NOT actual phone
 * or live browser decoding evidence.
 */

import { describe, expect, it, vi } from "vitest";
import {
  computeFrameSampleTimes,
  computeTargetDimensions,
  getFileExtension,
  isBrowserEnvironment,
  resizeImage,
  grabFrames,
  validateImageSource,
  validateVideoSource,
  validateResizeOptions,
  validateGrabFramesOptions,
  MAX_IMAGE_WIDTH,
  MAX_INPUT_BYTES,
  MAX_OUTPUT_FRAME_BYTES,
  MAX_PIXEL_ALLOCATION,
  MAX_VIDEO_DURATION_SECONDS,
} from "../../lib/image";

describe("T-14A image and video frame core utilities", () => {
  describe("target dimension computation (computeTargetDimensions)", () => {
    it("downscales images wider than maxWidth while preserving aspect ratio", () => {
      // 2560x1440 (16:9) -> width 1280, height 720
      const target = computeTargetDimensions(2560, 1440, MAX_IMAGE_WIDTH);
      expect(target.width).toBe(1280);
      expect(target.height).toBe(720);
    });

    it("never upscales images smaller than maxWidth", () => {
      // 800x600 -> retains 800x600
      const target = computeTargetDimensions(800, 600, MAX_IMAGE_WIDTH);
      expect(target.width).toBe(800);
      expect(target.height).toBe(600);
    });

    it("preserves exact square dimensions", () => {
      const smallSquare = computeTargetDimensions(500, 500, MAX_IMAGE_WIDTH);
      expect(smallSquare.width).toBe(500);
      expect(smallSquare.height).toBe(500);

      const largeSquare = computeTargetDimensions(2000, 2000, MAX_IMAGE_WIDTH);
      expect(largeSquare.width).toBe(1280);
      expect(largeSquare.height).toBe(1280);
    });

    it("bounds very tall panoramic images safely within max pixel allocation", () => {
      // 1000 x 20000 = 20,000,000 pixels (exceeds MAX_PIXEL_ALLOCATION 4,096,000)
      const target = computeTargetDimensions(1000, 20000, MAX_IMAGE_WIDTH, MAX_PIXEL_ALLOCATION);
      expect(target.width * target.height).toBeLessThanOrEqual(MAX_PIXEL_ALLOCATION);
      expect(target.width).toBeLessThanOrEqual(MAX_IMAGE_WIDTH);
      // Aspect ratio (1:20) preserved within rounding
      expect(target.height / target.width).toBeCloseTo(20, 0);
    });

    it("throws on invalid non-positive or non-finite dimensions", () => {
      expect(() => computeTargetDimensions(0, 100)).toThrow("Invalid source dimensions");
      expect(() => computeTargetDimensions(100, -50)).toThrow("Invalid source dimensions");
      expect(() => computeTargetDimensions(NaN, 100)).toThrow("Invalid source dimensions");
      expect(() => computeTargetDimensions(100, Infinity)).toThrow("Invalid source dimensions");
    });

    it("throws on invalid maxWidth or maxPixels (prevents non-terminating loops)", () => {
      expect(() => computeTargetDimensions(100, 100, 0, 1000)).toThrow("Invalid maxWidth");
      expect(() => computeTargetDimensions(100, 100, -10, 1000)).toThrow("Invalid maxWidth");
      expect(() => computeTargetDimensions(100, 100, NaN, 1000)).toThrow("Invalid maxWidth");
      expect(() => computeTargetDimensions(100, 100, 1000, 0)).toThrow("Invalid maxPixels");
      expect(() => computeTargetDimensions(100, 100, 1000, -50)).toThrow("Invalid maxPixels");
      expect(() => computeTargetDimensions(100, 100, 1000, NaN)).toThrow("Invalid maxPixels");
    });

    it("safely handles extreme aspect ratios (1x1e9, 1x1e308, 1e308x1, 1e9x1) in O(1) time without decrement loops", () => {
      // 1x1e9: ultra-tall image. 1px width is discrete minimum, height capped at MAX_IMAGE_HEIGHT (3200)
      const tall1e9 = computeTargetDimensions(1, 1e9);
      expect(tall1e9.width).toBe(1);
      expect(tall1e9.height).toBe(3200);
      expect(tall1e9.width * tall1e9.height).toBeLessThanOrEqual(MAX_PIXEL_ALLOCATION);

      // 1x1e308: near-infinite tall image
      const tall1e308 = computeTargetDimensions(1, 1e308);
      expect(tall1e308.width).toBe(1);
      expect(tall1e308.height).toBe(3200);
      expect(tall1e308.width * tall1e308.height).toBeLessThanOrEqual(MAX_PIXEL_ALLOCATION);

      // 1e308x1: near-infinite wide image
      const wide1e308 = computeTargetDimensions(1e308, 1);
      expect(wide1e308.width).toBe(1280);
      expect(wide1e308.height).toBe(1);
      expect(wide1e308.width * wide1e308.height).toBeLessThanOrEqual(MAX_PIXEL_ALLOCATION);

      // 1e9x1: ultra-wide image
      const wide1e9 = computeTargetDimensions(1e9, 1);
      expect(wide1e9.width).toBe(1280);
      expect(wide1e9.height).toBe(1);
      expect(wide1e9.width * wide1e9.height).toBeLessThanOrEqual(MAX_PIXEL_ALLOCATION);
    });

    it("handles fractional maxWidth and maxPixels options safely into integer bounds", () => {
      const res = computeTargetDimensions(800, 600, 500.5, 200000.5);
      expect(Number.isInteger(res.width)).toBe(true);
      expect(Number.isInteger(res.height)).toBe(true);
      expect(res.width).toBeLessThanOrEqual(500);
      expect(res.width * res.height).toBeLessThanOrEqual(200000);
    });

    it("rejects oversized options exceeding MAX_IMAGE_WIDTH or MAX_PIXEL_ALLOCATION", () => {
      expect(() => computeTargetDimensions(100, 100, 2000)).toThrow("Invalid maxWidth");
      expect(() => computeTargetDimensions(100, 100, 1280, 10000000)).toThrow("Invalid maxPixels");
    });
  });

  describe("options validation (validateResizeOptions & validateGrabFramesOptions)", () => {
    it("validates resizeImage options strictly before allocation", () => {
      expect(() => validateResizeOptions({ maxWidth: -100 })).toThrow("Invalid maxWidth");
      expect(() => validateResizeOptions({ maxWidth: 0 })).toThrow("Invalid maxWidth");
      expect(() => validateResizeOptions({ maxWidth: 2000 })).toThrow("Invalid maxWidth");
      expect(() => validateResizeOptions({ maxPixels: 0 })).toThrow("Invalid maxPixels");
      expect(() => validateResizeOptions({ maxPixels: 10000000 })).toThrow("Invalid maxPixels");
      expect(() => validateResizeOptions({ quality: 1.5 })).toThrow("Invalid JPEG quality");
      expect(() => validateResizeOptions({ quality: -0.1 })).toThrow("Invalid JPEG quality");
      expect(() => validateResizeOptions({ timeoutMs: 0 })).toThrow("Invalid timeoutMs");
      expect(() => validateResizeOptions({ timeoutMs: -500 })).toThrow("Invalid timeoutMs");
      // Valid options pass without throwing
      expect(() =>
        validateResizeOptions({ maxWidth: 1280, maxPixels: 2000000, quality: 0.85, timeoutMs: 5000 })
      ).not.toThrow();
    });

    it("validates grabFrames options strictly before allocation", () => {
      expect(() => validateGrabFramesOptions({ quality: 1.1 })).toThrow("Invalid JPEG quality");
      expect(() => validateGrabFramesOptions({ quality: -0.5 })).toThrow("Invalid JPEG quality");
      expect(() => validateGrabFramesOptions({ timeoutMs: 0 })).toThrow("Invalid timeoutMs");
      expect(() => validateGrabFramesOptions({ seekTimeoutMs: -100 })).toThrow(
        "Invalid seekTimeoutMs"
      );
      // Valid options pass
      expect(() =>
        validateGrabFramesOptions({ quality: 0.9, timeoutMs: 10000, seekTimeoutMs: 3000 })
      ).not.toThrow();
    });
  });

  describe("video frame sample times computation (computeFrameSampleTimes)", () => {
    it("computes 4 deterministic interior sample times for 10-second video", () => {
      // Formula: duration * (i + 0.5) / 4
      // i=0: 10 * 0.5 / 4 = 1.25s
      // i=1: 10 * 1.5 / 4 = 3.75s
      // i=2: 10 * 2.5 / 4 = 6.25s
      // i=3: 10 * 3.5 / 4 = 8.75s
      const times = computeFrameSampleTimes(10, 4);
      expect(times).toEqual([1.25, 3.75, 6.25, 8.75]);
    });

    it("strictly avoids 0.0s and end-of-stream freeze times", () => {
      const times = computeFrameSampleTimes(60, 4);
      for (const t of times) {
        expect(t).toBeGreaterThan(0);
        expect(t).toBeLessThan(60);
      }
    });

    it("supports frame counts from 1 to 4", () => {
      expect(computeFrameSampleTimes(10, 1)).toEqual([5.0]);
      expect(computeFrameSampleTimes(10, 2)).toEqual([2.5, 7.5]);
      expect(computeFrameSampleTimes(10, 3)).toEqual([10 / 6, 30 / 6, 50 / 6]);
    });

    it("rejects frame counts outside 1..4", () => {
      expect(() => computeFrameSampleTimes(10, 0)).toThrow("Invalid frame count: 0");
      expect(() => computeFrameSampleTimes(10, 5)).toThrow("Invalid frame count: 5");
      expect(() => computeFrameSampleTimes(10, -1)).toThrow("Invalid frame count: -1");
    });

    it("rejects non-positive or excessive video duration", () => {
      expect(() => computeFrameSampleTimes(0, 4)).toThrow("Invalid video duration");
      expect(() => computeFrameSampleTimes(-10, 4)).toThrow("Invalid video duration");
      expect(() => computeFrameSampleTimes(NaN, 4)).toThrow("Invalid video duration");
      expect(() => computeFrameSampleTimes(181, 4)).toThrow(
        `exceeds maximum allowed duration of ${MAX_VIDEO_DURATION_SECONDS}s`
      );
    });
  });

  describe("image source validation (validateImageSource)", () => {
    it("accepts valid image MIME types within 20 MiB bound", () => {
      const validJpg = new Blob(["fake-data"], { type: "image/jpeg" });
      expect(validateImageSource(validJpg).valid).toBe(true);

      const validPng = new Blob(["fake-data"], { type: "image/png" });
      expect(validateImageSource(validPng).valid).toBe(true);

      const validWebp = new Blob(["fake-data"], { type: "image/webp" });
      expect(validateImageSource(validWebp).valid).toBe(true);
    });

    it("rejects files exceeding 20 MiB", () => {
      const largeBlob = {
        size: MAX_INPUT_BYTES + 1,
        type: "image/jpeg",
      } as Blob;
      const res = validateImageSource(largeBlob);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("exceeds maximum allowed limit of 20 MiB");
    });

    it("rejects 0-byte empty files", () => {
      const emptyBlob = new Blob([], { type: "image/jpeg" });
      const res = validateImageSource(emptyBlob);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Image file is empty (0 bytes)");
    });

    it("rejects HEIC format with explicit pending notice", () => {
      const heicBlob = new Blob(["heic-bytes"], { type: "image/heic" });
      const res = validateImageSource(heicBlob);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("native HEIC conversion is pending");

      const fileWithHeicExt = new File(["bytes"], "photo.heic", { type: "" });
      const resFile = validateImageSource(fileWithHeicExt);
      expect(resFile.valid).toBe(false);
      expect(resFile.error).toContain("native HEIC conversion is pending");
    });

    it("falls back to recognized filename extension when MIME type is empty", () => {
      const fileWithJpg = new File(["bytes"], "deal-post.jpg", { type: "" });
      const res = validateImageSource(fileWithJpg);
      expect(res.valid).toBe(true);
      expect(res.mimeType).toBe("image/jpg");
    });

    it("rejects arbitrary text or unrecognized files", () => {
      const textBlob = new Blob(["hello world"], { type: "text/plain" });
      expect(validateImageSource(textBlob).valid).toBe(false);

      const textFile = new File(["script content"], "script.sh", { type: "" });
      expect(validateImageSource(textFile).valid).toBe(false);
    });
  });

  describe("video source validation (validateVideoSource)", () => {
    it("accepts recognized video MIME types within 20 MiB", () => {
      const mp4Blob = new Blob(["video-bytes"], { type: "video/mp4" });
      expect(validateVideoSource(mp4Blob, 4).valid).toBe(true);

      const webmBlob = new Blob(["video-bytes"], { type: "video/webm" });
      expect(validateVideoSource(webmBlob, 4).valid).toBe(true);

      const movBlob = new Blob(["video-bytes"], { type: "video/quicktime" });
      expect(validateVideoSource(movBlob, 4).valid).toBe(true);
    });

    it("falls back to recognized video filename extension when MIME is empty", () => {
      const movFile = new File(["video-bytes"], "screen-record.mov", { type: "" });
      const res = validateVideoSource(movFile, 4);
      expect(res.valid).toBe(true);
      expect(res.mimeType).toBe("video/mov");
    });

    it("rejects video files exceeding 20 MiB", () => {
      const largeVideo = {
        size: MAX_INPUT_BYTES + 100,
        type: "video/mp4",
      } as Blob;
      const res = validateVideoSource(largeVideo, 4);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("exceeds maximum allowed limit of 20 MiB");
    });

    it("rejects 0-byte video files", () => {
      const emptyVideo = new Blob([], { type: "video/mp4" });
      expect(validateVideoSource(emptyVideo, 4).valid).toBe(false);
    });

    it("rejects arbitrary text and non-video files", () => {
      const textVideo = new Blob(["not a video"], { type: "text/plain" });
      expect(validateVideoSource(textVideo, 4).valid).toBe(false);
    });
  });

  describe("environment guards in non-browser environment", () => {
    it("reports false for isBrowserEnvironment when document is not fully defined", () => {
      if (typeof document === "undefined") {
        expect(isBrowserEnvironment()).toBe(false);
      }
    });

    it("throws helpful error when resizeImage or grabFrames is invoked in non-browser environment", async () => {
      if (typeof window === "undefined" || typeof document === "undefined") {
        const dummyBlob = new Blob(["data"], { type: "image/jpeg" });
        await expect(resizeImage(dummyBlob)).rejects.toThrow("browser environment");
        await expect(grabFrames(dummyBlob, 4)).rejects.toThrow("browser environment");
      }
    });
  });

  describe("synthetic DOM decoder stubs (labeled unit test harness, not live device evidence)", () => {
    it("resizes image, respects abort cancellation, and revokes object URL", async () => {
      const revokedUrls: string[] = [];
      const originalRevoke = URL.revokeObjectURL;
      const originalCreate = URL.createObjectURL;

      URL.createObjectURL = vi.fn(() => "blob:http://localhost/synthetic-img-uuid");
      URL.revokeObjectURL = vi.fn((url: string) => {
        revokedUrls.push(url);
      });

      const originalWindow = globalThis.window;
      const originalDocument = globalThis.document;

      class SyntheticImage {
        width = 2000;
        height = 1000;
        naturalWidth = 2000;
        naturalHeight = 1000;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        private _src = "";

        set src(val: string) {
          this._src = val;
          if (val) {
            setTimeout(() => {
              if (this.onload) this.onload();
            }, 10);
          }
        }
        get src() {
          return this._src;
        }
      }

      class SyntheticCanvas {
        width = 0;
        height = 0;
        getContext(type: string) {
          if (type === "2d") {
            return {
              fillStyle: "",
              fillRect: vi.fn(),
              drawImage: vi.fn(),
            };
          }
          return null;
        }
        toBlob(cb: (blob: Blob | null) => void, mime: string) {
          setTimeout(() => {
            cb(new Blob(["resized-jpeg-content"], { type: mime }));
          }, 5);
        }
      }

      globalThis.window = {} as unknown as Window & typeof globalThis;
      globalThis.document = {
        createElement: (tag: string) => {
          if (tag === "canvas") return new SyntheticCanvas() as unknown as HTMLCanvasElement;
          return {} as unknown as HTMLElement;
        },
      } as unknown as Document;
      // @ts-expect-error Mocking Image global
      globalThis.Image = SyntheticImage;

      try {
        const file = new File(["raw-bytes"], "photo.jpg", { type: "image/jpeg" });
        const resultBlob = await resizeImage(file, { maxWidth: 1280 });

        expect(resultBlob).toBeInstanceOf(Blob);
        expect(resultBlob.type).toBe("image/jpeg");
        expect(resultBlob.size).toBeLessThanOrEqual(MAX_OUTPUT_FRAME_BYTES);
        // Verify object URL was cleaned up
        expect(revokedUrls).toContain("blob:http://localhost/synthetic-img-uuid");

        // Test AbortSignal cancellation
        const controller = new AbortController();
        controller.abort();
        await expect(
          resizeImage(file, { signal: controller.signal })
        ).rejects.toThrow("The operation was aborted");
      } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
        URL.revokeObjectURL = originalRevoke;
        URL.createObjectURL = originalCreate;
      }
    });

    it("cleans up abort listener and revokes URL when resizeImage times out", async () => {
      const revokedUrls: string[] = [];
      const originalRevoke = URL.revokeObjectURL;
      const originalCreate = URL.createObjectURL;

      URL.createObjectURL = vi.fn(() => "blob:http://localhost/synthetic-timeout-uuid");
      URL.revokeObjectURL = vi.fn((url: string) => {
        revokedUrls.push(url);
      });

      const originalWindow = globalThis.window;
      const originalDocument = globalThis.document;

      class HangingImage {
        width = 100;
        height = 100;
        naturalWidth = 100;
        naturalHeight = 100;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        // Never triggers onload or onerror
      }

      globalThis.window = {} as unknown as Window & typeof globalThis;
      globalThis.document = {
        createElement: () => ({} as unknown as HTMLElement),
      } as unknown as Document;
      // @ts-expect-error Mocking Image global
      globalThis.Image = HangingImage;

      const controller = new AbortController();
      const removeSpy = vi.spyOn(controller.signal, "removeEventListener");

      try {
        const file = new File(["bytes"], "slow.jpg", { type: "image/jpeg" });
        await expect(
          resizeImage(file, { timeoutMs: 20, signal: controller.signal })
        ).rejects.toThrow("Image decode timed out after 20ms");

        expect(revokedUrls).toContain("blob:http://localhost/synthetic-timeout-uuid");
        expect(removeSpy).toHaveBeenCalledWith("abort", expect.any(Function));
      } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
        URL.revokeObjectURL = originalRevoke;
        URL.createObjectURL = originalCreate;
      }
    });

    it("extracts ordered video frames, sequential seeks, and handles seek errors", async () => {
      const revokedUrls: string[] = [];
      const originalRevoke = URL.revokeObjectURL;
      const originalCreate = URL.createObjectURL;

      URL.createObjectURL = vi.fn(() => "blob:http://localhost/synthetic-video-uuid");
      URL.revokeObjectURL = vi.fn((url: string) => {
        revokedUrls.push(url);
      });

      const originalWindow = globalThis.window;
      const originalDocument = globalThis.document;

      class SyntheticVideoElement {
        duration = 10;
        videoWidth = 1920;
        videoHeight = 1080;
        muted = false;
        playsInline = false;
        preload = "";
        onloadedmetadata: (() => void) | null = null;
        onseeked: (() => void) | null = null;
        onerror: (() => void) | null = null;
        currentTime = 0;
        private _src = "";

        set src(val: string) {
          this._src = val;
          if (val) {
            setTimeout(() => {
              if (this.onloadedmetadata) this.onloadedmetadata();
            }, 10);
          }
        }
        get src() {
          return this._src;
        }

        pause = vi.fn();
        removeAttribute = vi.fn();
        load = vi.fn();
      }

      class SyntheticCanvas {
        width = 0;
        height = 0;
        getContext(type: string) {
          if (type === "2d") {
            return {
              fillStyle: "",
              fillRect: vi.fn(),
              drawImage: vi.fn(),
            };
          }
          return null;
        }
        toBlob(cb: (blob: Blob | null) => void, mime: string) {
          setTimeout(() => {
            cb(new Blob(["frame-jpeg-content"], { type: mime }));
          }, 5);
        }
      }

      let syntheticVideo: SyntheticVideoElement | null = null;

      globalThis.window = {} as unknown as Window & typeof globalThis;
      globalThis.document = {
        createElement: (tag: string) => {
          if (tag === "video") {
            syntheticVideo = new SyntheticVideoElement();
            let current = 0;
            Object.defineProperty(syntheticVideo, "currentTime", {
              get: () => current,
              set: function (this: SyntheticVideoElement, val: number) {
                current = val;
                setTimeout(() => {
                  if (this.onseeked) this.onseeked();
                }, 5);
              },
            });
            return syntheticVideo as unknown as HTMLVideoElement;
          }
          if (tag === "canvas") {
            return new SyntheticCanvas() as unknown as HTMLCanvasElement;
          }
          return {} as unknown as HTMLElement;
        },
      } as unknown as Document;

      try {
        const videoFile = new File(["fake-video-bytes"], "record.mp4", { type: "video/mp4" });
        const frames = await grabFrames(videoFile, 4);

        expect(frames.length).toBe(4);
        for (const frame of frames) {
          expect(frame).toBeInstanceOf(Blob);
          expect(frame.type).toBe("image/jpeg");
          expect(frame.size).toBeLessThanOrEqual(MAX_OUTPUT_FRAME_BYTES);
        }
        expect(revokedUrls).toContain("blob:http://localhost/synthetic-video-uuid");
      } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
        URL.revokeObjectURL = originalRevoke;
        URL.createObjectURL = originalCreate;
      }
    });

    it("settles on hung encoder in grabFrames without hanging forever", async () => {
      const originalWindow = globalThis.window;
      const originalDocument = globalThis.document;

      class HungCanvas {
        width = 100;
        height = 100;
        getContext() {
          return {
            fillStyle: "",
            fillRect: vi.fn(),
            drawImage: vi.fn(),
          };
        }
        // Hung canvas encoder: toBlob never invokes its callback
        toBlob() {}
      }

      class FastVideoElement {
        duration = 5;
        videoWidth = 640;
        videoHeight = 480;
        muted = false;
        playsInline = false;
        preload = "";
        onloadedmetadata: (() => void) | null = null;
        onseeked: (() => void) | null = null;
        onerror: (() => void) | null = null;
        currentTime = 0;

        set src(val: string) {
          if (val) {
            setTimeout(() => {
              if (this.onloadedmetadata) this.onloadedmetadata();
            }, 5);
          }
        }

        pause = vi.fn();
        removeAttribute = vi.fn();
        load = vi.fn();
      }

      globalThis.window = {} as unknown as Window & typeof globalThis;
      globalThis.document = {
        createElement: (tag: string) => {
          if (tag === "video") {
            const v = new FastVideoElement();
            Object.defineProperty(v, "currentTime", {
              get: () => 0,
              set: function (this: FastVideoElement) {
                setTimeout(() => {
                  if (this.onseeked) this.onseeked();
                }, 5);
              },
            });
            return v as unknown as HTMLVideoElement;
          }
          if (tag === "canvas") {
            return new HungCanvas() as unknown as HTMLCanvasElement;
          }
          return {} as unknown as HTMLElement;
        },
      } as unknown as Document;

      try {
        const videoFile = new File(["bytes"], "hung.mp4", { type: "video/mp4" });
        // seekTimeoutMs: 30ms ensures the hung toBlob is timed out quickly without hanging the test suite
        await expect(grabFrames(videoFile, 2, { seekTimeoutMs: 30 })).rejects.toThrow(
          "timed out after 30ms"
        );
      } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
      }
    });

    it("settles on stalled video seek without hanging forever", async () => {
      const originalWindow = globalThis.window;
      const originalDocument = globalThis.document;

      class StalledSeekVideo {
        duration = 5;
        videoWidth = 640;
        videoHeight = 480;
        muted = false;
        playsInline = false;
        preload = "";
        onloadedmetadata: (() => void) | null = null;
        onseeked: (() => void) | null = null;
        onerror: (() => void) | null = null;
        currentTime = 0;

        set src(val: string) {
          if (val) {
            setTimeout(() => {
              if (this.onloadedmetadata) this.onloadedmetadata();
            }, 5);
          }
        }

        pause = vi.fn();
        removeAttribute = vi.fn();
        load = vi.fn();
        // currentTime setter never fires onseeked
      }

      globalThis.window = {} as unknown as Window & typeof globalThis;
      globalThis.document = {
        createElement: (tag: string) => {
          if (tag === "video") return new StalledSeekVideo() as unknown as HTMLVideoElement;
          if (tag === "canvas") {
            return {
              width: 100,
              height: 100,
              getContext: () => ({ fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() }),
              toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(["x"], { type: "image/jpeg" })),
            } as unknown as HTMLCanvasElement;
          }
          return {} as unknown as HTMLElement;
        },
      } as unknown as Document;

      try {
        const videoFile = new File(["bytes"], "stalled.mp4", { type: "video/mp4" });
        await expect(grabFrames(videoFile, 2, { seekTimeoutMs: 30 })).rejects.toThrow(
          "timed out after 30ms"
        );
      } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
      }
    });

    it("handles late metadata gracefully after timeout with single settlement", async () => {
      const originalWindow = globalThis.window;
      const originalDocument = globalThis.document;

      let capturedVideo: { onloadedmetadata: (() => void) | null } | null = null;

      class SlowMetadataVideo {
        duration = 10;
        videoWidth = 640;
        videoHeight = 480;
        onloadedmetadata: (() => void) | null = null;
        onerror: (() => void) | null = null;
        pause = vi.fn();
        removeAttribute = vi.fn();
        load = vi.fn();
      }

      globalThis.window = {} as unknown as Window & typeof globalThis;
      globalThis.document = {
        createElement: (tag: string) => {
          if (tag === "video") {
            const v = new SlowMetadataVideo();
            capturedVideo = v;
            return v as unknown as HTMLVideoElement;
          }
          return {} as unknown as HTMLElement;
        },
      } as unknown as Document;

      try {
        const videoFile = new File(["bytes"], "slowmeta.mp4", { type: "video/mp4" });
        await expect(grabFrames(videoFile, 2, { timeoutMs: 20 })).rejects.toThrow(
          "timed out after overall deadline of 20ms"
        );

        // Trigger metadata after timeout has settled
        expect(() => {
          if (capturedVideo?.onloadedmetadata) {
            capturedVideo.onloadedmetadata();
          }
        }).not.toThrow();
      } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
      }
    });

    it("aborts video frame grab on AbortSignal without emitting partial frames", async () => {
      const originalWindow = globalThis.window;
      const originalDocument = globalThis.document;

      globalThis.window = {} as unknown as Window & typeof globalThis;
      globalThis.document = {
        createElement: () =>
          ({
            pause: vi.fn(),
            removeAttribute: vi.fn(),
            load: vi.fn(),
          }) as unknown as HTMLElement,
      } as unknown as Document;

      const controller = new AbortController();
      controller.abort();

      const videoFile = new File(["bytes"], "vid.mp4", { type: "video/mp4" });
      await expect(grabFrames(videoFile, 4, { signal: controller.signal })).rejects.toThrow(
        "The operation was aborted"
      );

      globalThis.window = originalWindow;
      globalThis.document = originalDocument;
    });

    it("settles inner coroutine immediately when aborted during pending canvas encoding with no late capture", async () => {
      const originalWindow = globalThis.window;
      const originalDocument = globalThis.document;

      let pendingToBlobCallback: ((blob: Blob | null) => void) | null = null;
      let seekCount = 0;
      let metadataPromise: Promise<void> | null = null;

      class PendingEncodeCanvas {
        width = 640;
        height = 480;
        getContext() {
          return {
            fillStyle: "",
            fillRect: vi.fn(),
            drawImage: vi.fn(),
          };
        }
        toBlob(cb: (blob: Blob | null) => void) {
          // Keep callback pending so we can abort while encoding is in-flight
          pendingToBlobCallback = cb;
        }
      }

      class SteppingVideo {
        duration = 10;
        videoWidth = 640;
        videoHeight = 480;
        muted = false;
        playsInline = false;
        preload = "";
        onloadedmetadata: (() => void) | null = null;
        onseeked: (() => void) | null = null;
        onerror: (() => void) | null = null;
        currentTime = 0;

        set src(val: string) {
          if (val) {
            setTimeout(() => {
              if (this.onloadedmetadata) {
                // Capture the actual Promise returned by the async onloadedmetadata callback
                metadataPromise = (this.onloadedmetadata as () => Promise<void>)();
              }
            }, 5);
          }
        }

        pause = vi.fn();
        removeAttribute = vi.fn();
        load = vi.fn();
      }

      globalThis.window = {} as unknown as Window & typeof globalThis;
      globalThis.document = {
        createElement: (tag: string) => {
          if (tag === "video") {
            const v = new SteppingVideo();
            Object.defineProperty(v, "currentTime", {
              get: () => 0,
              set: function (this: SteppingVideo) {
                seekCount++;
                setTimeout(() => {
                  if (this.onseeked) this.onseeked();
                }, 5);
              },
            });
            return v as unknown as HTMLVideoElement;
          }
          if (tag === "canvas") {
            return new PendingEncodeCanvas() as unknown as HTMLCanvasElement;
          }
          return {} as unknown as HTMLElement;
        },
      } as unknown as Document;

      const controller = new AbortController();

      try {
        const videoFile = new File(["bytes"], "step.mp4", { type: "video/mp4" });
        const grabPromise = grabFrames(videoFile, 2, { signal: controller.signal });

        // Wait until canvas.toBlob is called and pendingToBlobCallback is captured
        await vi.waitFor(() => {
          expect(pendingToBlobCallback).not.toBeNull();
        });

        expect(seekCount).toBe(1);

        // Abort while canvas.toBlob is actively in flight
        controller.abort();

        // The outer grabFrames promise must reject immediately with AbortError
        await expect(grabPromise).rejects.toThrow("The operation was aborted");

        // Assert that the async video.onloadedmetadata callback Promise itself resolves,
        // proving that the inner awaited seekStep Promise was actively rejected and
        // the async coroutine exited rather than leaking/suspending forever in memory
        expect(metadataPromise).not.toBeNull();
        await expect(metadataPromise).resolves.toBeUndefined();

        // Now simulate the in-flight canvas encoder eventually finishing late
        expect(pendingToBlobCallback).not.toBeNull();
        if (pendingToBlobCallback) {
          expect(() => {
            pendingToBlobCallback!(new Blob(["late-frame"], { type: "image/jpeg" }));
          }).not.toThrow();
        }

        // Verify that no subsequent seek occurred (frame 2 was never sought)
        // and inner work settled cleanly without late capture
        expect(seekCount).toBe(1);
      } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
      }
    });

    it("settles inner coroutine immediately on seek/encode timeout, resolving metadata callback Promise", async () => {
      const originalWindow = globalThis.window;
      const originalDocument = globalThis.document;

      let metadataPromise: Promise<void> | null = null;

      class HungCanvas {
        width = 640;
        height = 480;
        getContext() {
          return { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
        }
        toBlob() {
          // Never calls back
        }
      }

      class SteppingVideo {
        duration = 10;
        videoWidth = 640;
        videoHeight = 480;
        onloadedmetadata: (() => void) | null = null;
        onseeked: (() => void) | null = null;
        currentTime = 0;

        set src(val: string) {
          if (val) {
            setTimeout(() => {
              if (this.onloadedmetadata) {
                metadataPromise = (this.onloadedmetadata as () => Promise<void>)();
              }
            }, 5);
          }
        }

        pause = vi.fn();
        removeAttribute = vi.fn();
        load = vi.fn();
      }

      globalThis.window = {} as unknown as Window & typeof globalThis;
      globalThis.document = {
        createElement: (tag: string) => {
          if (tag === "video") {
            const v = new SteppingVideo();
            Object.defineProperty(v, "currentTime", {
              get: () => 0,
              set: function (this: SteppingVideo) {
                setTimeout(() => {
                  if (this.onseeked) this.onseeked();
                }, 5);
              },
            });
            return v as unknown as HTMLVideoElement;
          }
          if (tag === "canvas") {
            return new HungCanvas() as unknown as HTMLCanvasElement;
          }
          return {} as unknown as HTMLElement;
        },
      } as unknown as Document;

      try {
        const videoFile = new File(["bytes"], "timeout-step.mp4", { type: "video/mp4" });
        const grabPromise = grabFrames(videoFile, 2, { seekTimeoutMs: 30 });

        await expect(grabPromise).rejects.toThrow("timed out after 30ms");

        // The async onloadedmetadata coroutine Promise must have resolved upon timeout rejection
        expect(metadataPromise).not.toBeNull();
        await expect(metadataPromise).resolves.toBeUndefined();
      } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
      }
    });
  });

  describe("helper utilities", () => {
    it("extracts file extension accurately", () => {
      expect(getFileExtension("photo.jpg")).toBe(".jpg");
      expect(getFileExtension("SCREEN.RECORD.MOV")).toBe(".mov");
      expect(getFileExtension("no-extension")).toBe("");
    });
  });
});
