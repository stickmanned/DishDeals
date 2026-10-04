# N-SOURCE-TEXT handoff — canonical pasted-source extraction

- **Status:** implemented and targeted checks passed; ready for independent auth/source review. STOP after this one amended packet.
- **Owner:** Loom, Codex GPT6.1Sol/high. Checkout `/Users/william/Code/DishDeals-worktrees/shared-text-extraction`, branch `t-05-shared-text-extraction`.
- **Exact starting base:** `700c46801254010ac1433c7a4ae0f2313a3a52cd`; branch/HEAD matched and tree was clean before edits. Commit SHA is in the direct return. Base contains integrated N-CORE-BACKEND/N-CORE-REVIEW evidence. T-01/T-02 DONE remains unchanged.
- **Authority:** the amended central `workflow/docs/tasks/N-SOURCE-TEXT.md` and central manifest governed this work. The checkout's historical native-fragment packet was superseded and was not implemented.

## Changed paths and behavior

Only `convex/extract.ts`, `tests/backend/extractAction.test.ts`, and this handoff changed. An explicitly allowed ignored `node_modules` symlink points to the existing workflow dependencies; nothing installed, no env file copied. Human checkout, central STATUS/manifest, native/source workflow/schema/generated files and package configuration were not changed.

The existing public `extract.extractDeal` now accepts required `imageIds: []` when `caption` or `text` contains supplied non-link content. The original supplied text stays intact as untrusted evidence for `extractDealCore`; provenance URLs remain excluded from the model request. Empty/whitespace/punctuation-only input and bare links in caption/text/provenance cannot enable extraction. Eligibility handles scheme, www, bare-domain, quoted/parenthesized and scheme-relative link-only inputs, while permitting punctuated and Unicode source text. It is source eligibility, not URL retrieval or semantic proof that the text states a deal.

Auth remains first. The existing server-only `IMAGE_PROVIDER_USAGE_AUTHORIZED`/Gemini key/model gate remains required. Text-only calls skip all image-registry queries and storage reads; any supplied image still follows the existing max8/distinct/owner/expiry/size/type checks and the second ownership check after reading bytes. No new public/internal function, argument, return-envelope shape, note-code enum, confidence field, env flag or canonical schema was introduced.

For each text-only output deal, the action appends a blocking `UNSUPPORTED_CONSTRAINT` review sidecar with its own deal index:

> Only supplied caption/text was examined; video and audio were not examined. Verify all fields and any restrictions missing from this partial source before publishing.

Existing FUTURE_START/UNSUPPORTED_CONSTRAINT/CURRENCY_UNVERIFIED sidecars and original amounts remain intact. The four model confidence values and canonical conditions are untouched. `requiresBlockingReview` reflects all resulting notes. A no-deal response gets no invented offer, probability or partial-source note. Both image and text errors retain the sanitized code/message/retryable envelope.

**Pinned UI contract:** Mica may call existing `api.extract.extractDeal` with `imageIds: []` plus actual pasted caption/text and optional provenance/publication date; there is no image attached to the offers. Carry the whole extraction envelope and resolve the blocking sidecars using the existing review flow. This does not adapt native fragments automatically.

## Reproduction and exact checks

William's real-phone report supplied the trigger: private Instagram save required a recording, and Instagram supplies only a link. No live provider/browser reproduction was attempted for this backend change because this packet prohibits provider invocation and has no actual supplied caption/session for an authorized live test. The existing action gap was reproduced directly with its real public function in convex-test, using synthetic users and scripted network responses.

Tests were written **before implementation**. The first run of `node node_modules/vitest/vitest.mjs run tests/backend/extractAction.test.ts --reporter=dot` exited **1**, with **14 failed / 48 passed (62)** at 06:00:36 Vancouver: valid text-only calls incorrectly rejected with `INVALID_INPUT: Send 1 to 8 different images`, and configuration/model checks never reached their intended path. After the initial fix, all62 passed. Review added meaningful eligibility cases first: short `Pho:C$10` source and two link-only variants exposed **3 failed /31 passed /34 skipped (68)**; the filter was corrected before the final checks. All network requests in these tests were stubbed, including failure paths; no provider quota was consumed.

Final commands, run October4 around06:04 Vancouver:

| Check | Actual result |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run tests/backend/extractAction.test.ts tests/extraction/extractCore.test.ts tests/import/extractionDraft.test.ts --reporter=dot` | exit0; **3 files /182 tests PASS**, 6.73s; includes68 public-action tests |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | exit0, no diagnostics |
| `node node_modules/typescript/bin/tsc -p convex/tsconfig.json --noEmit --incremental false` | exit0, no diagnostics |
| `node node_modules/eslint/bin/eslint.js convex/extract.ts tests/backend/extractAction.test.ts` | exit0, no diagnostics |
| `git diff --check` | exit0 |

The first root typecheck exited2 on test-only instrumentation typing (`_handler` is exposed at runtime but omitted from the public action type, and a parameterized gate-case record inferred undefined fields). Both were corrected using explicit test types; the final root and Convex typechecks above passed. The zero-image infrastructure test instruments the real handler with convex-test auth; other acceptance/security cases call the registered public action, exercising args/return validation. Model data, identities and images are synthetic/in-memory; passing tests are not live model-quality, native or phone evidence.

## Remaining steps and stop

- Northstar: independently review auth/image checks, URL-only eligibility and partial-source sidecar handling, then integrate locally. An authorized serialized dev sync is a separate coordinator step; this packet made no sync/schema/backup/cloud change.
- William: after reviewed integration and authorized backend sync/UI binding and human web deployment, paste genuine post caption/text without an image and check the source-supported suggestions, each blocking review warning, explicit field/constraint resolution, manual pin, publish and marker/detail. No agent signs in or operates William's account. Automatic retrieval from a real Instagram **link-only** receipt remains blocked; no recording/video/audio is claimed to have been examined.
- Geocoding remains OFF pending real contact; no seed, geocoder, Gemini, resolver, account, secret/env read/copy, deployment or push was performed. No full build/npmcheck, live extraction or phone test was run in this packet. No runtime-credit failure occurred.
- Next proposed packet: Northstar's independent review of this exact commit and Mica's separately assigned caption form integration. Neither was started by Loom; no nested agents or automatic next ticket.
