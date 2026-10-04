# Restaurant comparison integration

An English API for comparing **two to five different restaurant locations**, using one published offer per location. It supplies side-by-side deal descriptions, listed prices, discount percentages, restrictions, schedules, source links, and optional taste evidence. There is no standalone frontend.

## HTTP integration

From your teammate's **server**, send `POST /v1/deals/compare` to the existing Convex HTTP site URL, with `Authorization: Bearer <WORKFLOW_API_TOKEN>` and JSON:

```json
{
  "dealIds": ["published-deal-id-A", "published-deal-id-B"],
  "priority": "value"
}
```

Use the real `dealId` values returned by `GET /v1/deals` or `api.deals.listForMap`. The server loads the selected published records directly from Convex; clients cannot supply replacement prices or conditions. Missing, unpublished, expired, duplicate, or same-location selections are rejected. Calls share the existing search allowance of 60 per owner per hour.

The ready-to-use server wrapper is [examples/compare-server.ts](./examples/compare-server.ts). Expose it through your app's authenticated server route. Keep the workflow token and Gemini key on the server. HTTP errors are 401 for missing authorization, 400 for invalid input/selection, 429 for quota exhaustion, and 500 for unexpected failures. AI failure returns an evidence comparison with a warning instead of a fabricated recommendation.

For an app already using authenticated Convex:

```ts
import { useAction } from "convex/react";
import { api } from "./convex/_generated/api";
const compare = useAction(api.compare.find); // At the top of your existing component.
const result = await compare({
  inputJson: JSON.stringify({ dealIds: selectedDealIds, priority: "taste", tasteEvidence }),
});
```

## Priorities

| API value | Suggested English label | Behavior |
| --- | --- | --- |
| `value` (default) | Value for money | Gemini weighs the recorded offer and restrictions; it can abstain. No invented savings or value score. |
| `price` | Lowest listed price | Deterministic suggestion only when all selected prices are known in the same currency, with a unique lowest price. Ties stay visible. |
| `taste` | Taste first | Gemini considers supplied food review excerpts before deal size. Every selected restaurant needs evidence; missing evidence produces no taste recommendation. |

For taste-first comparison, optionally supply up to three excerpts per selected deal:

```json
{
  "dealIds": ["published-deal-id-A", "published-deal-id-B"],
  "priority": "taste",
  "tasteEvidence": [
    {
      "dealId": "published-deal-id-A",
      "quote": "COPY AN ACTUAL FOOD REVIEW EXCERPT HERE",
      "sourceUrl": "https://reviews.example.com/restaurant-A",
      "dish": "Dish named in the review"
    },
    {
      "dealId": "published-deal-id-B",
      "quote": "COPY AN ACTUAL FOOD REVIEW EXCERPT HERE",
      "sourceUrl": "https://reviews.example.com/restaurant-B"
    }
  ]
}
```

These are placeholder inputs, not real reviews. The integration must supply actual excerpts and matching source URLs, ideally about the offered dish. **This API does not fetch reviews, scrape sites, validate excerpt provenance, or claim firsthand taste.** It labels excerpts `provided_review`, retains their source links, and warns that taste is subjective and the evidence is not independently verified. The AI is instructed to abstain when comments concern only service/ambiance or do not support a food recommendation. Negative evidence remains visible. Do not market its output as a verified best-tasting ranking.

## Returned data and map connection

- `restaurants`: the selected records in request order, including `facts`, `caveats`, and `availability`. Render these as ordinary escaped text, with source links beside reviews.
- `priceGroups`: minimum **listed offer price per currency**, with all tied IDs. Different items, portions, missing prices and currencies can prevent meaningful overall comparison.
- `largestAdvertisedDiscount`: the largest recorded percentage and tied IDs. It does not establish the biggest actual saving.
- `recommendation`: an optional `dealId`, English `label`, cited `reasons`, and full deal `caveats`. AI can select only supplied fact IDs; displayed evidence is copied from records, not free-form AI prose.
- `mode`: `gemini` for a validated AI plan, otherwise `evidence_only`. A price suggestion uses `evidence_only` because it is calculated directly.
- `message` and `warnings`: retain these limitations in the consuming app.

Map IDs must use backend deal IDs:

```ts
const mapDeals = backendDeals.map(d => ({
  id: d.dealId, restaurantName: d.restaurant.name, title: d.title,
  latitude: d.restaurant.latitude, longitude: d.restaurant.longitude,
  ...(d.price === null ? {} : { price: d.price }),
  ...(d.currency === null ? {} : { currency: d.currency }),
}));
// Collect two to five mapDeal.id values in your existing app's selection state.
// Send them to your own server route; the server calls the workflow comparison API.
// Use result.recommendation?.dealId as DealMap's controlled selectedId to highlight it.
```

The map package does not call Gemini or store provider credentials. This backend integrates with your teammate's existing UI and map selection.

## Configuration and validation

Set `GEMINI_API_KEY` on the existing Convex deployment. Optional `GEMINI_COMPARISON_MODEL` overrides `GEMINI_MODEL` for comparison; otherwise the adapter uses the existing `gemini-2.5-flash` default. Run your normal `convex dev`/deployment to register `compare.ts` and the HTTP route. Without a key, the API returns recorded evidence, and taste/value AI recommendations remain unavailable. No cloud deployment is performed by local checks.

```powershell
cd ai-workflow
npm.cmd run typecheck
npm.cmd test
npx.cmd tsx scripts/demo-comparison.ts
```

The demo uses fictional records and a mocked Gemini response. Automated checks cover missing prices, mixed currencies, restrictions, expiry, invalid evidence, taste-first abstention, authentication, quotas and the structured Gemini request. Live provider quality and real review provenance require actual data and deployment credentials.
