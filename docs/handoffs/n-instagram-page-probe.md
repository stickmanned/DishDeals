# N-INSTAGRAM-PAGE-PROBE handoff

**DONE locally; independent server-key review and live experiment pending.** No provider call or cloud sync performed. Return directly and stop after this ticket.

Owner Loom; checkout `/Users/william/Code/DishDeals-worktrees/instagram-page-probe`; branch `t-05-instagram-page-probe`; verified clean starting base `4341076fca3a6d238d02f9af0cac97cb8dcb86bd`. Central packet and current manifest read first; T-02 remains DONE. Reused existing configured runtime/model and authorized `node_modules` symlink to workflow; no dependency install or env/secret copy. Read AGENTS, spec/team/workflow docs and generated Convex guidelines; `maestri list` confirmed the existing team. No recruitment, model switching, circular request, shared-status/root edits or next ticket.

## Exact contract

- `instagramPageProbe:probe({url:string})` is a **Node internalAction**, with strict argument/return validators. Only `https://www.instagram.com/p/C8AMUvOxv8m/` is accepted, byte-for-byte. Other posts/reels/hosts, non-www alias, HTTP, query/hash, whitespace and omitted trailing slash reject before SDK construction. No caller credential/model/tool arguments. Server/admin-only; no new public API or user-data/auth lookup.
- Uses existing server-only `env.GEMINI_API_KEY`, `IMAGE_PROVIDER_USAGE_AUTHORIZED === "true"` and nonblank `GEMINI_IMAGE_MODEL`. Missing/disabled configuration rejects before constructing the SDK. No fallback model or new gate. Secret appears only in the SDK constructor, never prompt, returned diagnostic or logs.
- Installed `@google/genai` **2.27.0**, `GoogleGenAI.interactions.create`, with only `tools:[{type:"url_context"}]`. Single non-streaming, non-background request, `store:false`, `max_output_tokens:600`; no previous interaction/search/tool combination. System instruction limits the single page to caption/visible restaurant/offer/address/price/hours/expiry evidence, leaves unknowns blank, treats page instructions as untrusted, forbids nested/other URLs and location/video/audio inference.
- SDK options `timeout_ms:60000`, `retries:{strategy:"none"}`, AbortSignal. Independent60s deadline aborts and clears its timer; no manual retry, fallback, polling, cancel API call or continuation. Abort is a client deadline, not proof Google cancels processing/billing. Constructor/provider errors use fixed sanitized `PROVIDER_ERROR`; deadline uses fixed `TIMEOUT`. No provider exception/request-header/env-key logging.
- Outcome: `{sourceUrl,status,retrieval,text,unconfirmed:true,videoExamined:false,notice}`. `retrieval` is null or the exact approved URL with observed recognized `success/error/paywall/unsafe`, or normalized `unknown` for an unknown status. Text is suppressed unless one well-formed exact-URL `url_context_result` reports success, interaction completed without errors, and all observed call/citation metadata stays on that URL. Missing/failed/paywalled/unsafe/malformed/conflicting/unrelated metadata returns `unsupported` with empty text, without echoing model guesses, error details or unrelated URLs.
- `retrieved` means **page retrieval only**, never verification of interpretation. Every model statement remains an unconfirmed plain-text diagnostic, no deal schema/coordinates/confidence/confirmed fields or automatic publication. Text <=1600 chars; serialized diagnostic <=2000 chars including JSON escaping/metadata. Video examined always false. A genuine successful retrieval with no model text may still return empty text.
- Google URL-context is the provider's built-in retrieval tool, not an application-side URL sandbox. Its installed interface exposes no per-tool URL allowlist: the request supplies only the approved URL, prohibits other URLs in the prompt, and response metadata fails closed if off-page retrieval appears. This limited experiment does not authorize broader retrieval. No direct Instagram fetch/scraper/resolver/proxy/search, frontend/private intake/publish binding, database/storage write or canonical extraction change.

## Tests first and final results

