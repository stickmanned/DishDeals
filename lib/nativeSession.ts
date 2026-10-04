import { normalizeInstagramUrl } from "./reels/contract";

// Browser side of the trusted-origin Swift bridge (`dishdeals` message
// handler). Pure and SSR-safe: nothing here touches `window` at import time,
// never logs, and only reports whether a message was handed to the handler.
// "sent" does NOT mean native Keychain storage succeeded: Swift returns
// nothing, so there is no acknowledgement to report.

export type NativeMessage =
  | { type: "session"; token: string | null }
  | { type: "received"; sourceUrl: string }
  | { type: "enableNotifications" }
  | { type: "result"; itemId: string; status: "ready" | "no_deal" | "failed" };

export type NativeDelivery = "sent" | "not_sent";

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
      try {
        // Only the canonical normalized form may be reported for cleanup.
        return normalizeInstagramUrl(message.sourceUrl) === message.sourceUrl;
      } catch {
        return false;
      }
    case "result":
      return /^[A-Za-z0-9]{1,128}$/.test(message.itemId);
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
 */
export async function saveReelLink(
  input: string,
  retentionDays: number,
  submit: (args: { text: string; retentionDays: number }) => Promise<{ itemId?: string } | null | undefined>,
  post: (message: NativeMessage) => NativeDelivery = postNativeMessage,
): Promise<{ itemId: string; receipt: NativeDelivery }> {
  const sourceUrl = normalizeInstagramUrl(input);
  const result = await submit({ text: sourceUrl, retentionDays });
  if (!result || typeof result.itemId !== "string" || !result.itemId) {
    throw new Error("The server did not confirm the save.");
  }
  return { itemId: result.itemId, receipt: post({ type: "received", sourceUrl }) };
}
