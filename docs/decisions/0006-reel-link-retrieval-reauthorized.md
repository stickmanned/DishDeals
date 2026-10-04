# Reel link retrieval re-authorized

October 4, 2026. Decision by William (project owner), stated in chat: scraping is allowed for this feature because retrieving
the Reel from its link is the only way to read its contents. Instagram's share sheet supplies only `public.url`.

This supersedes the "link-only, no retrieval" constraint in ADR 0004 and the "resolver is not authorized" note in ADR 0002, and
is a narrow exception to the "no Instagram scraping" rule in AGENTS.md and docs/agent-workflow.md. Nothing else about scraping
changes: the exception covers retrieving the single Reel a signed-in user shared, for that user's private draft.

## Behavior

- `reels.submit` saves the normalized link and starts the durable workflow. `reelActions.retrieve` calls the ScrapeCreators API
  (`lib/reels/provider.ts`), downloads the MP4, and `reelActions.extract` sends video + caption to Gemini.
- The result is a **private draft** for the user to review. It is never published automatically: location is still confirmed by
  the user and publishing still goes through `deals.create`.
- Server-only configuration, all on the Convex deployment: `SCRAPECREATORS_API_KEY`, `REEL_PROVIDER_USAGE_AUTHORIZED=true`,
  `GEMINI_API_KEY`, `GEMINI_REEL_MODEL`. If any is missing the item fails closed **before any network call**, with a message that
  points to the fallbacks.
- Safeguards kept from the original implementation: video host allow-list (`cdninstagram.com`, `fbcdn.net`), https only, no
  redirects, 12 MB and 3 minute caps, MP4 signature check, shortcode must match the shared link, 10 submissions or retries per
  hour per user, downloaded media deleted once a draft exists, bounded retries.
- A link saved while retrieval was off is started when it is shared again.
- Fallbacks when retrieval fails (private or removed Reel, provider down): attach your own recording, paste the caption or use a
  screenshot in the standard post form, or edit by hand.

## Not changed

No other Instagram surface is scraped. The limited Gemini page diagnostic (`convex/instagramPageProbe.ts`) is separate and
unchanged. No retrieval for anyone but the signed-in sharer, and no bulk or search retrieval.
