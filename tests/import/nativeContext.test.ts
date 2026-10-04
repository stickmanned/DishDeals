// Pure strict-bounds tests for the native supplied-context helper. Synthetic values only: no model, network or phone.
import { describe, expect, it } from "vitest";
import {
  NATIVE_CONTEXT_LIMITS as L, NATIVE_CONTEXT_TRUNCATED_CODE, extractionBlock, nativeSourceForModel, parseNativeContext, suppliedFragments, utf8Bytes,
  type NativeContext,
} from "../../lib/reels/nativeContext";

const NOW = new Date("2026-10-04T12:00:00Z").getTime();
const RECEIVED = NOW / 1000 - 60;
const ctx = (over: Record<string, unknown> = {}) => ({ version: 1, textFragments: ["Lunch special $8", "Open Mon-Fri"], registeredTypes: ["public.url", "public.plain-text"], receivedAt: RECEIVED, truncated: false, ...over });
const reason = (raw: unknown) => { const r = parseNativeContext(raw, NOW); return r.ok ? "ok" : r.reason; };

describe("parseNativeContext", () => {
  it("accepts a bounded context unchanged and keeps every fragment in order", () => {
    const r = parseNativeContext(ctx(), NOW);
    expect(r).toEqual({ ok: true, value: ctx() });
  });
  it("accepts an empty complete context (types only) and an empty truncated marker", () => {
    expect(reason(ctx({ textFragments: [], registeredTypes: [] }))).toBe("ok");
    expect(reason(ctx({ textFragments: [], truncated: true }))).toBe("ok");
  });
  it("does not trim, normalize or truncate retained text", () => {
    const text = "  Caption with trailing space \n";
    const r = parseNativeContext(ctx({ textFragments: [text] }), NOW);
    expect(r.ok && r.value.textFragments[0]).toBe(text);
  });
  it.each([
    ["null", null], ["array", []], ["string", "{}"], ["class instance", new (class X {})()],
    ["missing key", (() => { const c: Record<string, unknown> = ctx(); delete c.truncated; return c; })()],
    ["extra key", ctx({ sourceUrl: "https://www.instagram.com/reel/AbCdE12345/" })],
    ["version 2", ctx({ version: 2 })], ["version string", ctx({ version: "1" })],
    ["truncated string", ctx({ truncated: "false" })], ["truncated number", ctx({ truncated: 0 })],
    ["receivedAt string", ctx({ receivedAt: "1700000000" })], ["receivedAt NaN", ctx({ receivedAt: NaN })], ["receivedAt Infinity", ctx({ receivedAt: Infinity })], ["receivedAt negative", ctx({ receivedAt: -1 })],
    ["fragments not array", ctx({ textFragments: "text" })], ["fragment number", ctx({ textFragments: [1] })], ["empty fragment", ctx({ textFragments: [""] })],
    ["duplicate fragments", ctx({ textFragments: ["same", "same"] })], ["duplicate types", ctx({ registeredTypes: ["a", "a"] })],
    ["lone high surrogate", ctx({ textFragments: ["bad \uD800 text"] })], ["lone low surrogate", ctx({ registeredTypes: ["\uDC00"] })],
    ["types not array", ctx({ registeredTypes: {} })], ["type empty", ctx({ registeredTypes: [""] })],
  ])("rejects malformed: %s", (_name, raw) => { expect(reason(raw)).toBe("malformed"); });
  it("rejects an object whose prototype is not plain, and prototype pollution lookalikes", () => {
    expect(reason(Object.assign(Object.create({ version: 1 }), ctx()))).toBe("malformed");
  });
  it("accepts well-formed surrogate pairs and counts UTF-8 bytes, not characters", () => {
    expect(reason(ctx({ textFragments: ["🍜 ramen"] }))).toBe("ok");
    expect(utf8Bytes("🍜")).toBe(4);
    // 1024 four-byte characters is exactly 4096 bytes: allowed. One more byte is not.
    expect(reason(ctx({ textFragments: ["🍜".repeat(1024)] }))).toBe("ok");
    expect(reason(ctx({ textFragments: ["🍜".repeat(1024) + "a"] }))).toBe("too_large");
  });
  it("enforces the fragment count, per-fragment, combined and type bounds exactly", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `fragment ${i}`);
    expect(reason(ctx({ textFragments: many(L.maxFragments) }))).toBe("ok");
    expect(reason(ctx({ textFragments: many(L.maxFragments + 1) }))).toBe("too_large");
    expect(reason(ctx({ textFragments: ["a".repeat(L.fragmentBytes)] }))).toBe("ok");
    expect(reason(ctx({ textFragments: ["a".repeat(L.fragmentBytes + 1)] }))).toBe("too_large");
    // 3 x 4000 = 12000 allowed; 3 x 4000 + 1 is over the combined bound even though each fragment is within its own.
    const full = ["a".repeat(4000), "b".repeat(4000), "c".repeat(4000)];
    expect(reason(ctx({ textFragments: full }))).toBe("ok");
    expect(reason(ctx({ textFragments: [...full.slice(0, 2), "c".repeat(4001)] }))).toBe("too_large");
    const types = (n: number) => Array.from({ length: n }, (_, i) => `public.type-${i}`);
    expect(reason(ctx({ registeredTypes: types(L.maxTypes) }))).toBe("ok");
    expect(reason(ctx({ registeredTypes: types(L.maxTypes + 1) }))).toBe("too_large");
    expect(reason(ctx({ registeredTypes: ["t".repeat(L.typeBytes)] }))).toBe("ok");
    expect(reason(ctx({ registeredTypes: ["t".repeat(L.typeBytes + 1)] }))).toBe("too_large");
  });
  it("enforces the 24000-byte whole-JSON bound with JSON-escaping overhead counted", () => {
    // Control characters escape to six JSON bytes each: 12000 raw bytes (within the text bounds) is far over 24000 as JSON.
    expect(reason(ctx({ textFragments: ["\u0001".repeat(4000), "\u0002".repeat(4000), "\u0003".repeat(4000)] }))).toBe("too_large");
  });
  it("treats the receipt clock as Unix seconds: not in the future, but tolerant of a small phone clock skew", () => {
    expect(reason(ctx({ receivedAt: 0 }))).toBe("ok");
    expect(reason(ctx({ receivedAt: NOW / 1000 + L.futureSkewSeconds }))).toBe("ok");
    expect(reason(ctx({ receivedAt: NOW / 1000 + L.futureSkewSeconds + 1 }))).toBe("future_clock");
    expect(reason(ctx({ receivedAt: NOW }))).toBe("future_clock"); // milliseconds mistaken for seconds
  });
  it("returns only a short reason, never the offending content", () => {
    const secret = "SECRET-CAPTION-TEXT";
    const r = parseNativeContext(ctx({ textFragments: [secret, secret] }), NOW);
    expect(JSON.stringify(r)).not.toContain(secret);
  });
});

