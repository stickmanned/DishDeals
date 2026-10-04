# Recording frame bindings (T-14B)

A user-selected local screen recording becomes **exactly four JPEG frames** that go through the SAME canonical screenshot/flyer flow (`ImageDraftFlow`, `CanonicalPost`). There is no second form, controller, draft state, schema or extractor.

## Flow
1. `selectRecording(file)` (cheap check: non-empty, <= 20 MB, MP4/MOV/WebM). A bad pick keeps the previous source and shows why. The source is an image **or** a recording; picking one clears the other. Form edits are never touched.
2. `analyze()` → `FlowDeps.prepareFrames` (production: `prepareRecordingFrames` = existing `grabFrames(file, 4, { signal })` + exact-four check: four distinct non-empty JPEGs <= 5 MB). Anything else fails before any upload; four are never claimed from fewer.
3. Each frame is uploaded in turn with the authenticated upload route. **All four** need distinct real storage receipts, else the run fails with no partial receipt (a retry decodes again).
4. One `extractDeal` call with all four `imageIds` and the user's own caption/text/link/date. Audio is **not** inferred from frames; anything said must be typed into the extra text box.
5. Offers, apply/replace (with confirm over edits), review and publish are unchanged. A recording offer has `source: "recording"`, `imageIds` (4) and `imageId: null`: **no frame is attached as the deal photo** (frames are analysis inputs only; unpublished uploads expire on the existing 24 h registry TTL).

## Guards reused, not rebuilt
Run generations, cancel, source-switch/unmount invalidation, late-result ignore, single flight, receipt reuse (extract retry re-analyzes the same four ids), receipt drop on `IMAGE_NOT_AVAILABLE`, owned-id publish check, provenance link as provenance only. `grabFrames` owns timeouts, abort and object-URL release.

## Files
`lib/recordingFrameFlow.ts` (pure checks, adapter, copy), `lib/imageDraftFlow.ts` (additive `selectRecording`, optional `prepareFrames`, `progress`, offer `source`/`imageIds`), `components/deals/RecordingFrames.tsx` (minimal chooser/progress, Harry classes), `components/deals/CanonicalPost.tsx` (binding).

## Boundaries
- This is the **screenshot path fed by a recording**. The primary Reel video/audio analysis stays `/reels` with the actual video; nothing here can establish its acceptance.
- Native/primary video and audio paths are untouched.

## Next.js guide compliance (AGENTS.md requires reading the installed guides first)
Read in `node_modules/next/dist/docs/01-app/`: `03-api-reference/01-directives/use-client.md`, `02-guides/lazy-loading.md`, `01-getting-started/05-server-and-client-components.md`. Findings checked against this change:
- `'use client'` must be the first line, before imports: true for `CanonicalPost.tsx` and `RecordingFrames.tsx`.
- Props crossing from a Server Component must be serializable: `app/post/page.tsx` (a Server Component) renders `<CanonicalPost />` with no props. `RecordingPicker` takes the controller object and snapshot, but it is only rendered inside the client `CanonicalPost`, never from a server component, so nothing non-serializable crosses the boundary.
- Browser-only code must not run during prerender: `lib/recordingFrameFlow.ts` and `lib/image.ts` touch `window`/`document`/`File` only inside functions (image.ts documents "safe for SSR"; `grabFrames` throws outside a browser by design), and the decoder runs only from a click via `analyze()`. A static import is therefore fine.
- Lazy loading is optional performance guidance. `next/dynamic` with `ssr: false` is not allowed in Server Components and is not needed here, so none was added.
- Not run: `next build`/a browser mount (needs the map build and a browser). Mounted behavior is verified by imports/typecheck/lint and the controller tests only.

## Copy honesty
The chooser says "recording selected ... frames will be taken when you ask for suggestions" until the controller's `uploaded` flag (all four real receipts) is true; only then "4 frames taken and uploaded" (`recordingSelectionLine`, tested). Picking a file never claims frames exist.

## Pending (not claimed)
- Real 10 s browser/native decode of a genuine local recording, real upload and model reading of real frames: not run; no clip was invented. Only injected fakes were exercised.
- **Missing human interface: frame reveal.** The repo has no existing Harry frame-reveal mechanism, so none was used or built. The frontend owners need to define where the four frames are shown and any animation; the controller exposes `progress {done,total}` and `offers[].imageIds` for it.
- Phone/Safari behavior of `<video>` seeking, memory on large recordings.
