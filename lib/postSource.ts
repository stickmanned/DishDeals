// Strict normalization and validation for the /post?source= provenance parameter (N-TEXT-FORM).
// Uses the existing normalizeInstagramUrl from lib/reels/contract.ts to enforce exact canonical format.
import { normalizeInstagramUrl } from "./reels/contract";

/**
 * Validates and normalizes a ?source= query parameter from /post?source=...
 *
 * Rules:
 * - Accepts only a single string parameter; arrays (duplicate params) fail safely returning null.
 * - Enforces strict explicit URL format: rejects parameters with surrounding text or whitespace.
 * - Enforces strict Instagram URL normalization via `normalizeInstagramUrl`:
 *   - Only public Instagram Reel/Post links (instagram.com, www.instagram.com, m.instagram.com).
 *   - No credentials, ports, path tricks, or non-Instagram domains.
 *   - Canonicalizes to https://www.instagram.com/reel/<shortcode>/
 * - Never fetches, parses content, or fills captions/media/tokens.
 * - Malformed, non-string, empty, or invalid URLs fail safely returning null.
 */
export function parsePostSourceParam(param: unknown): string | null {
  if (typeof param !== "string") return null;
  const trimmed = param.trim();
  if (!trimmed) return null;
  // Must be an explicit URL without arbitrary surrounding text or whitespace
  if (/\s/.test(trimmed)) return null;
  if (!/^https:\/\//i.test(trimmed)) return null;
  try {
    return normalizeInstagramUrl(trimmed);
  } catch {
    return null;
  }
}

/**
 * Checks if a token matches link patterns (scheme://, known scheme, scheme-relative, www., or bare domain).
 * Matches Loom backend 6c3f605 token eligibility.
 */
function isLinkToken(token: string): boolean {
  return (
    /^(?:[a-z][a-z0-9+.-]*:\/\/|(?:mailto|tel|data|javascript):|\/\/|www\.)/i.test(token) ||
    /^(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}(?:[/:?#]|$)/u.test(token)
  );
}

/**
 * Checks whether a single string has actual source text (contains at least one token that
 * is not a link and contains Unicode letters or digits, after stripping surrounding punctuation/quotes).
 * Matches Loom backend 6c3f605 hasSourceText token eligibility.
 */
export function hasSourceText(value?: string | null): boolean {
  return (value ?? "").split(/\s+/u).some((part) => {
    const token = part.replace(/^[([{<"'“‘]+|[)\]}>"'”’,;.!?]+$/gu, "");
    if (!/[\p{L}\p{N}]/u.test(token)) return false;
    return !isLinkToken(token);
  });
}

/**
 * Determines whether caption or text provides genuine non-URL source text.
 * Used to ensure that text-only analysis is enabled only for actual user-supplied text
 * (guards against empty, whitespace-only, punctuation-only, or URL-only submissions where no extraction call should be made).
 */
export function hasNonUrlText(caption?: string | null, text?: string | null): boolean {
  return hasSourceText(caption) || hasSourceText(text);
}
