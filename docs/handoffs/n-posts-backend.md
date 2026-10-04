# N-POSTS-BACKEND handoff

**Status: DONE — local implementation and scoped checks.** Independent review/integration pending. Final targeted233 tests/9 files, typecheck and scoped lint pass. Two initial stale inventory failures were resolved under explicit path amendments. No full npm check or cloud/phone acceptance claimed. One ticket only; return directly and stop.

Owner Loom. Checkout `/Users/william/Code/DishDeals-worktrees/posts-expiry-backend`, branch `t-10-posts-expiry-backend`, clean starting base `dcdda819e97de9c371726dd7ba33585912afe7d5`. Authoritative central packet and tasks manifest read first; T-02 already DONE. Reused configured runtime and existing root `node_modules` via explicitly allowed symlink; no install/env copy. Read AGENTS/spec/team/workflow/Convex guidelines. `maestri list` confirmed existing team; no recruits or messages back to the waiting caller.

## Behavior and ownership

- `deals.listMine({limit:number})` returns canonical public deals plus `imageUrl:string|null`, newest first through `by_author`. Sign-in is required, limit is integer1..50, author is derived server-side, caller authorId is rejected. Published post/reel-derived deals share this list; private `reelItems` drafts are excluded. No profile/auth/private draft enrichment.
- `dealDeletionTime` resolves Vancouver local midnight eight dates after inclusive expiry: expiry2026-10-04 is retained through Oct11, eligible Oct12 00:00 (07:00 UTC). Seven full subsequent calendar days, not seven elapsed24-hour periods. Uses existing `formatVancouverParts` for historical DST and permanent Pacific time; missing/malformed/unresolvable expiry is retained. Physical deletion is separate from browser validity and expired votes.
- New hourly canonical cron starts `deals.sweepExpired({cursor:null})`. Each internal mutation scans at most25 creation-index rows with128KiB read target and schedules continuation. A frozen creation upper bound prevents continuous new publications prolonging that sweep; later rows join the next sweep. Retained early rows cannot starve expired rows. No schema/index/state table added.
- Each scheduled `deals.removeExpired({dealId})` runs in its own transaction, re-reads current record/date/clock, and skips removed, renewed, cleared, malformed or not-yet-eligible deals. Internal registration checked. Queued work carries no stale expiry or caller-supplied deletion clock.
- Shared private `deletePublishedDeal` retains existing author-remove invariants: own votes, geospatial point and canonical record deleted atomically; image/registry released only after the final canonical reference. Existing manual author/profile checks unchanged. Above the existing vote cap or on component failure, deletion refuses/rolls back completely; this exceptional deal remains for review while sweep continuation proceeds independently. No unbounded multi-deal vote/storage deletion transaction.
- Legacy `workflow.maintenance.expireDeals` and private reel retention remain untouched. No Instagram URL retrieval, provider/geocoder call or fabricated extraction. Posts/Reels source-kind UI work belongs to sibling packets.

Writable changes: `convex/deals.ts`, `convex/crons.ts`, `lib/dealRetention.ts`, `tests/backend/dealMine.test.ts`, `tests/backend/dealRetention.test.ts`, `tests/import/dealRetention.test.ts`, this handoff; plus **explicit amendments** `tests/backend/dealWrites.test.ts` only its old module-export expected list/comment and `tests/backend/dealImageUpload.test.ts` only line230 export inventory/line328 cron-name inventory. All unrelated upload/auth/quota/storage/security/ownership/CRUD assertions preserved. No schema/auth/generated/package/root/status files changed.

## Reproduction and checks

Source evidence: user reports missing authored public list; base has no `listMine` and no canonical-deal retention cron (legacy workflow expiry is a separate table). No actual phone/account reproduction attempted because this packet forbids login/private-data reads; all test records/users/files are synthetic in-memory.

Before fix, command below exited1: **31 failed /6 passed,37 tests across3 non-empty suites**. Failures explicitly named absent `deals:listMine`, `deals:removeExpired`, `deals:sweepExpired` and retention module, including happy-path ownership/cutoff tests. Invalid-limit generic rejection tests alone passed and are not bug-fix evidence.

