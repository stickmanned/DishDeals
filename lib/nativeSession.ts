import { normalizeInstagramUrl } from "./reels/contract";
import { NATIVE_CONTEXT_REJECTED, parseNativeContext, type NativeContext } from "./reels/nativeContext";

// Browser side of the trusted-origin Swift bridge (`dishdeals` message
// handler). Pure and SSR-safe: nothing here touches `window` at import time,
// never logs, and only reports whether a message was handed to the handler.
// "sent" does NOT mean native Keychain storage succeeded: Swift returns
// nothing, so there is no acknowledgement to report.

export type NativeMessage =
  | { type: "session"; token: string | null }
  | { type: "received"; sourceUrl: string }
  | { type: "requestShareContext"; sourceUrl: string }
  | { type: "enableNotifications" }
  | { type: "result"; itemId: string; status: "ready" | "no_deal" | "failed" };

export type NativeDelivery = "sent" | "not_sent";

// The same item id shape the Swift app and `/reels` routing accept.
export const ITEM_ID_PATTERN = /^[A-Za-z0-9]{1,128}$/;
const RESULT_STATUSES: readonly string[] = ["ready", "no_deal", "failed"];

type BridgeWindow = {
  webkit?: {
    messageHandlers?: { dishdeals?: { postMessage?: (value: object) => void } };
  };
};

function isValid(message: NativeMessage): boolean {
  switch (message.type) {
    case "session":
      return message.token === null || (typeof message.token === "string" && message.token.length > 0);
    case "received":
    case "requestShareContext":
      try {
        // Only the canonical normalized form may be reported for cleanup or used to ask for its context.
        return normalizeInstagramUrl(message.sourceUrl) === message.sourceUrl;
      } catch {
        return false;
      }
    case "result":
      return (
        typeof message.itemId === "string" &&
        ITEM_ID_PATTERN.test(message.itemId) &&
        RESULT_STATUSES.includes(message.status)
      );
    case "enableNotifications":
      return true;
  }
}

export function postNativeMessage(
  message: NativeMessage,
  win: BridgeWindow | undefined = typeof window === "undefined" ? undefined : (window as BridgeWindow),
): NativeDelivery {
  const post = win?.webkit?.messageHandlers?.dishdeals?.postMessage;
  if (typeof post !== "function" || !isValid(message)) return "not_sent";
  try {
    post.call(win!.webkit!.messageHandlers!.dishdeals, message);
    return "sent";
  } catch {
    return "not_sent";
  }
}

/**
 * What the root session bridge should tell native. `undefined` = say nothing:
 * while auth is loading the token is still being restored, and a premature
 * `null` would wipe the shared Keychain token on every launch.
 */
export function sessionMessageFor(state: {
  isLoading: boolean;
  isAuthenticated: boolean;
  token: string | null;
}): string | null | undefined {
  if (state.isLoading) return undefined;
  if (!state.isAuthenticated) return null; // signed out: clear native token
  return state.token ? state.token : undefined; // signed in but token not ready yet
}

/** A `?shared=` value is only ever a prefill candidate: normalized or rejected. */
export function recoveredLink(shared: string | undefined): string | null {
  if (!shared) return null;
  try {
    return normalizeInstagramUrl(shared);
  } catch {
    return null;
  }
}

/**
 * Save a link on the server, then (and only then) report the verified receipt
 * so native may delete its matching recovery copy. Errors never report a
 * receipt. Used for both manual saves and user-confirmed recovered links.
 *
 * `nativeContext` (optional, only from a validated native recovery) travels in
 * the SAME submit, so the server has stored it before the receipt is sent. A
 * context that fails the strict bounded check is never submitted. Old calls
 * without it are unchanged.
 */
export async function saveReelLink(
  input: string,
  retentionDays: number,
  submit: (args: { text: string; retentionDays: number; nativeContext?: NativeContext }) => Promise<{ itemId?: string } | null | undefined>,
  post: (message: NativeMessage) => NativeDelivery = postNativeMessage,
  nativeContext?: NativeContext,
): Promise<{ itemId: string; receipt: NativeDelivery }> {
  const sourceUrl = normalizeInstagramUrl(input);
  let context: NativeContext | undefined;
  if (nativeContext !== undefined) {
    const parsed = parseNativeContext(nativeContext, Date.now());
    if (!parsed.ok) throw new Error(NATIVE_CONTEXT_REJECTED);
    context = parsed.value;
  }
  const result = await submit({ text: sourceUrl, retentionDays, ...(context ? { nativeContext: context } : {}) });
  // The id is checked exactly as native routing checks it; never trimmed or repaired.
  if (!result || typeof result.itemId !== "string" || !ITEM_ID_PATTERN.test(result.itemId)) {
    throw new Error("The server did not confirm the save.");
  }
  return { itemId: result.itemId, receipt: post({ type: "received", sourceUrl }) };
}

