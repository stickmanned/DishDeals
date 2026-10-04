// Pure helper tests with SYNTHETIC bytes, fake probes and a fake fetch. Not a
// real browser, WKWebView, Photos picker, upload to a deployment or provider.
import { describe, expect, it, vi } from "vitest";
import {
  MAX_CAPTION_CHARS, MAX_MEDIA_BYTES, buildUploadUrl, checkFileChoice, classifyMedia, corsHeaders, declaredTypeFor,
  originAllowed, parseConfiguredOrigin, parseUploadQuery, readVideoDuration, uploadSuppliedReel,
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
const q = (qs: string) => parseUploadQuery(new URL(`https://x.convex.site/reel-source?${qs}`), NOW);
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

describe("parseUploadQuery (strict)", () => {
  it("accepts the minimal and full forms", () => {
    expect(q(`itemId=${ID}&duration=30`)).toEqual({ itemId: ID, duration: 30 });
    expect(q(`itemId=${ID}&duration=12.5&publishedAt=2026-10-01&caption=Lunch%20special`)).toEqual({ itemId: ID, duration: 12.5, publishedAt: "2026-10-01", caption: "Lunch special" });
  });
  it.each([
    "duration=30", `itemId=${ID}`, `itemId=short&duration=30`, `itemId=${ID}&duration=0`, `itemId=${ID}&duration=181`, `itemId=${ID}&duration=abc`,
    `itemId=${ID}&duration=NaN`, `itemId=${ID}&duration=1e2`, `itemId=${ID}&duration=-3`, `itemId=${ID}&duration=30&extra=1`,
    `itemId=${ID}&itemId=${ID}&duration=30`, `itemId=${ID}&duration=30&publishedAt=2026-02-30`, `itemId=${ID}&duration=30&publishedAt=2027-01-01`,
    `itemId=${ID}&duration=30&caption=${"a".repeat(MAX_CAPTION_CHARS + 1)}`, `itemId=${ID}&duration=30&caption=%00`,
    `itemId=${ID}%2F..&duration=30`,
  ])("rejects %s", qs => expect(q(qs)).toBeNull());
  it("rejects another path and an over-long URL", () => {
    expect(parseUploadQuery(new URL(`https://x.convex.site/other?itemId=${ID}&duration=30`), NOW)).toBeNull();
    expect(q(`itemId=${ID}&duration=30&caption=${encodeURIComponent("€".repeat(2200))}`)).toBeNull(); // percent-encoded URL exceeds the cap
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
    expect(h["Access-Control-Allow-Headers"]).toBe("Authorization, Content-Type");
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

describe("buildUploadUrl", () => {
  it("builds from an explicit site URL and encodes query values", () => {
    const url = buildUploadUrl("https://happy-animal-1.convex.site", { itemId: ID, duration: 30, publishedAt: "2026-10-01", caption: "a & b" })!;
    const u = new URL(url);
    expect(u.origin).toBe("https://happy-animal-1.convex.site");
    expect(u.pathname).toBe("/reel-source");
    expect(u.searchParams.get("caption")).toBe("a & b");
    expect(q(url.split("?")[1])).toMatchObject({ itemId: ID, duration: 30 });
  });
  it("refuses non-https (except localhost), junk and over-long URLs", () => {
    expect(buildUploadUrl("http://localhost:3210", { itemId: ID, duration: 30 })).not.toBeNull();
    expect(buildUploadUrl("http://evil.example", { itemId: ID, duration: 30 })).toBeNull();
    expect(buildUploadUrl("not a url", { itemId: ID, duration: 30 })).toBeNull();
    expect(buildUploadUrl("https://x.convex.site", { itemId: ID, duration: 30, caption: "€".repeat(2200) })).toBeNull();
  });
});

describe("uploadSuppliedReel", () => {
  const file = Object.assign(new Blob([ftyp("isom")], { type: "video/mp4" }), { name: "r.mp4" });
  const args = { siteUrl: "https://x.convex.site", token: "synthetic-bearer", query: { itemId: ID, duration: 30 }, file };
  const reply = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
  it("reports ok only for the server's attached receipt, sending a Bearer header and the declared type", async () => {
    const fetchImpl = reply(200, { status: "attached", generation: 3 });
    expect(await uploadSuppliedReel(args, fetchImpl as never)).toEqual({ ok: true, generation: 3 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/reel-source?itemId=");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer synthetic-bearer", "Content-Type": "video/mp4" });
    expect(init.body).toBe(file);
  });
  it.each([[{}], [{ status: "stored" }], [{ status: "attached" }], [{ status: "attached", generation: -1 }], [{ status: "attached", generation: 1.5 }]])(
    "a 200 without a valid receipt is not success: %j", async body => {
      expect(await uploadSuppliedReel(args, reply(200, body) as never)).toEqual({ ok: false, reason: "unexpected" });
    });
  it("maps statuses to reasons", async () => {
    expect(await uploadSuppliedReel(args, reply(401) as never)).toEqual({ ok: false, reason: "auth" });
    expect(await uploadSuppliedReel(args, reply(429) as never)).toEqual({ ok: false, reason: "rate_limited" });
    for (const s of [400, 403, 404, 409, 413, 415]) expect(await uploadSuppliedReel(args, reply(s) as never)).toEqual({ ok: false, reason: "rejected" });
    expect(await uploadSuppliedReel(args, reply(500) as never)).toEqual({ ok: false, reason: "unexpected" });
    expect(await uploadSuppliedReel(args, vi.fn(async () => { throw new Error("offline"); }) as never)).toEqual({ ok: false, reason: "network" });
  });
  it("does not call fetch for invalid inputs and never logs the token", async () => {
    const spies = (["log", "error", "warn"] as const).map(m => vi.spyOn(console, m).mockImplementation(() => {}));
    const fetchImpl = vi.fn();
    const bad = [
      { ...args, token: "" }, { ...args, siteUrl: "http://evil.example" },
      { ...args, file: Object.assign(new Blob(["x"], { type: "image/png" }), { name: "a.png" }) },
      { ...args, file: Object.assign(new Blob([], { type: "video/mp4" }), { name: "a.mp4" }) },
    ];
    for (const a of bad) expect(await uploadSuppliedReel(a, fetchImpl as never)).toEqual({ ok: false, reason: "invalid" });
    expect(fetchImpl).not.toHaveBeenCalled();
    await uploadSuppliedReel(args, vi.fn(async () => { throw new Error("synthetic-bearer"); }) as never);
    for (const s of spies) { expect(s).not.toHaveBeenCalled(); s.mockRestore(); }
  });
});