```sh
node node_modules/vitest/vitest.mjs run tests/backend/dealMine.test.ts tests/backend/dealRetention.test.ts tests/import/dealRetention.test.ts
```

First fixed run:91/93 passed, two fixture failures due convex-test monotonic fractional `_creationTime` beyond a frozen clock. Fixtures advanced past inserts; queued-job test now asserts a job was actually queued. Corrected run93/93 passed. Additional tests then cover55 eligible rows across deleted pages, sweep upper bound, retained private items and actual cron registration. A later typecheck caught the installed cron runtime `export()` method missing from its public type; test narrowed that inspected runtime method explicitly, with no production/API change.

Final targeted command (actual result **233 tests /9 files PASS**, exit0 at07:00:38 Vancouver; prior eight-file run180/180 also passed):

```sh
node node_modules/vitest/vitest.mjs run tests/backend/dealMine.test.ts tests/backend/dealRetention.test.ts tests/import/dealRetention.test.ts tests/backend/dealWrites.test.ts tests/backend/dealGet.test.ts tests/backend/dealRecent.test.ts tests/backend/dealNearby.test.ts tests/backend/votes.test.ts tests/backend/dealImageUpload.test.ts
```

Coverage includes cutoff−1ms/exact/+1ms, historical spring/fall DST,2026 permanent Pacific, leap/year rollover, malformed legacy expiry, clock rollback, cleared/extended expiry through actual author update, stale queued removal, one-deal transactional vote/index/image cleanup, shared images, oversized-vote/index-failure rollback, pagination past retained rows and deleted pages, no private draft leakage, signer isolation/anonymous rejection, argument bounds, and preserved author CRUD. Component uses actual in-memory geospatial implementation. No live behavior claimed.

```sh
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js convex/deals.ts convex/crons.ts lib/dealRetention.ts tests/backend/dealMine.test.ts tests/backend/dealRetention.test.ts tests/import/dealRetention.test.ts tests/backend/dealWrites.test.ts tests/backend/dealImageUpload.test.ts
git diff --check
```

Typecheck/scoped lint/diff checks exit0. No build/full npm check, workflow suite, cloud sync, account/login, provider request, actual cron deployment or phone run in this packet. Prior root2070/23 is inherited coordinator evidence only.

## Historical regression inventory mismatch — resolved by exact amendment

Initially adding `tests/backend/dealImageUpload.test.ts` to the targeted command ran233 tests: **231 PASS /2 FAIL**, exit1. Both failures were expected inventory changes and were initially left intact because this path was not authorized:

1. Line230 hardcodes old deals exports, omitting approved `listMine`, `removeExpired`, `sweepExpired`.
2. Line328 hardcodes exactly two old cron identifiers, omitting `clean canonical published deals after retention`.

The other51 upload tests passed. Northstar then explicitly approved ONLY these two inventories; both now include the approved API/cron names, all other assertions unchanged. Final nine-file run passes233/233, including all53 upload tests. No bypass, exclusion-as-full-pass, weak assertion or unauthorized edit used.

## Return and human acceptance

Northstar reviews this exact local commit and alone integrates/statuses it. Separate reviewed dev sync is required before live API/cron acceptance; **no cloud action authorized/performed here**. Cinder can consume the pinned `listMine` signature via `makeFunctionReference`; tracked generated modules untouched. Actual Your posts/edit/public publish/phone flow remains pending William after integration/release. Automatic URL-only Instagram extraction remains blocked; geocoding OFF. No next ticket taken, push, deploy, secrets copy or private-data read.

Implementation follows current [Convex cursor pagination](https://docs.convex.dev/database/pagination) and [scheduled mutation semantics](https://docs.convex.dev/scheduling/scheduled-functions), checked against local generated guidelines and installed SDK. Applied convex-test skill with existing dependencies only.

Implementation commit `35e78fc2649991ed6aaf3cffc6995796f2b0127f`; a following scoped commit records the two approved upload inventories and this final evidence. Final clean branch SHA returned directly; review both commits from the pinned base.
