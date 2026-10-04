# Genuine demo extraction cache

No genuine extraction cache files have been created yet. Synthetic tests live under tests/import and never in this directory. Real menu images are source evidence, not extraction outputs.

T-16A prepares `demoKey`/`loadDemoFixture`; `/post` binding follows the reviewed owned-image flow. Publish these files as same-origin static `/fixtures/demo/<original-file-sha256>.json` only after actual authorized extraction and review. This directory is not automatically served by Next.js; a reviewed integration step must copy approved files into public/fixtures/demo. No copy or provider call has occurred.

The version1 file must record original sourceSha256, requestSha256 (ordered actual resized images/MIMEs plus exact caption/text/provenance/publication and promptVersion), promptVersion, provenance `{kind:"live-provider-capture",capturedAt:ISO UTC,evidenceReference:local redacted run log,model:actual model}` and the full ExtractOutcome envelope. Keep manualReview and requiresBlockingReview, including future-start restrictions; never save a bare DealResult, invented output, token or key. Update promptVersion when extraction prompts/contracts change. Different source/context/order/version is a cache miss.

Metadata asserts provenance; the loader cannot independently prove a provider call. Northstar must review the actual run evidence before including a fixture. Replay must be visibly labeled cached and still undergo manual field and pin confirmation. It does not establish fresh provider latency, offline authenticated publishing, native sharing or phone acceptance. Missing/bad/slow/canceled cache safely falls back without replacing current user edits; caller controls request revision and fallback.
