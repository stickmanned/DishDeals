# Reel source constraints (N-SOURCE-C)

Additive private extraction contract. No database, canonical deal, public API or form change.

## Output contract (`lib/reels/contract.ts`)
`ReelExtraction.constraints` is an array of at most 20:

| field | rule |
| --- | --- |
| `draftIndex` | integer 0..9, must point at an existing draft |
| `code` | `FUTURE_START` or `UNSUPPORTED_CONSTRAINT` only |
| `detail` | 1..500 chars |
| `startsOn` | ISO calendar date. Required for `FUTURE_START`; must be `null` for `UNSUPPORTED_CONSTRAINT` |
| `channel`, `quote`, `timestampSeconds` | same source rules as field evidence |

Source rules (`validateExtraction`): caption quote is an exact caption substring; audio quote is an exact transcript substring; audio and visual timestamps are present and within the supplied duration. A `FUTURE_START` quote must also literally state the claimed date COMPLETELY and unambiguously, including the year: an ISO date, a month name with day and four-digit year ("June 15, 2026", "15th of June 2026"), or a numeric date with a four-digit year that has only one valid month/day reading ("06/15/2026"). A year-less date ("June 15"), a year inferred from the publication date, a relative date ("next Monday", "starting tomorrow") and an ambiguous numeric order ("06/07/2026") are never promoted to a typed date: the model must emit `UNSUPPORTED_CONSTRAINT` with `startsOn: null` (still a blocking source-review note), and a `FUTURE_START` that claims such a date is rejected by `validateExtraction`. Constraints are not confidence or probabilities, and unknown strict keys are rejected.

Two schemas share one shape: `reelExtraction` (parser, `constraints` optional so stored pre-change rows still parse) and `reelExtractionResponse` (what the model is asked for, `constraints` required, possibly `[]`).

## Model request
`buildReelExtractionRequest` / `runReelExtraction` (pure, in `contract.ts`; `convex/reelActions.ts` only supplies the stored video bytes and the existing SDK client). The context sent is unchanged (video, caption, publication date, `America/Vancouver`, supplied-source provenance). The `responseJsonSchema` is generated from `reelExtractionResponse`, and the system instruction asks for the array, FUTURE_START only with a quoted complete date including the year, UNSUPPORTED_CONSTRAINT with null date for year-less, relative or ambiguous dates even when a publication date is supplied, and no guessing on conflict. No new SDK, model or provider setting.

## Adapter (`lib/reels/toDealDraft.ts`)
- Typed `FUTURE_START` becomes a blocking `ManualReviewNote` with the canonical code, so the existing reducer ignores any resolution and `validateForPublish` always reports the hard blocker, including after general resolution or manual edits.
- Typed `UNSUPPORTED_CONSTRAINT` becomes a blocking source-review note (resolvable only with a non-empty note).
- `constraints` absent (legacy) means unknown, not none: every offer gets a blocking `LEGACY_CONSTRAINT_REVIEW_DETAIL` note and `sidecar.contractGaps` stays populated. There is no option to skip this. `constraints: []` is the model's "none found": no note, gaps cleared.
- Warnings still become blocking notes. `FUTURE_START` is never inferred from warning text.
- `sidecar.constraints` carries the evidence (clone) beside `evidence`, `transcript` and `warnings`. No confidence is created.

## Limits
- Substring, date-literal and timestamp checks are structural. A visual quote cannot be independently proven by this code: a human must confirm every constraint against the source, and an empty array is only the model's claim. A complete date in a quote is still only what the source says, not proof it is a future start.
- Google docs: structured output guarantees JSON syntax, not correct values (validate in the app); inline video samples about 1 FPS and may miss quick on-screen text; the video guide documents MM:SS timestamps while this contract keeps numeric seconds. Not verified against real media.
- Tests use a labeled synthetic SDK transport; no live model, media, network or phone evidence.

## Integration notes
- Mica: the model sidecar (`evidence`, `transcript`, `warnings`, `contractGaps`, `constraints`, `missingFieldsByDraft`) must survive saves; the adapter already reads the stored extraction unchanged.
- Loom/canonical: no schema change. `FUTURE_START` remains unpublishable through the draft validator until a date/runtime agreement exists.
