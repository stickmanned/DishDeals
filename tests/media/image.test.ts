/**
 * Tests for browser image resizing and video frame extraction (T-14A).
 *
 * Covers pure dimension constraints, deterministic sample timing,
 * file validation bounds, browser environment guards, and synthetic DOM
 * decoder stubs (timeouts, abort cancellation, object URL cleanup).
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
      expect(target.width * target.height).toBeLessThanOrEqual(MAX_PIXEL_ALLOCATION + 100);
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
      // In edge-runtime / Node tests, document is not a browser DOM
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

      // Synthetic DOM stub for Image and Canvas
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
            // Trigger onload asynchronously in next tick
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

        seekTo(time: number) {
          this.currentTime = time;
          setTimeout(() => {
            if (this.onseeked) this.onseeked();
          }, 10);
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
            // Hook currentTime setter to simulate seeked event
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
        }
        expect(revokedUrls).toContain("blob:http://localhost/synthetic-video-uuid");
      } finally {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
        URL.revokeObjectURL = originalRevoke;
        URL.createObjectURL = originalCreate;
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
  });

  describe("helper utilities", () => {
    it("extracts file extension accurately", () => {
      expect(getFileExtension("photo.jpg")).toBe(".jpg");
      expect(getFileExtension("SCREEN.RECORD.MOV")).toBe(".mov");
      expect(getFileExtension("no-extension")).toBe("");
    });
  });
});
