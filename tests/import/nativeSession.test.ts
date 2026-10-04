// SYNTHETIC doubles only: a fake window with an event target and a fake submit. This is NOT the Swift bridge, WKWebView,
// Keychain, live Convex or a phone.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SHARE_CONTEXT_EVENT, postNativeMessage, readShareContextEvent, requestShareContext, saveReelLink, shareContextForSave,
  type NativeMessage, type ShareContextOutcome,
} from "../../lib/nativeSession";
import type { NativeContext } from "../../lib/reels/nativeContext";
import intakeSource from "../../components/reels/ReelIntake.tsx?raw";

const REEL = "https://www.instagram.com/reel/AbCdE12345/";
const OTHER = "https://www.instagram.com/reel/ZzZzZ99999/";
const NOW = new Date("2026-10-04T12:00:00Z").getTime();
const context = (over: Partial<NativeContext> = {}): NativeContext => ({ version: 1, textFragments: ["Lunch $8"], registeredTypes: ["public.url"], receivedAt: NOW / 1000 - 30, truncated: false, ...over });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

function fakeWindow() {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  const posted: object[] = [];
  const win = {
    webkit: { messageHandlers: { dishdeals: { postMessage: (m: object) => void posted.push(m) } } },
    addEventListener: (type: string, fn: (e: unknown) => void) => { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn); },
    removeEventListener: (type: string, fn: (e: unknown) => void) => { listeners.get(type)?.delete(fn); },
  };
  const dispatch = (detail: unknown) => { for (const fn of [...(listeners.get(SHARE_CONTEXT_EVENT) ?? [])]) fn({ detail }); };
  return { win, posted, dispatch, count: () => listeners.get(SHARE_CONTEXT_EVENT)?.size ?? 0 };
}

describe("requestShareContext message", () => {
  it("is a validated native message: only the canonical normalized link is posted", () => {
    const w = fakeWindow();
    expect(postNativeMessage({ type: "requestShareContext", sourceUrl: REEL }, w.win)).toBe("sent");
    expect(w.posted).toEqual([{ type: "requestShareContext", sourceUrl: REEL }]);
    for (const sourceUrl of ["https://www.instagram.com/p/AbCdE12345/?igsh=x", "https://evil.example/reel/AbCdE12345/", "not a url", ""])
      expect(postNativeMessage({ type: "requestShareContext", sourceUrl } as NativeMessage, w.win)).toBe("not_sent");
    expect(w.posted).toHaveLength(1);
  });
  it("is not_sent without the native handler", () => {
    expect(postNativeMessage({ type: "requestShareContext", sourceUrl: REEL }, {})).toBe("not_sent");
  });
});

describe("readShareContextEvent", () => {
  it("accepts a bounded context for exactly the current normalized link", () => {
    expect(readShareContextEvent({ detail: { sourceUrl: REEL, nativeContext: context() } }, REEL, NOW)).toEqual({ status: "ready", context: context() });
  });
  it("ignores events for another link, other links' spellings, and non-objects without throwing", () => {
    for (const event of [
      { detail: { sourceUrl: OTHER, nativeContext: context() } },
      { detail: { sourceUrl: "https://www.instagram.com/p/AbCdE12345/", nativeContext: context() } },
      { detail: { sourceUrl: REEL.toUpperCase(), nativeContext: context() } },
      { detail: null }, { detail: "x" }, { detail: [] }, {}, null, undefined, 5,
    ]) expect(readShareContextEvent(event, REEL, NOW)).toBeNull();
  });
  it("reports invalid, never ready, for the right link with a malformed, oversized, future or unbounded context", () => {
    const big = { ...context(), textFragments: ["a".repeat(5000)] };
    for (const nativeContext of [null, undefined, "x", { ...context(), extra: 1 }, big, context({ receivedAt: NOW }), { ...context(), version: 2 }])
      expect(readShareContextEvent({ detail: { sourceUrl: REEL, nativeContext } }, REEL, NOW)).toEqual({ status: "invalid" });
  });
});

