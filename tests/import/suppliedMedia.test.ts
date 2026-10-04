// Pure helper tests with SYNTHETIC bytes, fake probes and a fake fetch. Not a
// real browser, WKWebView, Photos picker, upload to a deployment or provider.
import { describe, expect, it, vi } from "vitest";
import {
  MAX_CAPTION_BYTES, MAX_CAPTION_CHARS, MAX_MEDIA_BYTES, MAX_META_HEADER_CHARS, buildUploadRequest, checkFileChoice, classifyMedia, corsHeaders, declaredTypeFor,
  encodeUploadMeta, originAllowed, parseConfiguredOrigin, parseUploadMeta, parseUploadQuery, parseUploadRequest, readVideoDuration, uploadSuppliedReel,
  validateCaption, validateDuration, validatePublishedAt, type VideoProbe,
} from "../../lib/reels/suppliedMedia";

const ftyp = (brand: string, size = 24) => {
  const b = new Uint8Array(Math.max(size, 16));
  new DataView(b.buffer).setUint32(0, size);
  b.set([..."ftyp"].map(c => c.charCodeAt(0)), 4);
  b.set([...brand].map(c => c.charCodeAt(0)), 8);
  return b;
};
const NOW = Date.parse("2026-10-04T12:00:00Z");
const q = (qs: string) => parseUploadQuery(new URL(`https://x.convex.site/reel-source?${qs}`));
const ID = "k17abcdefghijklmnop";

describe("classifyMedia (signature only)", () => {
  it("maps MP4 brands to video/mp4 and QuickTime to the provider's video/mov", () => {
    for (const b of ["isom", "mp42", "mp41", "avc1", "M4V ", "iso2"]) expect(classifyMedia(ftyp(b))).toEqual({ declared: "video/mp4", providerMime: "video/mp4" });
    expect(classifyMedia(ftyp("qt  "))).toEqual({ declared: "video/quicktime", providerMime: "video/mov" });
  });
  it.each([
    ["HEIC image", ftyp("heic")], ["AVIF", ftyp("avif")], ["3GPP", ftyp("3gp4")],
    ["truncated", new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])],
    ["size beyond file", (() => { const b = ftyp("isom"); new DataView(b.buffer).setUint32(0, 9999); return b; })()],
    ["size too small", ftyp("isom", 8)],
    ["HTML", new TextEncoder().encode("<html><body>not a video</body></html>")],
    ["PNG", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])],
    ["empty", new Uint8Array()],
  ])("rejects %s", (_n, bytes) => expect(classifyMedia(bytes)).toBeNull());
});

describe("field validators", () => {
  it("duration is finite within 1..180", () => {
    for (const ok of [1, 12.5, 180]) expect(validateDuration(ok)).toBe(ok);
    for (const bad of [0, 0.99, 180.01, -5, NaN, Infinity, "30", null, undefined]) expect(validateDuration(bad)).toBeNull();
  });
  it("caption is trimmed, bounded and control-free", () => {
    expect(validateCaption("  hello\nworld ")).toBe("hello\nworld");
    expect(validateCaption("   ")).toBeUndefined();
    expect(validateCaption(undefined)).toBeUndefined();
    expect(validateCaption("a".repeat(MAX_CAPTION_CHARS))).toHaveLength(MAX_CAPTION_CHARS);
    expect(validateCaption("a".repeat(MAX_CAPTION_CHARS + 1))).toBeNull();
    expect(validateCaption("bad\u0000byte")).toBeNull();
    expect(validateCaption("€".repeat(800))).toHaveLength(800); // 2,400 bytes: at the byte limit
    expect(validateCaption("€".repeat(801))).toBeNull(); // 801 characters but 2,403 bytes
    expect(validateCaption(5)).toBeNull();
  });
  it("publication date is a real ISO date or datetime, not in the future", () => {
    expect(validatePublishedAt("2026-10-01", NOW)).toBe("2026-10-01");
    expect(validatePublishedAt("2026-10-01T08:30:00Z", NOW)).toBe("2026-10-01T08:30:00Z");
    expect(validatePublishedAt("", NOW)).toBeUndefined();
    expect(validatePublishedAt(undefined, NOW)).toBeUndefined();
    for (const bad of ["2026-02-30", "2026-13-01", "10/01/2026", "2026-10-01T25:00:00Z", "2026-10-09", "yesterday", "2026-10-01 08:00", 5]) expect(validatePublishedAt(bad, NOW)).toBeNull();
  });
});

