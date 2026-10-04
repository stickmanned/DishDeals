# T-05R · Teammate Extraction Reconciliation Report

**Author**: Prism (Gemini 3.8 Flash, Research & Extraction Specialist)  
**Ticket**: T-05R (Teammate Extraction Reconciliation)  
**Assigned Checkout**: `/Users/william/Code/DishDeals-worktrees/extraction`  
**Assigned Branch**: `t-05-extraction-reconciliation`  
**Base Commit**: `83035c1eeed1c17915764ae0321594315fd5a81b` (origin/main)  
**Status**: Completed analysis and contract fixtures; ready for T-05 extraction packet.

---

## 1. Executive Summary

This report performs a static source audit and contract reconciliation of teammate extraction branches against the canonical DishDeals schema and system architecture.

### Key Conclusions:
1. **Teammate Backend Value**: Teammate branch `feature/deal-extraction` implements a structured extraction pipeline using Gemini REST endpoints and Geoapify place lookup in `ai-workflow/`. Its prompt instructions, regex sanitization, and structured JSON schemas provide valuable foundational logic.
2. **Incompatible Standalone Architecture**: Teammate code operates as an isolated standalone backend (`ai-workflow/`) with its own schema (`jobs`, `deals`, `limits`), custom job-polling tables, and separate HTTP endpoints. Merging it wholesale would break the canonical Convex schema ([convex/schema.ts](../../convex/schema.ts)) and client data flow.
3. **Genuine Confidence Incompatibility**: Teammate's extraction schema produces a single scalar `confidence: number (0..1)`. The canonical schema ([lib/dealSchema.ts](../../lib/dealSchema.ts)) strictly requires four field-level scores: `{ restaurant, priceCad, hours, expiresOn }`. **Global confidence cannot be mechanically distributed to the four fields, and defaulting to 0.5 is strictly forbidden**. The extraction prompt must be updated to elicit per-field self-assessment scores directly. Arbitrary global-confidence rejection thresholds must not be preserved: tentative autocomplete suggestions are permitted for partially clear information, and `isDeal: false` is reserved strictly for actual evidence that no offer exists. Low self-assessment scores alone route to the editable review form rather than hard rejection.
4. **No-Instagram-Scraping Rule**: Teammate code includes URL handling via Gemini's `url_context` tool and HTTP page retrieval. The DishDeals rule forbids server-side Instagram scraping because Instagram aggressively detects and blocks automated requests and changes layouts. For Instagram deals, URL input is stored solely as reference provenance on the deal record in Convex; extraction must process user-supplied screenshots or caption text.
5. **Verified Model Availability**: Official primary documentation at [Google Models Documentation](https://ai.google.dev/gemini-api/docs/models) lists both `gemini-3.8-flash` (flagship Flash model for agents and software engineering) and `gemini-3.5-flash-lite` (high-throughput, cost-efficient model) as current stable models. Teammate code in `ai-workflow/.env.example` configured `GEMINI_MODEL=gemini-2.5-flash`. No live provider calls were run or assumed.
6. **Native Sharing & Frontend Boundaries**: Harry owns native Instagram sharing and frontend UI. His sharing branch remains unpushed and unavailable. The runtime environment (native iOS Swift/Obj-C, React Native/Expo, or web Share Target) is undecided. Extraction logic must remain headless, pure, and decoupled from client runtime choices.

---

## 2. Inspected Published Heads & Baseline Branches

| Branch Name | Full Git Commit SHA | Scope / Contents | Owner / Status |
| :--- | :--- | :--- | :--- |
| `origin/feature/deal-extraction` | `91b957a37c063d0b7072bb2c92afe4882699bc66` | Standalone `ai-workflow/` backend: Gemini extraction, Geoapify geocoding, standalone Convex tables (`jobs`, `deals`). | Teammate (cpy). Standalone feature. |
| `origin/feature/dishdeals-initial-implementation` | `e3a39cc3398a0e0866e5dbe4e606f7e06b2ed2ca` | Baseline snapshot containing `ai-workflow/`, `map-component/`, and full `map-site/` (Cloudflare/Next.js). | Teammate (cpy). Historical baseline. |
| `origin/feature/deal-map` | `2daac63731a46f20f3484bfa3c352f5ea3737e8b` | Standalone React MapLibre map component (`map-component/`). | Teammate (cpy / Pinyuan). Map lane. |
| `origin/Harrys-Frontend` | `ffe54c11dba44f6f57b6e83ab576c306124a6a6f` | Brand Kit reference and static HTML assets (`frontend_reference/`). | Harry. Frontend reference only. |
| *Native Instagram Share Branch* | **Unpushed / Unavailable** | Native iOS / share extension code. | Harry. Unpushed; runtime cannot be selected. |

---

## 3. Concrete Canonical Field Mappings

The canonical Deal structure is defined in [lib/dealSchema.ts](../../lib/dealSchema.ts):
```typescript
export const Deal = z.object({
  restaurant: z.string(),
  address: z.string().nullable(),
  dealText: z.string(),
  priceCad: z.number().nullable(),
  validDays: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])),
  validStart: z.string().nullable(), // "HH:MM"
  validEnd: z.string().nullable(),
  expiresOn: z.string().nullable(), // "YYYY-MM-DD"
  conditions: z.array(z.string()),
  confidence: z.object({
    restaurant: z.number(),
    priceCad: z.number(),
    hours: z.number(),
    expiresOn: z.number(),
  }),
});
```

Below is the concrete mapping specification from teammate representations to canonical fields:

| Teammate Field (`ai-workflow`) | Canonical Field (`lib/dealSchema.ts`) | Transformation & Reconciliation Rules |
| :--- | :--- | :--- |
| `restaurantName: string` | `restaurant: string` | String trim. **Unknown restaurant is a blank string / pending draft (`""`)**, not proof that `isDeal: false`. The existence of a deal is separate from whether the restaurant name was recognized. |
| `locationHint: string \| null`<br>`addressHint: string \| null`<br>`place.address: string` | `address: string \| null` | Address hints and geocoded place candidates are **unconfirmed source hints**, NOT confirmed publish locations. Pass as pre-fill hint; preserve source hint separately from confirmed pin/address until the user accepts in the map confirmation step. |
| `title: string`<br>`description: string` | `dealText: string` | Format as `title` if concise and informative, or `${title} — ${description}` if description carries essential specifics. |
| `price: number \| null`<br>`currency: string \| null` | `priceCad: number \| null` | **Strict CAD evidence rule**: Set `priceCad = price` *only* when explicit supplied currency evidence proves CAD (e.g. source explicitly states "CAD", "C$", or Canadian pricing). A Vancouver default search context plus a dollar sign (`$`) does not prove CAD. If USD, EUR, or unverified, set `priceCad = null`. |
| `discountPercent: number \| null` | *(No direct field)* | Fold into `dealText` (e.g. "50% off tacos"). |
| `days: ("Monday" .. "Sunday")[]` | `validDays: ("mon" .. "sun")[]` | Deterministic enum translation table:<br>`Monday` -> `"mon"`, `Tuesday` -> `"tue"`, `Wednesday` -> `"wed"`, `Thursday` -> `"thu"`, `Friday` -> `"fri"`, `Saturday` -> `"sat"`, `Sunday` -> `"sun"`. Empty array implies every day. |
| `startTime: string \| null` | `validStart: string \| null` | Match `HH:mm` format; pad single hour digits to 2 digits (`09:00`). Null indicates all day / opening. |
| `endTime: string \| null` | `validEnd: string \| null` | Match `HH:mm` format; overnight deals allowed (e.g. `validEnd < validStart`). Null indicates closing. |
| `startDate: string \| null` | *(No direct field; blocking review)* | Canonical `Deal` has no `startDate` field. A future `startDate` is **unrepresentable** in the current schema; if published as-is, `lib/validNow.ts` would treat it as valid today. Future `startDate` requires a blocking review / contract decision, not silently dropping it into conditions or publishing it as valid. |
| `endDate: string \| null` | `expiresOn: string \| null` | Must be ISO `YYYY-MM-DD`. |
| `conditions: string[]` | `conditions: string[]` | Array of strings, trimmed. Includes restrictions, minimum spend, dine-in only. **Warnings and model uncertainty must NOT be folded into conditions** as if they were source-stated restrictions. |
| `confidence: number`<br>`warnings: string[]`<br>`evidence: string` | `confidence: { restaurant, priceCad, hours, expiresOn }` | **Incompatible representation.** Teammate scalar confidence cannot be broken down to per-field scores. See Section 4. |
| `rejectionReason: string \| null` | `isDeal: boolean` | If `rejectionReason !== null` while `deals` array is non-empty, this is an **ambiguous state inconsistency requiring review**, not an automatic discarding of genuine deals. |

---

## 4. Genuine Confidence Incompatibility

### The Problem
Teammate extraction schema defines:
```typescript
confidence: z.number().min(0).max(1)
```
This is a single global scalar representing an overall score over the whole extraction.

In contrast, canonical DishDeals requires:
```typescript
confidence: z.object({
  restaurant: z.number(),
  priceCad: z.number(),
  hours: z.number(),
  expiresOn: z.number(),
})
```

### Why Mechanical Mapping Fails
1. **Asymmetric Uncertainty**: A promotional image may show an obvious restaurant logo (`restaurant: 0.98`), but have tiny, unreadable fine print regarding the expiry date (`expiresOn: 0.25`), or no price stated at all (`priceCad: null`). Copying a single average score (e.g. `0.65`) corrupts both fields:
   - It over-flags the reliable restaurant name, creating unnecessary human review friction.
   - It under-flags the doubtful expiry date, allowing unverified data into the database.
2. **Prohibition of Default 0.5**: Defaulting missing or unmeasured field scores to `0.5` is arbitrary. In UI logic (such as `ConfidenceField`), 0.5 triggers ambiguity warnings on fields that were completely clear, destroying user trust.
3. **Model Self-Assessment vs Probability**: Real model scores are subjective self-assessments, not calibrated statistical probabilities or ground-truth evidence certainty.
4. **No Arbitrary Global Rejection Thresholds**: Teammate code discarded extractions falling below an arbitrary global confidence score. Under project direction, tentative suggestions are explicitly permitted for partially clear offers. An extraction must only return `isDeal: false` when there is concrete evidence of no offer (e.g. food reviews without discounts, receipt photos, or non-deal media). When an offer is detected but confidence is low or information is partial, it must route to the editable deal review form for human confirmation rather than being discarded by an arbitrary threshold.

---

## 5. No-Instagram-Scraping Rule

### Teammate Behavior
In `ai-workflow/src/gemini.ts`:
```typescript
if (input.source.type === "url") {
  const retrieved = await generate(config, config.model, {
    systemInstruction: { ... },
    contents: [{ role: "user", parts: [{ text: input.source.url }] }],
    tools: [{ url_context: {} }],
    ...
  });
  ...
}
```
And in `ai-workflow/src/network.ts`, arbitrary URLs are fetched via Node `fetch`.

### The Policy Conflict
The canonical DishDeals specification forbids server-side Instagram scraping because Instagram aggressively blocks datacenter IPs and changes layouts. Accept user-pasted text, screenshots, or flyer photos. If a user provides an Instagram URL, accept it solely as a reference link stored on the deal, never scrape it.

### Required Resolution
1. **Forbidden Operations**: The server must never invoke `tools: [{ url_context: {} }]` on Instagram URLs or attempt HTTP scraping of Instagram endpoints.
2. **Source Ingestion**: When deals originate from Instagram (via the mobile share sheet or user entry), the app accepts:
   - Screenshot / photo image bytes (uploaded to Convex storage).
   - User-supplied caption or transcribed text.
   - Reference `sourceUrl` string, saved directly to `deals.sourceUrl` in Convex for user reference, without automated fetching.

---

## 6. Model Availability & Structured Output Audit

### Model Verification from Primary Sources
1. **Primary Documentation Review**:
   Visiting the official Google AI documentation at [Google Models Documentation](https://ai.google.dev/gemini-api/docs/models) confirms:
   - **`gemini-3.8-flash`**: Officially listed as stable (flagship model for agentic software workflows and multimodal understanding).
   - **`gemini-3.5-flash-lite`**: Officially listed as stable (optimized for cost efficiency and high throughput).
   Both models cited in the project plan are confirmed stable in the primary documentation.
2. **Teammate Configuration**:
   Teammate branch `feature/deal-extraction` (`91b957a`) configured `GEMINI_MODEL=gemini-2.5-flash` in `ai-workflow/.env.example`.
3. **SDK vs Direct REST**:
   Neither the root `package.json` nor teammate's `ai-workflow/package.json` includes `@google/genai`. Teammate code in `ai-workflow/src/gemini.ts` implements direct REST calls to `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` using standard `fetch` with `responseMimeType: "application/json"` and `responseJsonSchema`. Direct REST fetch inside Convex actions avoids adding extra SDK dependencies.
4. **Provider Isolation**:
   No live provider calls were made during this analysis, and no live model availability or performance is inferred beyond the official primary documentation.

---

## 7. Source-Supported Adapter Requirements for T-05

When T-05 (`convex/extract.ts` and `lib/prompt.ts`) is implemented, the adapter must satisfy:

1. **Exact Canonical API Signature**:
   The `extract.extractDeal` action must strictly match the plan contract:
   ```typescript
   export const extractDeal = action({
     args: {
       imageIds: v.array(v.id("_storage")),
       caption: v.optional(v.string()),
     },
     handler: async (ctx, args): Promise<DealResult> => { ... }
   });
   ```
   `sourceUrl` is provenance captured during deal submission and saved to the `deals` table in Convex; it is NOT an argument to `extractDeal`.
2. **Prompt & Structured Schema**:
   The prompt must request JSON matching `DealResult`:
   - `isDeal: boolean`
   - `deals: Deal[]` where each `Deal` contains the canonical 4-field self-assessment `confidence` object.
3. **Data Sanitization & Ingestion Guardrails**:
   - Translate weekdays to `"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"`.
   - Enforce CAD currency evidence before setting `priceCad`.
   - Sanitize times to 24-hour `"HH:mm"`.
   - Unknown restaurant maps to `""` for poster confirmation.
   - Future `startDate` is a blocking contract issue requiring review before publishing as currently valid.
   - Ambiguous rejection reasons with non-empty deals require review, not automatic discarding.
   - Convert missing optional values from `null` to `undefined` before database insertion into Convex table `deals`.
4. **Demo Fixtures**:
   Genuine cached extraction fixtures in `fixtures/demo/<sha256>.json` allow the demo to run without depending on live Gemini API latency during presentation. These are distinct from synthetic inert contract fixtures in `fixtures/extraction-contract/`. Live Convex database and feed queries still require network connectivity; no zero-latency or complete offline claims should be made.

---

## 8. Native Sharing & Frontend Boundary

- **Teammate Ownership**: Harry owns native Instagram sharing and frontend styling.
- **Unpushed State**: Harry has not yet pushed code for the iOS share extension or native app layer (his branch `Harrys-Frontend` currently contains only brand kit assets).
- **Runtime Agnosticism**: Because whether the native app is Swift Native, Expo/React Native, or a progressive web wrapper is not finalized, the extraction backend must remain headless, transport-agnostic, and decoupled from client runtime choices.

---

*Report concluded. Inert contract fixtures provided in `fixtures/extraction-contract/`.*
