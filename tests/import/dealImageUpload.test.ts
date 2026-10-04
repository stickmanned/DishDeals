// Pure helper tests with SYNTHETIC bytes and a fake fetch. Not a real browser, picker, deployment or phone.
import { describe, expect, it, vi } from "vitest";
import {
  MAX_IMAGE_BYTES, MAX_UPLOAD_TIMEOUT_MS, checkImageChoice, classifyUploadImage, declaredImageType, imageCorsHeaders, isUploadType,
  parseDeclaredLength, uploadDealImage, validUploadUrl,
} from "../../lib/dealImageUpload";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const bytes = (head: number[], size = 64) => { const b = new Uint8Array(size); b.set(head); return b; };
const webp = () => bytes([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]);
const heic = () => bytes([0, 0, 0, 24, ...Buffer.from("ftypheic"), 0, 0, 0, 0, ...Buffer.from("heicmif1")]);

describe("classifyUploadImage (format evidence only)", () => {
  it("recognises JPEG, PNG and WebP", () => {
    expect(classifyUploadImage(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(classifyUploadImage(bytes(PNG))).toBe("image/png");
    expect(classifyUploadImage(webp())).toBe("image/webp");
  });
  it.each([
    ["HEIC", heic()], ["HEIF-style mif1", bytes([0, 0, 0, 24, ...Buffer.from("ftypmif1")])], ["MP4", bytes([0, 0, 0, 24, ...Buffer.from("ftypisom")])],
    ["PNG prefix only", bytes(PNG.slice(0, 4))], ["corrupted PNG signature", bytes([...PNG.slice(0, 4), 0, 0x0a, 0x1a, 0x0a])], ["RIFF but not WebP", bytes([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WAVE")])],
    ["GIF", bytes([...Buffer.from("GIF89a")])], ["HTML", new TextEncoder().encode("<html><body>x</body></html>")], ["empty", new Uint8Array()], ["two bytes of JPEG", bytes([0xff, 0xd8], 2)],
  ])("rejects %s", (_n, b) => expect(classifyUploadImage(b)).toBeNull());
  it("only the three formats are upload types", () => {
    for (const t of ["image/jpeg", "image/png", "image/webp"]) expect(isUploadType(t)).toBe(true);
    for (const t of ["image/heic", "image/heif", "image/gif", "text/html", "", null, undefined]) expect(isUploadType(t)).toBe(false);
  });
});

describe("headers and URL", () => {
  it("CORS echoes one origin, no wildcard, no credentials flag", () => {
    const h = imageCorsHeaders("https://app.example.com");
    expect(h["Access-Control-Allow-Origin"]).toBe("https://app.example.com");
    expect(Object.values(h).join(" ")).not.toContain("*");
    expect(h["Access-Control-Allow-Credentials"]).toBeUndefined();
    expect(h["Access-Control-Allow-Headers"]).toBe("Authorization, Content-Type");
  });
  it("parses an optional plain-integer Content-Length", () => {
    expect(parseDeclaredLength(null)).toBeNull();
    expect(parseDeclaredLength("1234")).toBe(1234);
    for (const bad of ["", "12abc", "-5", "1e3", " 5", "1234567890", "0x10"]) expect(parseDeclaredLength(bad)).toBe("invalid");
  });
  it("accepts only the /deal-image URL over https (or localhost)", () => {
    expect(validUploadUrl("https://x.convex.site/deal-image")).toBe(true);
    expect(validUploadUrl("http://localhost:3211/deal-image")).toBe(true);
    for (const bad of ["http://evil.example/deal-image", "https://x.convex.site/other", "https://x.convex.site/deal-image?x=1", "https://u:p@x.convex.site/deal-image", "nope"]) expect(validUploadUrl(bad)).toBe(false);
  });
});

describe("browser file checks", () => {
  const f = (name: string, type: string, size: number) => ({ name, type, size });
  it("accepts jpeg/png/webp and uses the extension only when no type is reported", () => {
    expect(checkImageChoice(f("a.jpg", "image/jpeg", 10))).toBeNull();
    expect(checkImageChoice(f("a.PNG", "", 10))).toBeNull();
    expect(declaredImageType(f("a.jpeg", "", 1))).toBe("image/jpeg");
    expect(declaredImageType(f("a.webp", "IMAGE/WEBP", 1))).toBe("image/webp");
  });
  it("rejects empty, oversize, HEIC and other files", () => {
    expect(checkImageChoice(f("a.png", "image/png", 0))).toBe("empty");
    expect(checkImageChoice(f("a.png", "image/png", NaN))).toBe("empty");
    expect(checkImageChoice(f("a.png", "image/png", MAX_IMAGE_BYTES))).toBeNull();
    expect(checkImageChoice(f("a.png", "image/png", MAX_IMAGE_BYTES + 1))).toBe("too_large");
    for (const bad of [f("a.heic", "image/heic", 10), f("a.gif", "image/gif", 10), f("a.pdf", "application/pdf", 10), f("a.txt", "", 10)]) expect(checkImageChoice(bad)).toBe("unsupported_type");
    expect(declaredImageType(f("a.heic", "image/heic", 1))).toBeNull();
  });
});

describe("uploadDealImage", () => {
  const file = Object.assign(new Blob([bytes(PNG)], { type: "image/png" }), { name: "a.png" });
  const args = { uploadUrl: "https://x.convex.site/deal-image", token: "synthetic-bearer", file };
  const reply = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
  const stalledBody = () => new Response(new ReadableStream({ start() { /* never produces */ } }), { status: 200 });
  it("reports ok only for a {storageId} receipt, with Bearer and the declared type", async () => {
    const fetchImpl = reply(200, { storageId: "kg2abc123def456" });
    expect(await uploadDealImage(args, fetchImpl as never)).toEqual({ ok: true, storageId: "kg2abc123def456" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe(args.uploadUrl);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer synthetic-bearer", "Content-Type": "image/png" });
    expect(init.body).toBe(file);
  });
  it.each([[{}], [{ storageId: 5 }], [{ storageId: "" }], [{ storageId: "has space id" }], [{ storageId: "x" }]])("a 200 without a valid receipt is not success: %j", async body => {
    expect(await uploadDealImage(args, reply(200, body) as never)).toEqual({ ok: false, reason: "unexpected" });
  });
  it("maps statuses and network errors", async () => {
    expect(await uploadDealImage(args, reply(401) as never)).toEqual({ ok: false, reason: "auth" });
    expect(await uploadDealImage(args, reply(429) as never)).toEqual({ ok: false, reason: "rate_limited" });
    for (const s of [400, 403, 408, 413, 415]) expect(await uploadDealImage(args, reply(s) as never)).toEqual({ ok: false, reason: "rejected" });
    expect(await uploadDealImage(args, reply(500) as never)).toEqual({ ok: false, reason: "unexpected" });
    expect(await uploadDealImage(args, vi.fn(async () => { throw new Error("offline"); }) as never)).toEqual({ ok: false, reason: "network" });
  });
  it("times out a hung request and a stalled receipt body", async () => {
    let signal: AbortSignal | undefined;
    const hang = vi.fn((_u: string, init: RequestInit) => { signal = init.signal as AbortSignal; return new Promise<Response>(() => {}); });
    expect(await uploadDealImage({ ...args, timeoutMs: 20 }, hang as never)).toEqual({ ok: false, reason: "timeout" });
    expect(signal!.aborted).toBe(true);
    expect(await uploadDealImage({ ...args, timeoutMs: 20 }, vi.fn(async () => stalledBody()) as never)).toEqual({ ok: false, reason: "timeout" });
  });
  it("a caller abort ends the upload as aborted", async () => {
    const early = new AbortController(); early.abort();
    const spy = vi.fn();
    expect(await uploadDealImage({ ...args, signal: early.signal }, spy as never)).toEqual({ ok: false, reason: "aborted" });
    expect(spy).not.toHaveBeenCalled();
    const live = new AbortController();
    const pending = uploadDealImage({ ...args, signal: live.signal }, vi.fn(() => new Promise<Response>(() => {})) as never);
    live.abort();
    expect(await pending).toEqual({ ok: false, reason: "aborted" });
  });
  it.each([0, -1, NaN, Infinity, MAX_UPLOAD_TIMEOUT_MS + 1])("rejects an invalid timeout %s without fetching", async timeoutMs => {
    const spy = vi.fn();
    expect(await uploadDealImage({ ...args, timeoutMs }, spy as never)).toEqual({ ok: false, reason: "invalid" });
    expect(spy).not.toHaveBeenCalled();
  });
  it("does not fetch for invalid inputs and never logs the token", async () => {
    const logs = (["log", "error", "warn"] as const).map(m => vi.spyOn(console, m).mockImplementation(() => {}));
    const spy = vi.fn();
    const bad = [{ ...args, token: "" }, { ...args, uploadUrl: "http://evil.example/deal-image" }, { ...args, file: Object.assign(new Blob(["x"], { type: "image/heic" }), { name: "a.heic" }) }, { ...args, file: Object.assign(new Blob([], { type: "image/png" }), { name: "a.png" }) }];
    for (const a of bad) expect(await uploadDealImage(a, spy as never)).toEqual({ ok: false, reason: "invalid" });
    expect(spy).not.toHaveBeenCalled();
    await uploadDealImage(args, vi.fn(async () => { throw new Error("synthetic-bearer"); }) as never);
    for (const l of logs) { expect(l).not.toHaveBeenCalled(); l.mockRestore(); }
  });
});
