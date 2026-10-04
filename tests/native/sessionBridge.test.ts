// All doubles here are SYNTHETIC: a fake `window.webkit` handler and a fake
// submit function. This is NOT live Convex Auth, the Swift bridge, Keychain,
// WKWebView, Instagram, a provider or phone evidence.
import { describe, expect, it, vi } from "vitest";
import {
  postNativeMessage,
  recoveredLink,
  saveReelLink,
  sessionMessageFor,
  type NativeMessage,
} from "../../lib/nativeSession";
import intakeSource from "../../components/reels/ReelIntake.tsx?raw";
import bridgeSource from "../../components/CanonicalSessionBridge.tsx?raw";
import providerSource from "../../components/ConvexClientProvider.tsx?raw";

const REEL = "https://www.instagram.com/reel/AbCdE12345/";
const fakeWindow = () => {
  const posted: object[] = [];
  return {
    posted,
    win: { webkit: { messageHandlers: { dishdeals: { postMessage: (m: object) => void posted.push(m) } } } },
  };
};

describe("postNativeMessage", () => {
  it("is not_sent without a window (SSR) or without the handler", () => {
    expect(postNativeMessage({ type: "session", token: null }, undefined)).toBe("not_sent");
    expect(postNativeMessage({ type: "session", token: null }, {})).toBe("not_sent");
    expect(postNativeMessage({ type: "session", token: null }, { webkit: {} })).toBe("not_sent");
    expect(postNativeMessage({ type: "session", token: null }, { webkit: { messageHandlers: {} } })).toBe("not_sent");
    expect(
      postNativeMessage({ type: "session", token: null }, { webkit: { messageHandlers: { dishdeals: {} } } }),
    ).toBe("not_sent");
  });

  it("with the default window (no webkit handler present) does not throw", () => {
    // The edge-runtime global has no `webkit`; a real SSR pass passes undefined, covered above.
    expect(postNativeMessage({ type: "enableNotifications" })).toBe("not_sent");
  });

  it("hands valid messages to the handler and reports sent (not a native ack)", () => {
    const { win, posted } = fakeWindow();
    expect(postNativeMessage({ type: "session", token: "synthetic-token" }, win)).toBe("sent");
    expect(postNativeMessage({ type: "session", token: null }, win)).toBe("sent");
    expect(postNativeMessage({ type: "received", sourceUrl: REEL }, win)).toBe("sent");
    expect(postNativeMessage({ type: "result", itemId: "abc123", status: "ready" }, win)).toBe("sent");
    expect(posted).toEqual([
      { type: "session", token: "synthetic-token" },
      { type: "session", token: null },
      { type: "received", sourceUrl: REEL },
      { type: "result", itemId: "abc123", status: "ready" },
    ]);
  });

  it("returns not_sent when the handler throws, without logging or leaking", () => {
    const spies = (["log", "error", "warn"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const win = { webkit: { messageHandlers: { dishdeals: { postMessage: () => { throw new Error("synthetic-token boom"); } } } } };
    expect(postNativeMessage({ type: "session", token: "synthetic-token" }, win)).toBe("not_sent");
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    spies.forEach((s) => s.mockRestore());
  });

  it.each<[string, NativeMessage]>([
    ["empty token string", { type: "session", token: "" }],
    ["non-string token", { type: "session", token: 5 as unknown as string }],
    ["unnormalized receipt URL", { type: "received", sourceUrl: "https://www.instagram.com/p/AbCdE12345/?igsh=x" }],
    ["foreign host receipt", { type: "received", sourceUrl: "https://evil.example/reel/AbCdE12345/" }],
    ["garbage receipt", { type: "received", sourceUrl: "not a url" }],
    ["bad result id", { type: "result", itemId: "a/b", status: "ready" }],
    ["result id with whitespace", { type: "result", itemId: " abc123 ", status: "ready" }],
    ["result id too long", { type: "result", itemId: "a".repeat(129), status: "ready" }],
    ["unknown result status", { type: "result", itemId: "abc123", status: "queued" as never }],
    ["extracting result status", { type: "result", itemId: "abc123", status: "extracting" as never }],
    ["missing result status", { type: "result", itemId: "abc123" } as never],
    ["non-string result status", { type: "result", itemId: "abc123", status: 1 as never }],
  ])("refuses to send %s", (_n, message) => {
    const { win, posted } = fakeWindow();
    expect(postNativeMessage(message, win)).toBe("not_sent");
    expect(posted).toEqual([]);
  });
});

describe("sessionMessageFor (what the root bridge tells native)", () => {
  it("says nothing while auth is loading, so launch never wipes the Keychain token", () => {
    expect(sessionMessageFor({ isLoading: true, isAuthenticated: false, token: null })).toBeUndefined();
    expect(sessionMessageFor({ isLoading: true, isAuthenticated: true, token: "t" })).toBeUndefined();
  });
  it("sends the token when signed in", () => {
    expect(sessionMessageFor({ isLoading: false, isAuthenticated: true, token: "t" })).toBe("t");
  });
  it("says nothing when signed in but the token is not ready yet", () => {
    expect(sessionMessageFor({ isLoading: false, isAuthenticated: true, token: null })).toBeUndefined();
  });
  it("clears native on sign-out", () => {
    expect(sessionMessageFor({ isLoading: false, isAuthenticated: false, token: null })).toBeNull();
  });
});

describe("recoveredLink (prefill candidate only)", () => {
  it("normalizes tracking and /p variants", () => {
    expect(recoveredLink("https://instagram.com/p/AbCdE12345/?igsh=zzz#frag")).toBe(REEL);
    expect(recoveredLink(REEL)).toBe(REEL);
  });
  it.each([undefined, "", "hello", "https://www.instagram.com/someuser/", "https://www.instagram.com/share/AbCdE12345/", "https://user:pw@www.instagram.com/reel/AbCdE12345/", "http://www.instagram.com/reel/AbCdE12345/", "https://evil.example/reel/AbCdE12345/"])(
    "rejects %s",
    (value) => expect(recoveredLink(value as string | undefined)).toBeNull(),
  );
});

describe("saveReelLink (receipt only after a verified server save)", () => {
  it("submits the normalized link then reports exactly one receipt", async () => {
    const post = vi.fn(() => "sent" as const);
    const submit = vi.fn(async () => ({ itemId: "item1", duplicate: false }));
    const out = await saveReelLink("https://instagram.com/p/AbCdE12345/?igsh=x", 7, submit, post);
    expect(submit).toHaveBeenCalledWith({ text: REEL, retentionDays: 7 });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith({ type: "received", sourceUrl: REEL });
    expect(out).toEqual({ itemId: "item1", receipt: "sent" });
  });

  it("a duplicate (already saved) result is still a verified receipt", async () => {
    const post = vi.fn(() => "sent" as const);
    await saveReelLink(REEL, 1, async () => ({ itemId: "existing", duplicate: true } as never), post);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("accepts the boundary item ids (1 and 128 alphanumerics) without altering them", async () => {
    for (const itemId of ["a", "Z9", "a".repeat(128)]) {
      const post = vi.fn(() => "sent" as const);
      const out = await saveReelLink(REEL, 7, async () => ({ itemId }), post);
      expect(out.itemId).toBe(itemId);
      expect(post).toHaveBeenCalledTimes(1);
    }
  });

  it("reports not_sent honestly when there is no native bridge", async () => {
    const out = await saveReelLink(REEL, 7, async () => ({ itemId: "item1" }));
    expect(out).toEqual({ itemId: "item1", receipt: "not_sent" });
  });

  it("sends no receipt when the server rejects the save", async () => {
    const post = vi.fn(() => "sent" as const);
    await expect(saveReelLink(REEL, 7, async () => { throw new Error("Not signed in"); }, post)).rejects.toThrow("Not signed in");
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    null, undefined, {}, { itemId: "" }, { itemId: 5 }, { itemId: " " }, { itemId: " item1 " },
    { itemId: "item 1" }, { itemId: "item-1" }, { itemId: "a/b" }, { itemId: "a".repeat(129) }, { itemId: "item1\n" },
  ])("sends no receipt for an unverified or malformed result %j", async (result) => {
    const post = vi.fn(() => "sent" as const);
    await expect(saveReelLink(REEL, 7, async () => result as never, post)).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });

  it("never calls the server or reports a receipt for an invalid link", async () => {
    const post = vi.fn(() => "sent" as const);
    const submit = vi.fn(async () => ({ itemId: "x" }));
    for (const bad of ["", "nothing here", "https://www.instagram.com/someuser/", `${REEL} ${REEL}`]) {
      await expect(saveReelLink(bad, 7, submit, post)).rejects.toThrow();
    }
    expect(submit).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});

// Static guards on the wiring (source text): a cheap regression net, not a render test.
describe("source wiring guards", () => {
  it("ReelIntake uses the root session: no private client, no private auth provider, no auto-submit", () => {
    expect(intakeSource).not.toMatch(/new ConvexReactClient/);
    expect(intakeSource).not.toMatch(/ConvexAuthProvider/);
    expect(intakeSource).not.toMatch(/useAuthToken/);
    expect(intakeSource).not.toMatch(/auto\.current|useRef<string \| null>/);
    expect(intakeSource).toMatch(/Save this link to my account/);
    // recovered links are never submitted from an effect
    expect(intakeSource).not.toMatch(/useEffect\([^)]*submit/s);
  });
  it("ReelIntake checks configuration before any hook-using component renders", () => {
    const guard = intakeSource.indexOf("NEXT_PUBLIC_CONVEX_URL");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(intakeSource.indexOf("function Intake"));
  });
  it("the root provider mounts the session bridge inside AuthProvider", () => {
    expect(providerSource).toMatch(/<AuthProvider client=\{client\}>\s*<CanonicalSessionBridge \/>/);
  });
  it("the bridge never logs", () => {
    expect(bridgeSource).not.toMatch(/console\./);
  });
});