describe("parseUploadQuery (strict; no content in the URL)", () => {
  it("accepts only itemId and duration", () => {
    expect(q(`itemId=${ID}&duration=30`)).toEqual({ itemId: ID, duration: 30 });
    expect(q(`itemId=${ID}&duration=12.5`)).toEqual({ itemId: ID, duration: 12.5 });
  });
  it.each([
    "duration=30", `itemId=${ID}`, `itemId=short&duration=30`, `itemId=${ID}&duration=0`, `itemId=${ID}&duration=181`, `itemId=${ID}&duration=abc`,
    `itemId=${ID}&duration=NaN`, `itemId=${ID}&duration=1e2`, `itemId=${ID}&duration=-3`, `itemId=${ID}&duration=30&extra=1`,
    `itemId=${ID}&itemId=${ID}&duration=30`, `itemId=${ID}%2F..&duration=30`,
    `itemId=${ID}&duration=30&caption=Lunch`, `itemId=${ID}&duration=30&publishedAt=2026-10-01`, // content must not travel in the URL
  ])("rejects %s", qs => expect(q(qs)).toBeNull());
  it("rejects another path", () => {
    expect(parseUploadQuery(new URL(`https://x.convex.site/other?itemId=${ID}&duration=30`))).toBeNull();
  });
});

