// Safe return-to-pending-work after sign-in/profile. `next` is attacker-controllable, so it is never navigated unless it
// exactly matches one of the explicit app routes below. Everything else (and an absent value) falls back to ordinary behavior.
//
// Allowed: /post, /reels, /reels?item=<id>, /deal/<id>, /deal/<id>/edit  (id = alphanumeric, as the app's other id checks).
// Deliberately not allowed: /reels?shared=… (private shared link text), any other query, fragments, tokens, encodings.
export const MAX_NEXT_LENGTH = 256;
const ID = "[A-Za-z0-9]{1,128}";
const ALLOWED = [
  new RegExp("^/post$"),
  new RegExp(`^/reels(\\?item=${ID})?$`),
  new RegExp(`^/deal/${ID}(/edit)?$`),
];

/** Validated same-origin relative path, or null. Multiple `next` values (array) are rejected as ambiguous. */
export function parseReturn(value: string | readonly string[] | null | undefined): string | null {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.length > MAX_NEXT_LENGTH) return null;
  // The pattern list is the only gate; these checks just make the rejected classes explicit (and cheap to read).
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\\%#@:\u0000- \u007f-\u009f]/.test(value)) return null;
  return ALLOWED.some((pattern) => pattern.test(value)) ? value : null;
}

/** Reads `next` from URLSearchParams-like input; more than one `next` is ambiguous and rejected. */
export function returnFromParams(params: { getAll(name: string): string[] } | null | undefined): string | null {
  const all = params?.getAll("next") ?? [];
  return all.length === 1 ? parseReturn(all[0]) : null;
}

function withNext(base: string, next: string | null): string {
  return next ? `${base}?next=${encodeURIComponent(next)}` : base;
}
/** `/signin` keeping an already-validated return target. */
export const signInHref = (next: string | null) => withNext("/signin", parseReturn(next));
/** `/profile` keeping an already-validated return target (signin → profile). */
export const profileHref = (next: string | null) => withNext("/profile", parseReturn(next));

/**
 * What the profile page should do for a signed-in user with a validated return target.
 * - "continue": profile already exists, nothing to edit or lose, go straight on.
 * - "form": show the form; navigate only after a successful save (edits are never discarded by navigation).
 * - "none": no (valid) return target; ordinary profile behavior.
 */
export function profileFlow(next: string | null, profileExists: boolean): "continue" | "form" | "none" {
  if (!parseReturn(next)) return "none";
  return profileExists ? "continue" : "form";
}
