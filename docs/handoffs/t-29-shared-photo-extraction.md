# T-29 shared photo extraction

Branch `t-29-shared-photo-extraction`, isolated checkout `/private/tmp/dishdeals-t29-photo-extraction`, based on untouched T-27 `fa7a9f9`.

William confirmed the installed T-28 app now opens the shared item's review screen, then reported missing automatic deals. Read-only bounded backend diagnostics found the latest three failed items were `/p/` posts. The latest error was UNAVAILABLE before Gemini: no accessible video. With William's explicit approval, one diagnostic ScrapeCreators call (1 existing credit) confirmed success with XDTGraphImage, is_video=false, video_url=null and a full display_url. No source URL, caption, API key or provider response values were printed. Official contract: https://docs.scrapecreators.com/v1/instagram/post/openapi.json

The retrieval client now accepts a verified single-photo response and downloads its full image using the existing Instagram/Facebook CDN allowlist, no redirects or credential forwarding. Enforces the existing 5 MB image limit, content type and byte signature. Carousel covers and unavailable video thumbnails are rejected rather than presented as complete source. Videos retain their previous limits and path.

The existing staging mediaMime union is additively expanded to JPEG/PNG/WebP. The same workflow sends an actual image and caption to the configured Gemini image model, respecting both existing retrieval and image authorization gates. Uses the current strict draft/evidence/constraint schema, visual timestamp 0, no audio transcript/evidence. Private drafts, generation fencing, edited-draft protection, auth and publication review stay in the existing path. Source storage is deleted on finish/failure as before.

Checks: red regression reproduced original UNAVAILABLE; after fix 183 targeted tests passed; complete suite 85 files / 2279 tests passed; npm run typecheck and npm run lint passed; git diff --check passed. Providers and Gemini in tests are labeled synthetic. Real diagnostic verified provider metadata only; no claim of live Gemini extraction yet.

Release target is dev:proper-marmot-82 (ca-central-1), which serves the live site. GEMINI_IMAGE_MODEL=gemini-3.8-flash and IMAGE_PROVIDER_USAGE_AUTHORIZED=true already configured. No secrets or flags changed. Backend release awaits William's explicit approval and a fresh data/file backup. Phone acceptance after release: open failed post, tap Retry processing, observe private populated draft; confirm uncertain fields before publishing. Existing manually edited draft must remain intact.