// ---- Trusted native recovery of the supplied context (explicit consent only) ----

export const SHARE_CONTEXT_EVENT = "dishdeals:shareContext";
export const SHARE_CONTEXT_TIMEOUT_MS = 4000;

/**
 * ready = a bounded, valid context for exactly this link arrived (memory only until the user saves).
 * invalid = native answered for this link with something unusable; nothing may be saved as if it were complete.
 * unavailable = no native bridge. timeout = native sent nothing (an old or context-less record): the link alone may be saved.
 */
export type ShareContextOutcome =
  | { status: "ready"; context: NativeContext }
  | { status: "invalid" }
  | { status: "unavailable" }
  | { status: "timeout" };

type ShareContextTarget = BridgeWindow & {
  addEventListener?: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener?: (type: string, listener: (event: unknown) => void) => void;
};

/**
 * Interpret one `dishdeals:shareContext` event for the current normalized link.
 * null = not for this link (ignored; keep waiting). Never throws and never logs.
 */
export function readShareContextEvent(event: unknown, expectedSourceUrl: string, nowMs: number = Date.now()): ShareContextOutcome | null {
  const detail = (event as { detail?: unknown } | null | undefined)?.detail;
  if (typeof detail !== "object" || detail === null || Array.isArray(detail)) return null;
  const { sourceUrl, nativeContext } = detail as { sourceUrl?: unknown; nativeContext?: unknown };
  if (sourceUrl !== expectedSourceUrl) return null;
  const parsed = parseNativeContext(nativeContext, nowMs);
  return parsed.ok ? { status: "ready", context: parsed.value } : { status: "invalid" };
}

/**
 * Registers the listener FIRST, then asks native, so a fast reply cannot be missed. The returned promise settles
 * once. Without a native bridge it settles "unavailable" immediately; if native sends nothing it settles "timeout".
 */
export function requestShareContext(
  sourceUrl: string,
  options: { win?: ShareContextTarget; post?: (message: NativeMessage) => NativeDelivery; timeoutMs?: number; nowMs?: () => number } = {},
): { result: Promise<ShareContextOutcome>; cancel: () => void } {
  const win = options.win ?? (typeof window === "undefined" ? undefined : (window as unknown as ShareContextTarget));
  const post = options.post ?? ((message: NativeMessage) => postNativeMessage(message, win));
  const now = options.nowMs ?? Date.now;
  let cancel = () => {};
  const result = new Promise<ShareContextOutcome>(resolve => {
    let normalized: string | null = null;
    try { normalized = normalizeInstagramUrl(sourceUrl) === sourceUrl ? sourceUrl : null; } catch { normalized = null; }
    if (!normalized || !win || typeof win.addEventListener !== "function" || typeof win.removeEventListener !== "function") { resolve({ status: "unavailable" }); return; }
    const timer: { id?: ReturnType<typeof setTimeout> } = {};
    const finish = (outcome: ShareContextOutcome) => { cancel(); resolve(outcome); };
    const listener = (event: unknown) => { const outcome = readShareContextEvent(event, normalized, now()); if (outcome) finish(outcome); };
    cancel = () => { if (timer.id !== undefined) clearTimeout(timer.id); win.removeEventListener?.(SHARE_CONTEXT_EVENT, listener); };
    win.addEventListener(SHARE_CONTEXT_EVENT, listener);
    if (post({ type: "requestShareContext", sourceUrl: normalized }) !== "sent") { finish({ status: "unavailable" }); return; }
    timer.id = setTimeout(() => finish({ status: "timeout" }), options.timeoutMs ?? SHARE_CONTEXT_TIMEOUT_MS);
  });
  return { result, cancel: () => cancel() };
}

/**
 * What a consented save of `text` may do with the recovered context state:
 * send = attach this validated context; wait = the answer has not arrived, do not save yet; blocked = native sent an
 * unusable context for this link, do not save it as if complete; none = save the link only (the text is a different
 * link, no native context exists, or this is an old context-less record).
 */
export function shareContextForSave(
  text: string,
  recovered: string | null,
  outcome: ShareContextOutcome | { status: "pending" },
): { action: "send"; context: NativeContext } | { action: "wait" | "blocked" | "none" } {
  if (!recovered) return { action: "none" };
  let sameLink = false;
  try { sameLink = normalizeInstagramUrl(text) === recovered; } catch { sameLink = false; }
  if (!sameLink) return { action: "none" };
  switch (outcome.status) {
    case "ready": return { action: "send", context: outcome.context };
    case "pending": return { action: "wait" };
    case "invalid": return { action: "blocked" };
    default: return { action: "none" };
  }
}