describe("metadata header (caption and publication date)", () => {
  const roundTrip = (m: { caption?: string; publishedAt?: string }) => parseUploadMeta(encodeUploadMeta(m), NOW);
  it("round-trips, including non-ASCII, and carries nothing readable in plain text", () => {
    expect(roundTrip({ caption: "Lunch € special 🍜", publishedAt: "2026-10-01" })).toEqual({ caption: "Lunch € special 🍜", publishedAt: "2026-10-01" });
    expect(roundTrip({ caption: "only caption" })).toEqual({ caption: "only caption" });
    expect(roundTrip({ publishedAt: "2026-10-01" })).toEqual({ publishedAt: "2026-10-01" });
    expect(encodeUploadMeta({ caption: "Lunch special" })).not.toContain("Lunch");
    expect(encodeUploadMeta({ caption: "x" })).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("encodes nothing for empty metadata and refuses to truncate an over-long one", () => {
    expect(encodeUploadMeta({})).toBeNull();
    expect(encodeUploadMeta({ caption: "" })).toBeNull();
    expect(encodeUploadMeta({ caption: "a".repeat(MAX_META_HEADER_CHARS * 2) })).toBeNull();
  });
  it("absent header means no metadata", () => {
    expect(parseUploadMeta(null)).toEqual({});
    expect(parseUploadMeta(undefined)).toEqual({});
  });
  const enc = (o: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  it.each([
    ["empty", ""], ["not base64url", "***"], ["standard base64 padding", "e30="], ["not JSON", btoa("hello")], ["JSON array", enc([1])], ["JSON string", enc("x")],
    ["unknown key", enc({ caption: "a", url: "https://x" })], ["caption not a string", enc({ caption: 5 })], ["caption control char", enc({ caption: "a\u0000" })],
    ["caption over the byte limit", enc({ caption: "€".repeat(801) })], ["bad date", enc({ publishedAt: "2026-02-30" })], ["future date", enc({ publishedAt: "2027-01-01" })],
    ["header too long", "A".repeat(MAX_META_HEADER_CHARS + 1)],
  ])("rejects %s", (_n, header) => expect(parseUploadMeta(header, NOW)).toBeNull());
  it("rejects invalid UTF-8", () => {
    const bad = btoa(String.fromCharCode(0x7b, 0x22, 0xff, 0xfe, 0x22, 0x7d)).replace(/=+$/, "");
    expect(parseUploadMeta(bad, NOW)).toBeNull();
  });
  it("combines with the query, and invalid metadata invalidates the request", () => {
    const url = new URL(`https://x.convex.site/reel-source?itemId=${ID}&duration=30`);
    expect(parseUploadRequest(url, encodeUploadMeta({ caption: "c", publishedAt: "2026-10-01" }), NOW)).toEqual({ itemId: ID, duration: 30, caption: "c", publishedAt: "2026-10-01" });
    expect(parseUploadRequest(url, null, NOW)).toEqual({ itemId: ID, duration: 30 });
    expect(parseUploadRequest(url, "***", NOW)).toBeNull();
    expect(MAX_CAPTION_BYTES).toBe(2400);
  });
});

describe("origin configuration and CORS", () => {
  it("accepts exact https origins and explicit localhost development origins only", () => {
    expect(parseConfiguredOrigin("https://app.example.com")).toEqual({ ok: true, origin: "https://app.example.com" });
    expect(parseConfiguredOrigin("https://app.example.com:8443")).toEqual({ ok: true, origin: "https://app.example.com:8443" });
    expect(parseConfiguredOrigin("http://localhost:3000")).toEqual({ ok: true, origin: "http://localhost:3000" });
    expect(parseConfiguredOrigin("http://127.0.0.1:3012")).toEqual({ ok: true, origin: "http://127.0.0.1:3012" });
  });
  it.each([undefined, "", "*", "null", "http://app.example.com", "https://app.example.com/", "https://app.example.com/path", "https://u:p@app.example.com", "https://app.example.com?x=1", "https://app.example.com#f", "ftp://app.example.com", "app.example.com", "https://*.example.com"])(
    "rejects %s", value => expect(parseConfiguredOrigin(value)).toEqual({ ok: false }));
  it("allows only the exact configured origin", () => {
    const c = parseConfiguredOrigin("https://app.example.com");
    expect(originAllowed("https://app.example.com", c)).toBe(true);
    for (const o of [null, "https://evil.example", "http://app.example.com", "https://app.example.com:444", "https://app.example.com.evil.example", "null", "*"]) expect(originAllowed(o, c)).toBe(false);
    expect(originAllowed("https://app.example.com", { ok: false })).toBe(false);
  });
  it("CORS headers echo one origin, never a wildcard, and omit the credentials flag", () => {
    const h = corsHeaders("https://app.example.com");
    expect(h["Access-Control-Allow-Origin"]).toBe("https://app.example.com");
    expect(Object.values(h).join(" ")).not.toContain("*");
    expect(h["Access-Control-Allow-Credentials"]).toBeUndefined();
    expect(h.Vary).toBe("Origin");
    expect(h["Access-Control-Allow-Headers"]).toBe("Authorization, Content-Type, X-Reel-Meta");
  });
});

describe("browser file checks", () => {
  const f = (name: string, type: string, size: number) => ({ name, type, size });
  it("accepts mp4 and quicktime, using the extension only when the browser reports no type", () => {
    expect(checkFileChoice(f("a.mp4", "video/mp4", 1000))).toBeNull();
    expect(checkFileChoice(f("a.mov", "video/quicktime", 1000))).toBeNull();
    expect(checkFileChoice(f("a.MOV", "", 1000))).toBeNull();
    expect(declaredTypeFor(f("a.MOV", "", 1))).toBe("video/quicktime");
    expect(declaredTypeFor(f("a.mp4", "", 1))).toBe("video/mp4");
    expect(declaredTypeFor(f("a.mp4", "VIDEO/MP4", 1))).toBe("video/mp4");
  });
  it("rejects empty, oversize and unsupported files", () => {
    expect(checkFileChoice(f("a.mp4", "video/mp4", 0))).toBe("empty");
    expect(checkFileChoice(f("a.mp4", "video/mp4", NaN))).toBe("empty");
    expect(checkFileChoice(f("a.mp4", "video/mp4", MAX_MEDIA_BYTES))).toBeNull();
    expect(checkFileChoice(f("a.mp4", "video/mp4", MAX_MEDIA_BYTES + 1))).toBe("too_large");
    for (const bad of [f("a.png", "image/png", 10), f("a.html", "text/html", 10), f("a.webm", "video/webm", 10), f("a.txt", "", 10), f("a.mp4", "application/octet-stream", 10)]) {
      expect(checkFileChoice(bad)).toBe("unsupported_type");
    }
    expect(declaredTypeFor(f("a.png", "image/png", 1))).toBeNull();
  });
});

function fakeProbe(opts: { duration?: number; fail?: boolean; hang?: boolean; throwOnUrl?: boolean }) {
  const log = { created: 0, revoked: [] as string[], timersCleared: 0, timers: [] as (() => void)[] };
  const video = { preload: "", muted: false, src: "", duration: opts.duration ?? NaN, onloadedmetadata: null as (() => void) | null, onerror: null as (() => void) | null,
    removeAttribute: vi.fn(), load: vi.fn() };
  const probe: VideoProbe = {
    createObjectURL: () => { log.created++; if (opts.throwOnUrl) throw new Error("no"); return "blob:synthetic"; },
    revokeObjectURL: url => { log.revoked.push(url); },
    createVideo: () => video,
    setTimer: fn => { log.timers.push(fn); return log.timers.length; },
    clearTimer: () => { log.timersCleared++; },
  };
  const trigger = () => { if (opts.hang) return; if (opts.fail) video.onerror?.(); else video.onloadedmetadata?.(); };
  return { probe, video, log, trigger };
}
describe("readVideoDuration", () => {
  it("resolves a valid duration and releases everything exactly once", async () => {
    const p = fakeProbe({ duration: 42.5 });
    const result = readVideoDuration({}, p.probe);
    p.trigger(); p.trigger();
    expect(await result).toBe(42.5);
    expect(p.log.revoked).toEqual(["blob:synthetic"]);
    expect(p.log.timersCleared).toBe(1);
    expect(p.video.removeAttribute).toHaveBeenCalledWith("src");
    expect(p.video.preload).toBe("metadata");
  });
  it.each([0, 0.5, 181, Infinity, NaN])("resolves null for out-of-range duration %s and still cleans up", async d => {
    const p = fakeProbe({ duration: d });
    const result = readVideoDuration({}, p.probe); p.trigger();
    expect(await result).toBeNull();
    expect(p.log.revoked).toHaveLength(1);
  });
  it("resolves null on a decode error and cleans up", async () => {
    const p = fakeProbe({ fail: true }); const result = readVideoDuration({}, p.probe); p.trigger();
    expect(await result).toBeNull(); expect(p.log.revoked).toHaveLength(1);
  });
  it("times out when metadata never loads, and cleans up", async () => {
    const p = fakeProbe({ hang: true }); const result = readVideoDuration({}, p.probe, 5);
    p.log.timers[0]();
    expect(await result).toBeNull(); expect(p.log.revoked).toHaveLength(1);
    p.video.onloadedmetadata?.(); // a late event changes nothing
    expect(p.log.revoked).toHaveLength(1);
  });
  it("handles a failing object URL without leaking a timer", async () => {
    const p = fakeProbe({ throwOnUrl: true });
    expect(await readVideoDuration({}, p.probe)).toBeNull();
    expect(p.log.timersCleared).toBe(1); expect(p.log.revoked).toEqual([]);
  });
});

describe("buildUploadRequest", () => {
  it("puts only id and duration in the URL and the content in the header", () => {
    const built = buildUploadRequest("https://happy-animal-1.convex.site", { itemId: ID, duration: 30, publishedAt: "2026-10-01", caption: "a & b secret" })!;
    const u = new URL(built.url);
    expect(u.origin).toBe("https://happy-animal-1.convex.site");
    expect(u.pathname).toBe("/reel-source");
    expect([...u.searchParams.keys()].sort()).toEqual(["duration", "itemId"]);
    expect(built.url).not.toContain("secret");
    expect(built.url).not.toContain("2026-10-01");
    expect(parseUploadRequest(u, built.metaHeader, NOW)).toEqual({ itemId: ID, duration: 30, caption: "a & b secret", publishedAt: "2026-10-01" });
  });
  it("has no header when there is no metadata", () => {
    expect(buildUploadRequest("https://x.convex.site", { itemId: ID, duration: 30 })!.metaHeader).toBeNull();
  });
  it("refuses non-https (except localhost), junk, and metadata that cannot be sent whole", () => {
    expect(buildUploadRequest("http://localhost:3210", { itemId: ID, duration: 30 })).not.toBeNull();
    expect(buildUploadRequest("http://evil.example", { itemId: ID, duration: 30 })).toBeNull();
    expect(buildUploadRequest("not a url", { itemId: ID, duration: 30 })).toBeNull();
    expect(buildUploadRequest("https://x.convex.site", { itemId: ID, duration: 30, caption: "a".repeat(MAX_META_HEADER_CHARS * 2) })).toBeNull();
  });
});

describe("uploadSuppliedReel", () => {
  const file = Object.assign(new Blob([ftyp("isom")], { type: "video/mp4" }), { name: "r.mp4" });
  const args = { siteUrl: "https://x.convex.site", token: "synthetic-bearer", query: { itemId: ID, duration: 30 }, file };
  const reply = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
  const stalledBody = () => new Response(new ReadableStream({ start() { /* headers arrive; body never does */ } }), { status: 200 });
  it("reports ok only for the server's attached receipt, with Bearer, declared type and header metadata", async () => {
    const fetchImpl = reply(200, { status: "attached", generation: 3 });
    const out = await uploadSuppliedReel({ ...args, query: { ...args.query, caption: "Lunch special", publishedAt: "2026-10-01" } }, fetchImpl as never);
    expect(out).toEqual({ ok: true, generation: 3 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toContain("/reel-source?itemId=");
    expect(url).not.toContain("Lunch");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer synthetic-bearer");
    expect(init.headers["Content-Type"]).toBe("video/mp4");
    expect(parseUploadMeta(init.headers["X-Reel-Meta"], NOW)).toEqual({ caption: "Lunch special", publishedAt: "2026-10-01" });
    expect(init.body).toBe(file);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("sends no metadata header when there is none", async () => {
    const fetchImpl = reply(200, { status: "attached", generation: 1 });
    await uploadSuppliedReel(args, fetchImpl as never);
    expect((fetchImpl.mock.calls[0] as unknown as [string, { headers: object }])[1].headers).not.toHaveProperty("X-Reel-Meta");
  });
  it.each([[{}], [{ status: "stored" }], [{ status: "attached" }], [{ status: "attached", generation: -1 }], [{ status: "attached", generation: 1.5 }]])(
    "a 200 without a valid receipt is not success: %j", async body => {
      expect(await uploadSuppliedReel(args, reply(200, body) as never)).toEqual({ ok: false, reason: "unexpected" });
    });
  it("an unparseable 200 body is not success", async () => {
    expect(await uploadSuppliedReel(args, vi.fn(async () => new Response("not json", { status: 200 })) as never)).toEqual({ ok: false, reason: "unexpected" });
  });
  it("maps statuses to reasons", async () => {
    expect(await uploadSuppliedReel(args, reply(401) as never)).toEqual({ ok: false, reason: "auth" });
    expect(await uploadSuppliedReel(args, reply(429) as never)).toEqual({ ok: false, reason: "rate_limited" });
    for (const s of [400, 403, 404, 408, 409, 413, 415]) expect(await uploadSuppliedReel(args, reply(s) as never)).toEqual({ ok: false, reason: "rejected" });
    expect(await uploadSuppliedReel(args, reply(500) as never)).toEqual({ ok: false, reason: "unexpected" });
    expect(await uploadSuppliedReel(args, vi.fn(async () => { throw new Error("offline"); }) as never)).toEqual({ ok: false, reason: "network" });
  });
  it("times out a request that never answers, aborting it", async () => {
    let signal: AbortSignal | undefined;
    const hang = vi.fn((_url: string, init: RequestInit) => { signal = init.signal as AbortSignal; return new Promise<Response>(() => {}); });
    expect(await uploadSuppliedReel({ ...args, timeoutMs: 20 }, hang as never)).toEqual({ ok: false, reason: "timeout" });
    expect(signal!.aborted).toBe(true);
  });
  it("times out when headers arrive but the receipt body stalls", async () => {
    const stalled = vi.fn(async () => stalledBody());
    const started = Date.now();
    expect(await uploadSuppliedReel({ ...args, timeoutMs: 20 }, stalled as never)).toEqual({ ok: false, reason: "timeout" });
    expect(Date.now() - started).toBeLessThan(2000);
  });
  it("a caller abort ends the upload as aborted, before or during the request", async () => {
    const early = new AbortController(); early.abort();
    const fetchImpl = vi.fn();
    expect(await uploadSuppliedReel({ ...args, signal: early.signal }, fetchImpl as never)).toEqual({ ok: false, reason: "aborted" });
    expect(fetchImpl).not.toHaveBeenCalled();
    const live = new AbortController();
    const pending = uploadSuppliedReel({ ...args, signal: live.signal, timeoutMs: 5000 }, vi.fn(() => new Promise<Response>(() => {})) as never);
    live.abort();
    expect(await pending).toEqual({ ok: false, reason: "aborted" });
    const live2 = new AbortController();
    const body = uploadSuppliedReel({ ...args, signal: live2.signal, timeoutMs: 5000 }, vi.fn(async () => stalledBody()) as never);
    setTimeout(() => live2.abort(), 10);
    expect(await body).toEqual({ ok: false, reason: "aborted" });
  });
  it.each([0, -1, NaN, Infinity, 600_001])("rejects an invalid timeout %s without fetching", async timeoutMs => {
    const fetchImpl = vi.fn();
    expect(await uploadSuppliedReel({ ...args, timeoutMs }, fetchImpl as never)).toEqual({ ok: false, reason: "invalid" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("does not call fetch for invalid inputs and never logs the token", async () => {
    const spies = (["log", "error", "warn"] as const).map(m => vi.spyOn(console, m).mockImplementation(() => {}));
    const fetchImpl = vi.fn();
    const bad = [
      { ...args, token: "" }, { ...args, siteUrl: "http://evil.example" },
      { ...args, file: Object.assign(new Blob(["x"], { type: "image/png" }), { name: "a.png" }) },
      { ...args, file: Object.assign(new Blob([], { type: "video/mp4" }), { name: "a.mp4" }) },
      { ...args, query: { ...args.query, caption: "€".repeat(801) } },
    ];
    for (const a of bad.slice(0, 4)) expect(await uploadSuppliedReel(a, fetchImpl as never)).toEqual({ ok: false, reason: "invalid" });
    expect(fetchImpl).not.toHaveBeenCalled();
    await uploadSuppliedReel(args, vi.fn(async () => { throw new Error("synthetic-bearer"); }) as never);
    for (const s of spies) { expect(s).not.toHaveBeenCalled(); s.mockRestore(); }
  });
});
