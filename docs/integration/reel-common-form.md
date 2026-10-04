# Reel Intake to Canonical Review Form Integration (N-FORM-B)

## Overview
This document records the integration of the reusable canonical `DealReviewForm` (`components/deals/DealReviewForm.tsx`) and injected `DealLocationPicker` (`components/maps/DealLocationPicker.tsx`) into the private Reel intake view (`components/reels/ReelIntake.tsx` and `components/reels/CanonicalReelReview.tsx`).

The integration replaces the former private `Result`/`DraftEditor` layout with canonical deal review capabilities, manual draft persistence across retries and failures, explicit location confirmation/invalidation, and multi-offer indexing.

---

## Architecture and Components

### 1. `CanonicalReelReview` (`components/reels/CanonicalReelReview.tsx`)
A controlled React component mounted per private reel item (`key={item._id}`).
- **Offer Navigation**: Supports multi-offer Reel extractions (1 to 10 offers) with explicit tab buttons (`Offer 1`, `Offer 2`, etc.), displaying current index and total count.
- **Model Provenance**: Displays immutable extraction source details:
  - Transcript (collapsible/scrollable).
  - Grounding evidence quotes and timestamp tags.
  - Extraction warnings.
  - Original Reel link (`sourceUrl`).
- **Injected Map Picker**: Passes `renderLocation` prop to `DealReviewForm`, rendering `DealLocationPicker`.
  - When a user clicks or moves a pin on the map, `onInvalidate` immediately dispatches `INVALIDATE_LOCATION` to the reducer, clearing confirmed coordinates.
  - Explicit click on "Confirm this location" dispatches `CONFIRM_LOCATION`.
  - Unconfirmed locations prevent publishing.
- **Controlled State & Optimistic Concurrency**:
  - Maintains `drafts` in local state using `dealDraftReducer`.
  - Tracks server `generation` and `draftRevision`.
  - On concurrent conflict (`expectedGeneration` or `expectedRevision` mismatch returned by `saveDraft`), displays conflict status with two explicit choices:
    - **Keep my edits**: Preserves local form edits and updates expected version counters.
    - **Load latest from server**: Re-initializes drafts from updated server item.
- **Save Receipt**: Explicitly indicates server receipt only ("Draft saved privately to your account."), without claiming model verification or published deal status.
- **Publish Callback**: Accepts optional typed prop `onPublish?: (fields: PublishFields) => Promise<void>`.
  - Because canonical deal creation (`deals.create`) is owned by Loom (T09C) and pending final integration, publish is safely disabled with an honest note when `onPublish` is omitted.
  - When provided, `onPublish` validates both canonical draft fields and local price text before calling, preserving user edits on failure.
  - The component re-runs canonical `buildPublishFields` on the live offer (and refuses while a version conflict is unresolved) before calling `onPublish`; only the active offer is published.
- **Saved-value confirmation**: when a reloaded offer has unreviewed populated values, a "Confirm saved values" control dispatches `REVIEW_FIELD` through the reducer. No arbitrary text edit is needed, and the old manual flag is never treated as review.
- **Late/new extraction**: a changed `extractionJson` is shown as a separate notice with "Use model suggestions" (only when nothing has been entered) or "Add model offers" (keeps all edits), plus "Ignore". It is never auto-applied; "Load latest" is the only action that re-initializes from the server.
- The review form is keyed by offer index and a replace-epoch so its local price text re-initializes only when drafts are replaced wholesale.

### 2. `ReelIntake` Updates (`components/reels/ReelIntake.tsx`)
- Keeps `CanonicalReelReview` mounted (keyed by item only) in every state including `retrieving`/`extracting`, so local edits and partial price text survive retries.
- Keeps the `AttachRecording` panel mounted too; uploads are disabled (not unmounted) while the item is processing.
- Preserves the exported `DraftReview` layout fixture interface for `app/preview/layout/LayoutPreview.tsx` (using clear synthetic/non-saving mocks).

### 3. Reducer Location Invalidation (`lib/dealDraft.ts`)
- Added `INVALIDATE_LOCATION` action to `DealDraftAction`:
  ```ts
  | { type: "INVALIDATE_LOCATION" }
  ```