describe("requestShareContext (listener first, then ask native)", () => {
  it("registers the listener before posting, so an immediate reply is not missed", async () => {
    const w = fakeWindow();
    const order: string[] = [];
    const origAdd = w.win.addEventListener;
    w.win.addEventListener = (t, f) => { order.push("listen"); origAdd(t, f); };
    const post = vi.fn((m: NativeMessage) => { order.push("post"); w.dispatch({ sourceUrl: (m as { sourceUrl: string }).sourceUrl, nativeContext: context() }); return "sent" as const; });
    const { result } = requestShareContext(REEL, { win: w.win, post, nowMs: () => NOW });
    expect(await result).toEqual({ status: "ready", context: context() });
    expect(order).toEqual(["listen", "post"]);
    expect(post).toHaveBeenCalledWith({ type: "requestShareContext", sourceUrl: REEL });
    expect(w.count()).toBe(0); // listener removed once settled
  });
  it("keeps waiting through an event for a different link, then times out cleanly", async () => {
    const w = fakeWindow();
    const { result } = requestShareContext(REEL, { win: w.win, post: () => "sent", timeoutMs: 1000, nowMs: () => NOW });
    w.dispatch({ sourceUrl: OTHER, nativeContext: context() });
    expect(w.count()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(await result).toEqual({ status: "timeout" });
    expect(w.count()).toBe(0);
  });
  it("settles invalid for a malformed answer to this link", async () => {
    const w = fakeWindow();
    const { result } = requestShareContext(REEL, { win: w.win, post: () => "sent", nowMs: () => NOW });
    w.dispatch({ sourceUrl: REEL, nativeContext: { version: 1 } });
    expect(await result).toEqual({ status: "invalid" });
  });
  it("is unavailable, immediately and without a lingering listener, when native cannot be reached or the link is not normalized", async () => {
    const w = fakeWindow();
    expect(await requestShareContext(REEL, { win: w.win, post: () => "not_sent" }).result).toEqual({ status: "unavailable" });
    expect(w.count()).toBe(0);
    expect(await requestShareContext(REEL, { win: {} }).result).toEqual({ status: "unavailable" });
    expect(await requestShareContext("https://www.instagram.com/p/AbCdE12345/", { win: w.win, post: () => "sent" }).result).toEqual({ status: "unavailable" });
    expect(w.count()).toBe(0);
  });
  it("cancel removes the listener and the timer so nothing fires after unmount", async () => {
    const w = fakeWindow();
    const post = vi.fn(() => "sent" as const);
    const request = requestShareContext(REEL, { win: w.win, post, timeoutMs: 500, nowMs: () => NOW });
    request.cancel();
    expect(w.count()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("shareContextForSave (consent gate)", () => {
  const ready: ShareContextOutcome = { status: "ready", context: context() };
  it("sends the validated context only when the saved text is the same recovered link", () => {
    expect(shareContextForSave(REEL, REEL, ready)).toEqual({ action: "send", context: context() });
    expect(shareContextForSave("https://instagram.com/p/AbCdE12345/?igsh=x", REEL, ready)).toEqual({ action: "send", context: context() });
  });
  it("never attaches the recovered context to a different link or without a recovery", () => {
    expect(shareContextForSave(OTHER, REEL, ready)).toEqual({ action: "none" });
    expect(shareContextForSave("not a link", REEL, ready)).toEqual({ action: "none" });
    expect(shareContextForSave(REEL, null, ready)).toEqual({ action: "none" });
  });
  it("waits while native has not answered and blocks on an unusable answer: neither saves the link as if complete", () => {
    expect(shareContextForSave(REEL, REEL, { status: "pending" })).toEqual({ action: "wait" });
    expect(shareContextForSave(REEL, REEL, { status: "invalid" })).toEqual({ action: "blocked" });
  });
  it("saves the link alone for an old context-less record (timeout) or without a bridge", () => {
    expect(shareContextForSave(REEL, REEL, { status: "timeout" })).toEqual({ action: "none" });
    expect(shareContextForSave(REEL, REEL, { status: "unavailable" })).toEqual({ action: "none" });
  });
});

describe("saveReelLink with native context (receipt only after the server stored it)", () => {
  it("submits the context in the same call and sends the receipt only after the server confirms", async () => {
    const events: string[] = [];
    const submit = vi.fn(async (args: { text: string; retentionDays: number; nativeContext?: NativeContext }) => { events.push("submit"); expect(args.nativeContext).toEqual(context()); return { itemId: "item1" }; });
    const post = vi.fn((m: NativeMessage) => { events.push(`post:${m.type}`); return "sent" as const; });
    const out = await saveReelLink(REEL, 7, submit, post, context());
    expect(out).toEqual({ itemId: "item1", receipt: "sent" });
    expect(submit).toHaveBeenCalledWith({ text: REEL, retentionDays: 7, nativeContext: context() });
    expect(events).toEqual(["submit", "post:received"]);
  });
  it("keeps old two/three/four-argument calls byte-for-byte compatible: no nativeContext key at all", async () => {
    const submit = vi.fn<(args: { text: string; retentionDays: number; nativeContext?: NativeContext }) => Promise<{ itemId: string }>>(async () => ({ itemId: "item1" }));
    await saveReelLink(REEL, 7, submit, () => "sent");
    expect(submit.mock.calls[0]).toEqual([{ text: REEL, retentionDays: 7 }]);
    expect(Object.keys(submit.mock.calls[0][0])).toEqual(["text", "retentionDays"]);
  });
  it("never submits a malformed or oversized context, and never reports a receipt for it", async () => {
    const submit = vi.fn(async () => ({ itemId: "item1" })), post = vi.fn(() => "sent" as const);
    for (const bad of [{ ...context(), extra: 1 }, context({ textFragments: ["a".repeat(5000)] }), context({ receivedAt: NOW })] as NativeContext[])
      await expect(saveReelLink(REEL, 7, submit, post, bad)).rejects.toThrow(/not valid or is too large/);
    expect(submit).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
  it("reports a duplicate (the server kept its first save and ignored the new context) so the UI cannot claim the new text was stored", async () => {
    const out = await saveReelLink(REEL, 7, async () => ({ itemId: "item1", duplicate: true }), () => "sent", context());
    expect(out).toEqual({ itemId: "item1", receipt: "sent", duplicate: true });
    expect(await saveReelLink(REEL, 7, async () => ({ itemId: "item1", duplicate: false }), () => "sent", context())).toEqual({ itemId: "item1", receipt: "sent" });
  });
  it("a failed or unconfirmed save never sends the receipt, even with context", async () => {
    const post = vi.fn(() => "sent" as const);
    await expect(saveReelLink(REEL, 7, async () => { throw new Error("Not signed in"); }, post, context())).rejects.toThrow("Not signed in");
    await expect(saveReelLink(REEL, 7, async () => ({ itemId: "bad id" }), post, context())).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
});

describe("recovery stays explicit and in memory (source guard on the intake screen)", () => {
  it("never persists, routes or logs the recovered context and never submits it before the user saves", () => {
    expect(intakeSource).not.toMatch(/localStorage|sessionStorage|indexedDB|console\./);
    expect(intakeSource).not.toMatch(/router\.(push|replace)\([^)]*[Cc]ontext/);
    expect(intakeSource).toContain("shareContextForSave");
    expect(intakeSource).toContain("requestShareContext");
    // The only submit path is the user's save handler through saveReelLink.
    expect(intakeSource.match(/submit\(/g)).toHaveLength(1);
    // A duplicate with context sent is disclosed instead of being presented as a stored full-context save.
    expect(intakeSource).toContain("was not stored with it");
  });
});