Initial pre-implementation run: **35 failures /35 tests**, non-empty suite; action/module absent (`Could not find module for: "instagramPageProbe"`). The initial deadline assertion also surfaced an unhandled test assertion because the module was absent; it was corrected to capture rejection before waiting. Corrected pre-implementation rerun still35/35 FAIL, exit1, without unhandled errors. These demonstrate the missing diagnostic, not actual Instagram/provider accessibility.

After implementation35/35 passed. Added serialized-output escaping, malformed metadata and actual installed-SDK request simulations:44 tests. The two SDK route assertions initially treated its `Request` object as a string; corrected to inspect `.url`. Typecheck then caught broad string types against literal URL validators; narrowed the outcome types to the exact URL. Lint's unused simulated-fetch argument warning was corrected; final lint requires zero warnings. No weakened safety/canonical tests.

Final commands from the assigned checkout:

```sh
node node_modules/vitest/vitest.mjs run tests/extraction/instagramPageProbe.test.ts tests/backend/extractAction.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/typescript/bin/tsc -p convex/tsconfig.json --noEmit --incremental false
node node_modules/eslint/bin/eslint.js --max-warnings 0 convex/instagramPageProbe.ts lib/instagramPageProbe.ts tests/extraction/instagramPageProbe.test.ts
git diff --check
```

Actual final results at07:31:53 America/Vancouver: **112 tests /2 files PASS** (44 probe +68 unchanged canonical extraction); root typecheck PASS; Convex typecheck PASS; scoped lint PASS,0 warnings; diff checks PASS. Tests use synthetic SDK replies/in-memory Convex and simulated HTTP only. Installed SDK simulations observed exactly one Google `/v1beta/interactions` request for200 and503 responses; no request went to Instagram and503 did not retry. All default test network access throws. No genuine page retrieval, successful provider interpretation, production build/full npm check or phone acceptance claimed.

Coverage: wrong URLs/config before SDK; exact success metadata and tentative text; missing/error/paywall/unsafe/unknown/conflicting/off-page metadata; malformed call identity/error flag; off-page tool arguments/citations; incomplete/provider-error responses; serialized quotes/control/emoji output bounds; fixed sanitized constructor/provider failures/no logs/no retries;60s abort; internal registration/argument rejection; real installed SDK routing/retry behavior under fake HTTP. Original canonical extraction suite passes untouched.

## SDK/documentation evidence and next authorized boundary

Current [Google URL-context guide](https://ai.google.dev/gemini-api/docs/url-context) uses interactions and retrieval result steps. It describes public-page text/image/PDF context, and excludes paywalled content and video/audio. [Official interactions API](https://ai.google.dev/api/interactions) is the selected method; no legacy generateContent fallback.

Installed `dist/genai.d.ts` confirms `GeminiNextGenInteractions.create`, `generation_config.max_output_tokens`, `RequestOptions.timeout_ms/retries`, `URLContextResultStep.result[{url,status}]`, and status values. Installed `dist/node/index.mjs` confirms the bridge preserves `retries:{strategy:"none"}`; a `maxRetries` alias would override that policy, so it is deliberately not supplied. Both actual SDK fake-HTTP tests confirm the chosen interface works locally. This is SDK compatibility evidence, not live-model availability.

Only four assigned tracked paths changed: `convex/instagramPageProbe.ts`, `lib/instagramPageProbe.ts`, `tests/extraction/instagramPageProbe.test.ts`, this handoff. Generated/schema/package/auth/canonical extraction/source intake/publish files untouched. Final scoped commit/clean SHA returned directly.

Northstar schedules independent server-key review, then separately authorized backed-up development sync and **at most TWO live calls total on this exact URL**. The two-call limit is an operational experiment budget, not a persistent app counter; this packet forbids adding state/writes. No live call is authorized in this implementation step. A live unsupported result is a real blocker; do not retry beyond that later budget or enable overage. No account/sign-in or William-account operation. General URL-only Instagram extraction remains blocked outside this limited diagnostic; geocoding remains OFF. No phone proof or automatic publish claim.
