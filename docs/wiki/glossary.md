# Glossary

**Canonical** — refers to the real, Convex-backed, persisted data/UI, as opposed to "preview" (local-only example data) or "standalone" (an older separate workflow deployment). "Canonical deal" = a row in the `deals` table. See [[Three Mode Runtime]].

**Draft** — an editable, not-yet-published representation of a deal, produced from AI extraction or manual entry. Never the same object as a published `deals` row. See `lib/dealDraft.ts`, [[AI Review Gate]].

**Evidence / evidence-grounding** — the requirement that every AI-extracted field be backed by a verbatim quote from the source (caption, transcript, or supplied text). Evidence that isn't found verbatim in the source is flagged with a warning rather than trusted. See [[Reel Ingestion Workflow]], [[Screenshot and Flyer Extraction]].

**Generation (fencing)** — a monotonically increasing counter on a `reelItems` row, bumped on retry/delete/supersede, used so a late-arriving async result (from a stale workflow run) can be detected and ignored. See [[Generation Fencing]].

**Manual review note / `manualReview`** — the sidecar array an extraction envelope carries alongside the deal data itself (`FUTURE_START`, `UNSUPPORTED_CONSTRAINT`, `CURRENCY_UNVERIFIED`), each optionally `blocking: true`. A blocking note must be resolved before publish. See [[AI Review Gate]].

**Native context / native-supplied context** — text an iPhone's share sheet captured alongside an Instagram link before the app ever saw it (e.g. a caption fragment), carried as a strictly bounded, versioned JSON blob (`version: 1`). Private to the owner; never a public deal field; a `truncated: true` flag permanently blocks automatic extraction for that item. See `lib/reels/nativeContext.ts`, `ios/Shared/ShareStore.swift`.

**Outcome (workflow)** — in the teammate-workflow pipeline, one `{deal, restaurant, candidates, status}` record produced per extracted deal from a source; `status` is `"ready" | "needs_review" | "rejected"` and never auto-advances to `"published"`. See [[Teammate Workflow Pipeline]].

**Preview mode** — the app running with no real backend connection (or with the human user explicitly browsing example data); uses static demo deals (`lib/frontend/demoDeals.ts`) and local-only state. See [[Preview vs Canonical UI]].

**Reel** — an Instagram Reel (short video). "Reel item" = a row in the `reelItems` table representing one user's save of a Reel link, independent of whether they've supplied a recording yet.

**Supplied recording / supplied media** — a video the user records of a Reel playing on their own phone and uploads to DishDeals, since DishDeals never fetches Instagram content itself (the "legacy resolver" that once tried this is permanently disabled). See [[Reel Ingestion Workflow]].

**`*_USAGE_AUTHORIZED`** — a naming convention for environment flags (e.g. `GEOCODE_USAGE_AUTHORIZED`, `IMAGE_PROVIDER_USAGE_AUTHORIZED`) that must be explicitly `"true"` before any paid/external provider call fires, independent of whether the corresponding API key is set. See [[Environment Gated Providers]].

**Validity (`validNow`)** — the computed real-time status of a deal (`valid | later_today | not_today | expired | unknown`) given its stored days/hours/expiry and the current instant in America/Vancouver time. See [[Deal Validity and Distance Math]].

**Workflow (the teammate pipeline)** — capitalized/unqualified "workflow" in `convex/workflow/*` and `lib/workflow/*` refers to the separate ingestion/search/compare subsystem contributed by a teammate's branch, *not* the `@convex-dev/workflow` durable-orchestration library (which is used only by the Reel pipeline's `reelWorkflow.ts`). These are two unrelated meanings of "workflow" that collide in this codebase — watch for which one a file means. See [[Teammate Workflow Pipeline]] vs [[Reel Ingestion Workflow]].

**Ticket IDs (T-XX, N-XXX)** — identifiers from the project's task-tracking process (`docs/tasks/`, `docs/handoffs/`), not part of the running application. See [[Source - Project Process Docs]].
