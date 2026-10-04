import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prepareWorkflowImage } from "./image";

const jpeg = "data:image/jpeg;base64,/9j/AA==";
const close = vi.fn(), revoke = vi.fn(), draw = vi.fn();
const encode = vi.fn(() => jpeg);
let imageFails = false;
let canvas: { width: number; height: number; getContext: () => unknown; toDataURL: typeof encode };
beforeEach(() => {
  vi.clearAllMocks(); imageFails = false; encode.mockReturnValue(jpeg);
  canvas = { width: 0, height: 0, getContext: () => ({ fillRect: vi.fn(), drawImage: draw }), toDataURL: encode };
  vi.stubGlobal("document", { createElement: () => canvas });
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 2560, height: 1920, close }));
  vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:test-image"); static revokeObjectURL = revoke; });
  vi.stubGlobal("Image", class {
    naturalWidth = 400; naturalHeight = 300;
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => imageFails ? this.onerror?.() : this.onload?.()); }
  });
});
afterEach(() => { vi.unstubAllGlobals(); });
const file = (name = "offer.jpg", type = "image/jpeg") => new File([new Uint8Array([255, 216, 255, 0])], name, { type });

it("resizes the selected image within the payload bounds and releases its bitmap", async () => {
  const stages: string[] = [];
  expect(await prepareWorkflowImage(file(), stage => stages.push(stage))).toBe(jpeg);
  expect([canvas.width, canvas.height]).toEqual([1280, 960]);
  expect(close).toHaveBeenCalledOnce();
  expect(stages.at(-1)).toContain("Prepared JPG");
});
it.each(["missing", "rejected"])("uses the regular image loader when ImageBitmap is %s", async reason => {
  vi.stubGlobal("createImageBitmap", reason === "missing" ? undefined : vi.fn().mockRejectedValue(new Error("WebKit decode")));
  expect(await prepareWorkflowImage(file())).toBe(jpeg);
  expect([canvas.width, canvas.height]).toEqual([400, 300]);
  expect(revoke).toHaveBeenCalledWith("blob:test-image");
});
it("accepts absent picker MIME metadata and decodes HEIC locally before JPG export", async () => {
  expect(await prepareWorkflowImage(file("offer.JPG", ""))).toBe(jpeg);
  expect(await prepareWorkflowImage(file("offer.heic", "image/heic"))).toBe(jpeg);
});
it("reports decode failure and releases the fallback URL", async () => {
  vi.stubGlobal("createImageBitmap", undefined); imageFails = true;
  await expect(prepareWorkflowImage(file())).rejects.toThrow("couldn’t read");
  expect(revoke).toHaveBeenCalledWith("blob:test-image");
});
it("refuses empty, oversized, and unsupported files before decoding", async () => {
  await expect(prepareWorkflowImage(new File([], "empty.jpg", { type: "image/jpeg" }))).rejects.toThrow("empty");
  await expect(prepareWorkflowImage(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" }))).rejects.toThrow("10 MB");
  await expect(prepareWorkflowImage(file("clip.mp4", "video/mp4"))).rejects.toThrow("Choose a PNG");
  expect(createImageBitmap).not.toHaveBeenCalled();
});
it("never submits invalid canvas output or an image above the server limit", async () => {
  encode.mockReturnValue("data:,");
  await expect(prepareWorkflowImage(file())).rejects.toThrow("encode a JPG");
  encode.mockReturnValue("data:image/jpeg;base64,/9j/" + "A".repeat(450000));
  await expect(prepareWorkflowImage(file())).rejects.toThrow("still too large");
  expect(close).toHaveBeenCalledTimes(2);
});