- Handling resets `draft.location = null` while strictly preserving all other deal fields (restaurant, address, dealText, price, schedule, conditions).

### 4. Review Draft Helpers (`lib/reels/reviewDraft.ts`)
Pure helper module bridging `ReelItem` / `ReelDraft` data with canonical `DealDraft`:
- `initDraftsFromReelItem(item)`:
  - Initializes drafts from model extraction (`extractionJson`) or saved draft (`draftJson`).
  - Converts Reel drafts to canonical `DealDraft` format.
  - **Honest Review State**: All fields start as `isReviewed: false` on initial load and reload, requiring explicit user review/confirmation. Model data or previously saved values are never falsely marked pre-confirmed.
  - Handles empty or absent extractions by returning a clean, empty editable draft.
- `serializeDraftsToReelDrafts(drafts)`:
  - Serializes canonical drafts into strict `ReelDraft[]` array suitable for `reels.saveDraft`.
  - Maps `priceCad` to numeric `price` and `"CAD"` currency only when validly entered/accepted.
  - Unknown/empty arrays serialize to `null` if unreviewed, and `[]` if explicitly reviewed as no-conditions or all-weekdays.
- `confirmationActions(draft)`: reducer `REVIEW_FIELD` actions for populated (or known-empty, user-entered) unreviewed fields. Backs the explicit "Confirm saved values" control; unknown/omitted fields still need their own omission review, and unaccepted model suggestions are never confirmed.
- `planLateExtraction(drafts, extractionJson)`: plan for a late/new model extraction, applied only after the user chooses. Replaces only entirely pristine offers; otherwise appends model offers as new unreviewed offers (max 10). Existing values, partial review state and price text are untouched.
- Model review issues (adapter warnings, FUTURE_START, currency notes) are carried into saved/manual drafts. Saved offers have no stable model ids, so equal count does not prove alignment (reorder or delete+append keeps the count). Index binding is trusted only for an UNEDITED saved draft with the same count. For any `draftEdited: true` draft, or a changed count, it fails closed: every blocking model constraint/warning/FUTURE_START note goes on every saved offer, index-bound currency notes and suggestions are dropped (no invented correspondence), and one blocking "cannot be matched automatically; confirm manually from the source" note is added. A typed FUTURE_START can therefore never disappear through count coincidence. The original `extractionJson` and evidence are never rewritten and remain in the Source evidence panel.
- Optional additive typed `manualReview: [{code, detail, dealIndex?, blocking?}]` beside the strict extraction in stored JSON is read tolerantly (malformed entries ignored; FUTURE_START always blocking) until Prism's source helper merges and supplies it for real.
- Publish validation is NOT duplicated here: the component calls canonical `buildPublishFields` / `validateForPublish` from `lib/dealDraft`, so FUTURE_START stays a hard blocker and unreviewed fields (even previously user-entered ones) are rejected.

### 5. Backend Policy Revision (`convex/reels.ts: saveDraft`)
- Revised policy allows creation and saving of manual private drafts for owned unexpired items even when `draftJson` is initially absent.
- An existing stored `draftJson` must be strict 1..10 `ReelDraft`s within the size limit, otherwise the save fails safely with `"This draft is corrupt."`. The only exception is the system's own untouched `"[]"` placeholder written for a `no_deal` result (an edited `"[]"` is corrupt).
- Setting `draftEdited: true` ensures that any late model extraction finishing afterwards cannot overwrite the user's manual draft.

---

## Known Limits & Non-Assumptions
1. **App Reload Re-confirmation**: In-memory user review metadata (e.g. `isReviewed` checkboxes) and confirmed map pin states are not stored in the lightweight `reelDraft` database schema. Reloading the page re-initializes fields with `isReviewed: false`, requiring the user to re-confirm before publishing.
2. **Publish API Dependency**: The Convex backend currently lacks a public `deals.create` mutation for reel items. Publishing remains disabled until Northstar wires the reviewed mutation from Loom's T09C work.
3. **No Automatic Polishing / Geocoding**: No external geocoding requests or polished CSS animations are introduced; Harry classes and standard responsive form controls are reused.