describe("extractionBlock (truncated supplied text)", () => {
  const full = ctx() as NativeContext, cut = ctx({ truncated: true }) as NativeContext;
  it("always blocks automatic extraction for truncated context, with a named code and a manual option", () => {
    const block = extractionBlock({ nativeContext: cut });
    expect(block?.code).toBe(NATIVE_CONTEXT_TRUNCATED_CODE);
    expect(block?.message).toMatch(/cut off/);
    expect(block?.message).toMatch(/share the Reel again/);
    expect(block?.message).toMatch(/by hand/);
  });
  it("is not lifted by any caption: the optional caption box makes no completeness assertion", () => {
    for (const caption of [undefined, null, "", "   ", "x", "one word", "A long pasted caption that is still not an assertion of completeness"])
      expect(extractionBlock({ nativeContext: cut, caption } as never)).not.toBeNull();
  });
  it("never blocks complete context or old context-less items", () => {
    expect(extractionBlock({ nativeContext: full })).toBeNull();
    expect(extractionBlock({ nativeContext: undefined })).toBeNull();
    expect(extractionBlock({})).toBeNull();
  });
});

describe("model input", () => {
  const full = ctx() as NativeContext;
  it("sends only labeled text fragments plus completeness; never types, the receipt clock or the link", () => {
    const source = nativeSourceForModel(full) as { nativeSuppliedSource: Record<string, unknown> };
    expect(Object.keys(source)).toEqual(["nativeSuppliedSource"]);
    expect(source.nativeSuppliedSource).toMatchObject({ complete: true, textFragments: full.textFragments });
    const json = JSON.stringify(source);
    expect(json).not.toContain("public.url");
    expect(json).not.toContain(String(full.receivedAt));
    expect(json).not.toContain("receivedAt");
    expect(source.nativeSuppliedSource.note).toMatch(/not a publication date/);
  });
  it("marks a truncated source incomplete, and sends nothing for a complete empty one", () => {
    expect((nativeSourceForModel(ctx({ truncated: true }) as NativeContext) as { nativeSuppliedSource: { complete: boolean } }).nativeSuppliedSource.complete).toBe(false);
    expect(nativeSourceForModel(ctx({ textFragments: [] }) as NativeContext)).toBeNull();
    expect(nativeSourceForModel(undefined)).toBeNull();
    expect(nativeSourceForModel(null)).toBeNull();
  });
  it("exposes each fragment separately for evidence checks", () => {
    expect(suppliedFragments(full)).toEqual(["Lunch special $8", "Open Mon-Fri"]);
    expect(suppliedFragments(undefined)).toEqual([]);
  });
});
