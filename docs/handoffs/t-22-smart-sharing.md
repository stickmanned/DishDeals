# T-22: Share links, text, or optional images

Explicit user assignment: simplify posting and accept Instagram shares, restaurant websites, other public links, or text without requiring an image. This supersedes the earlier source-type restriction for public Instagram links; it does not authorize private-account access or a scraping service.

Branch: `t-22-smart-sharing`, based on `t-21-frontend-integration` at `527d9b3`. Isolated checkout: `dishdeals-new-frontend/AI_Restaurant_deal`.

The post form accepts one source field, detects pasted links, removes share tracking, preserves copied captions, and offers an optional photo attachment. Preview remains separate; live requests use anonymous Convex authentication when needed. Public links use Gemini URL context. Unreadable links require supplied text or an image; caption-only fallbacks carry a warning that forces manual review. Canonical tables and map integration are unchanged.

Validation: 191 app tests passed, including share parsing, unsafe-link rejection, Instagram contract acceptance, and inaccessible-page caption fallback. Typecheck and lint run during implementation; combined deployment validation is tracked in T-23 and the integration handoff.

Limitations: authenticated/private Instagram media and video/audio transcription require separate supported access. Links alone cannot promise a readable page or a verified offer.
