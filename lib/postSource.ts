// Strict normalization and validation for the /post?source= provenance parameter (N-TEXT-FORM).
// Uses the existing normalizeInstagramUrl from lib/reels/contract.ts to enforce exact canonical format.
import { normalizeInstagramUrl } from "./reels/contract";

/**
 * Validates and normalizes a ?source= query parameter from /post?source=...
 *
 * Rules:
 * - Accepts only a single string parameter; arrays (duplicate params) fail safely returning null.
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
  try {
    return normalizeInstagramUrl(trimmed);
  } catch {
    return null;
  }
}

/**
 * Strips URLs from caption and text and returns true if any non-whitespace content remains.
 * Used to ensure that text-only analysis is enabled only for actual user-supplied text
 * (guards against empty, whitespace-only, or URL-only submissions where no extraction call should be made).
 */
export function hasNonUrlText(caption?: string | null, text?: string | null): boolean {
  const check = (s?: string | null): boolean => {
    if (!s) return false;
    const stripped = s
      .replace(/https?:\/\/[^\s<>]+/gi, "")
      .replace(/\bwww\.[^\s<>]+\b/gi, "")
      .trim();
    return stripped.length > 0;
  };
  return check(caption) || check(text);
}
