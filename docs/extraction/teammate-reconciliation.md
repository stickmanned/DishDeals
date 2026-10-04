# T-05R · Teammate Extraction Reconciliation Report

**Author**: Prism (Gemini 3.8 Flash, Research & Extraction Specialist)  
**Ticket**: T-05R (Teammate Extraction Reconciliation)  
**Assigned Checkout**: `/Users/william/Code/DishDeals-worktrees/extraction`  
**Assigned Branch**: `t-05-extraction-reconciliation`  
**Base Commit**: `83035c1eeed1c17915764ae0321594315fd5a81b` (origin/main)  
**Status**: Completed analysis and contract fixtures; ready for T-05 extraction packet.

---

## 1. Executive Summary

This report performs a comprehensive static source audit and contract reconciliation of teammate extraction branches against the canonical DishDeals schema and system architecture.

### Key Conclusions:
1. **Teammate Backend Value**: Teammate branch `feature/deal-extraction` implements a structured extraction pipeline using Gemini REST endpoints and Geoapify place lookup in `ai-workflow/`. Its prompt instructions, regex sanitization, and structured JSON schemas provide valuable foundational logic.
2. **Incompatible Standalone Architecture**: Teammate code operates as an isolated standalone backend (`ai-workflow/`) with its own schema (`jobs`, `deals`, `limits`), custom job-polling tables, and separate HTTP endpoints. Merging it wholesale would break the canonical Convex schema ([convex/schema.ts](file:///Users/william/Code/DishDeals-worktrees/extraction/convex/schema.ts)) and client data flow.
3. **Genuine Confidence Incompatibility**: Teammate's extraction schema produces a single scalar `confidence: number (0..1)` plus arrays of warnings. The canonical schema ([lib/dealSchema.ts](file:///Users/william/Code/DishDeals-worktrees/extraction/lib/dealSchema.ts)) strictly requires four field-level scores: `{ restaurant, priceCad, hours, expiresOn }`. **Global confidence cannot be mechanically distributed to the four fields, and defaulting to 0.5 is strictly forbidden**. The extraction prompt must be updated to elicit per-field confidence directly.
4. **No-Instagram-Scraping Policy Conflict**: Teammate code includes URL handling via Gemini's `url_context` tool and HTTP page retrieval. The DishDeals specification explicitly forbids Instagram scraping. For Instagram deals, URL input must be stored solely as a reference `sourceUrl` on the deal record in Convex; extraction must process user-supplied screenshots or caption text.
5. **Model Reality Check**: The project plan references speculative model names (`gemini-3.8-flash` and `gemini-3.5-flash-lite`), while teammate code uses `gemini-2.5-flash` in its environment configuration. Google AI Studio v1beta REST endpoints support `gemini-1.5-flash`, `gemini-2.0-flash`, and `gemini-2.5-flash` with `responseJsonSchema`. The T-05 implementation must use an explicitly verified, available model name and avoid hardcoded unverified identifiers.
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

The canonical Deal structure is defined in [lib/dealSchema.ts](file:///Users/william/Code/DishDeals-worktrees/extraction/lib/dealSchema.ts):
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
| `restaurantName: string` | `restaurant: string` | Direct trim and copy. If missing, cannot be a valid deal (`isDeal: false`). |
| `locationHint: string \| null`<br>`addressHint: string \| null`<br>`place.address: string` | `address: string \| null` | Use `place.address` if geocoded by map lane, or fallback to `addressHint` / `locationHint`. Do not fabricate addresses. |
| `title: string`<br>`description: string` | `dealText: string` | Format as `title` if concise and informative, or `${title} — ${description}` if description contains essential specifics. Must fit deal overview. |
| `price: number \| null`<br>`currency: string \| null` | `priceCad: number \| null` | **Strict currency enforcement**: If `currency === "CAD"` (or explicit CAD context in Vancouver with `$` sign), assign `price`. If currency is USD, EUR, or missing/ambiguous, set `priceCad = null` and flag in conditions/warnings. **Never assume CAD without evidence.** |
| `discountPercent: number \| null` | *(No direct field)* | Fold into `dealText` (e.g. "50% off tacos") or append as condition string. |
| `days: ("Monday" .. "Sunday")[]` | `validDays: ("mon" .. "sun")[]` | Deterministic enum translation table:<br>`Monday` -> `"mon"`, `Tuesday` -> `"tue"`, `Wednesday` -> `"wed"`, `Thursday` -> `"thu"`, `Friday` -> `"fri"`, `Saturday` -> `"sat"`, `Sunday` -> `"sun"`. Empty array implies every day. |
| `startTime: string \| null` | `validStart: string \| null` | Match `HH:mm` format; pad single hour digits to 2 digits (`09:00`). Null indicates all day / opening. |
| `endTime: string \| null` | `validEnd: string \| null` | Match `HH:mm` format; overnight deals allowed (e.g. `validEnd < validStart`). Null indicates closing. |
| `startDate: string \| null` | *(No direct field)* | Not stored directly on Deal. If startDate is in the future, deal may be scheduled or noted in `conditions`. |
| `endDate: string \| null` | `expiresOn: string \| null` | Must be ISO `YYYY-MM-DD`. Validated to be non-retroactive unless post publication date proves historical record. |
| `conditions: string[]` | `conditions: string[]` | Array of strings, trimmed. Includes restrictions, minimum spend, dine-in only, etc. |
| `confidence: number`<br>`warnings: string[]`<br>`evidence: string` | `confidence: { restaurant, priceCad, hours, expiresOn }` | **Incompatible.** Cannot be mapped from scalar `confidence`. See Section 4. |
| `rejectionReason: string \| null` | `isDeal: boolean` | If `rejectionReason !== null` or deals array is empty, `isDeal = false`, `deals = []`. |

---

## 4. Genuine Confidence Incompatibility

### The Problem
Teammate extraction schema defines:
```typescript
confidence: z.number().min(0).max(1)
```
This is a single global scalar representing model self-assessment over the whole extraction.

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
1. **Asymmetric Uncertainty**: A promotional image may show a crisp, unambiguous restaurant logo (`restaurant: 0.98`), but have tiny, partially obscured fine print regarding the expiry date (`expiresOn: 0.25`), or no price stated at all (`priceCad: null`). Copying a single average score (e.g. `0.65`) corrupts both fields:
   - It over-flags the reliable restaurant name, creating unnecessary human review friction.
   - It under-flags the doubtful expiry date, allowing unverified data into the database.
2. **Prohibition of Default 0.5**: Defaulting missing or unmeasured field scores to `0.5` is arbitrary slop. In UI logic (such as `ConfidenceField`), 0.5 triggers ambiguity warnings on fields that might have been 100% obvious in the image, destroying user trust.
3. **Requirement for T-05 Extraction**: The extraction prompt and structured response schema (`responseJsonSchema`) passed to Gemini in T-05 must explicitly ask for individual confidence ratings for `restaurant`, `priceCad`, `hours`, and `expiresOn` directly from the model.

---

## 5. No-Instagram-Scraping Policy Conflict

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

### The Policy Violation
The canonical DishDeals specification strictly states:
> **No Instagram scraping: server never scrapes Instagram URLs.** Instagram aggressively blocks datacenter IPs and changes layouts; scraping is fragile. Accept user-pasted text, screenshots, or flyer photos. If user provides an Instagram URL, accept it ONLY as a reference link stored on the deal, never scrape it.

### Required Resolution
1. **Forbidden Operations**: The server must never invoke `tools: [{ url_context: {} }]` on `instagram.com` URLs or attempt HTTP scraping of Instagram endpoints.
2. **Source Ingestion**: When deals originate from Instagram (via the mobile share sheet or user entry), the app accepts:
   - Screenshot / photo image bytes (uploaded to Convex storage).
   - User-supplied caption or transcribed text.
   - Optional `sourceUrl` string, saved directly to `deals.sourceUrl` in Convex for user reference, without automated fetching.

---

## 6. Model Availability & Structured Output Audit

### Model Verification
1. **Plan Assumptions vs Current Reality**:
   - `StormHacks Project Plan Instagram Deal Saver.md` specifies `gemini-3.8-flash` and fallback `gemini-3.5-flash-lite`.
   - Inspection of current Google Generative AI API documentation (v1beta REST API) shows that production model identifiers are:
     - `gemini-1.5-flash` (standard multimodal, fast, supports JSON schema)
     - `gemini-1.5-pro` (complex reasoning)
     - `gemini-2.0-flash` (next-gen multimodal)
     - `gemini-2.5-flash` (latest flash preview, referenced in teammate's `.env.example`)
   - The model name `gemini-3.8-flash` is unverified in standard Google AI documentation.
2. **SDK vs Direct REST**:
   - The project plan lists `@google/genai`.
   - Neither the root `package.json` nor teammate's `ai-workflow/package.json` includes `@google/genai`.
   - Teammate code in `ai-workflow/src/gemini.ts` successfully implements direct REST calls to:
     `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
     using standard `fetch`, passing `x-goog-api-key` in headers and `responseJsonSchema` in `generationConfig`.
   - For T-05, direct REST fetch or adding `@google/genai` is feasible, but using direct REST inside Convex actions requires zero new npm dependencies.

---

## 7. Source-Supported Adapter Requirements for T-05

When T-05 (`convex/extract.ts` and `lib/prompt.ts`) is implemented, the adapter must satisfy:

1. **Input Interface**:
   ```typescript
   export type ExtractInput = {
     imageIds: Id<"_storage">[]; // Convex storage IDs
     caption?: string;           // Optional user/shared text
     sourceUrl?: string;         // Stored only, never scraped
   };
   ```
2. **Prompt & Structured Schema**:
   The prompt must request JSON matching `DealResult`:
   - `isDeal: boolean`
   - `deals: Deal[]` where each `Deal` contains the canonical 4-field `confidence` object.
3. **Data Sanitization**:
   - Translate weekdays to `"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"`.
   - Enforce CAD currency check before setting `priceCad`.
   - Sanitize times to 24-hour `"HH:mm"`.
   - Convert missing optional values from `null` to `undefined` before database insertion into Convex table `deals`.
4. **Offline Demo Fallback**:
   Compute SHA-256 hash of the input image; if matching fixture exists in `fixtures/demo/<sha256>.json`, return it to ensure zero-latency, fail-safe demo execution.

---

## 8. Native Sharing & Frontend Boundary

- **Teammate Ownership**: Harry owns native Instagram sharing and frontend styling.
- **Unpushed State**: Harry has not yet pushed code for the iOS share extension or native app layer (his branch `Harrys-Frontend` currently contains only brand kit assets).
- **Runtime Agnosticism**: Because whether the native app is Swift Native, Expo/React Native, or a progressive web wrapper is not finalized, the extraction backend must not make any assumptions about client runtime, device headers, or client-side storage mechanisms.

---

*Report concluded. Inert contract fixtures provided in `fixtures/extraction-contract/`.*
