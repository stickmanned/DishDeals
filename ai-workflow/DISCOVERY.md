# Restaurant search fallback

`POST /v1/search` and Convex `api.search.find` search published, unexpired stored offers first. If no offer matches, the backend uses Gemini with **Google Search grounding** to look for the requested restaurant on the web. This is a live search tool call, rather than an answer from model memory.

Existing stored results keep their response shape and skip discovery. A focused `/v1/deals/pitch` never switches to another web restaurant. Missing location/currency and unsupported hard requirements still require clarification before searching; discovery does not relax these checks.

## Configuration

Set `GEMINI_API_KEY` in the Convex server environment. Existing intent and ranking use `GEMINI_SEARCH_MODEL` or `GEMINI_MODEL`. Optional `GEMINI_DISCOVERY_MODEL` selects the grounding model; otherwise it follows the search model, defaulting to `gemini-2.5-flash`. The chosen model must support Google Search grounding.

`GEOAPIFY_API_KEY` enables independent branch verification for map pins. Without it, sourced restaurant leads still appear in the API with Google Maps search links, but have `place: null` and no map pin. Keys remain on the backend. No keys are needed for local mocked tests or the existing offline demo.

An empty stored search can make three Gemini calls: intent, grounded search, then structured restaurant extraction. Up to five branches may additionally be verified through Geoapify. All calls share a 110-second deadline and the existing 60-searches-per-hour owner limit. The teammate HTTP client allows 120 seconds for search.

## Request and response

```json
{
  "query": "Example Bistro",
  "city": "Richmond",
  "language": "en",
  "limit": 3
}
```

Use `language: "en"` for English stored-offer recommendations. New web discovery text is always English. The existing language option for stored recommendations remains compatible.

When grounded information is found, the response has:

- `mode: "gemini"`, `scope: "web_restaurants"`.
- `recommendations: []`, `totalMatches: 0`: no stored offers matched; these fields never count web restaurants as confirmed deals.
- `discovery.status`: `found`, `empty`, `unavailable` (no key), or `failed` (provider/validation failure).
- `discovery.summary`, `sources`, and `citations`: the grounded answer, public HTTPS source links, and supported text passages with their source IDs.
- `discovery.restaurants`: extracted identities with a cited `evidence` passage, `sourceIds`, address/city where available, caveats, and a Maps CTA.
- `discovery.searchSuggestionsHtml`: the provider's search suggestions, preserved for the host application to display according to Google's grounding requirements.
- `place` and `distanceKm`: present only after an unambiguous name/address/city match with Geoapify; otherwise null.

Discovery failures return HTTP 200 with an explanatory message and empty discovery data. Invalid input/authentication/rate limits retain their existing error responses. Raw provider errors and keys are never returned.

## Teammate integration

```tsx
import { searchResultToMapDeals } from "../src/search-map";

const result = await client.search({
  query, city: "Richmond", language: "en", limit: 3,
});
const mapDeals = searchResultToMapDeals(result);
// Feed mapDeals into the existing <DealMap deals={mapDeals} />.
// Render discovery.summary, citations, sources, search suggestions, and caveats
// alongside the host application's search results, including unverified leads.
```

The map adapter labels discoveries `Web discovery · No confirmed offer`, keeps stable IDs and verified coordinates, and never manufactures prices or discounts. Use restaurant caveats in the surrounding result card. Unverified leads remain available in the list with “Find on Google Maps” links.

Render summary, evidence, and titles as text, with citations/source links. `searchSuggestionsHtml` is HTML from an external provider: display it in a sandboxed iframe or a similarly isolated integration; do not put it directly into the host application's DOM. Keep the provider attribution and suggestions visible with the grounded result.

## Evidence and persistence

Gemini must return actual search queries and usable grounding citations. Unsupported identities, invented addresses/source IDs, duplicate branches, wrong cities, and unsafe links are rejected. Only cited restaurant identities are extracted. Numeric meal prices, discount percentages, ratings and claimed food quality are intentionally absent from discovery records. Budget and opening requirements are marked unverified when the web lead cannot establish them.

Web leads are not automatically inserted into Convex or published as offers. Discovery query/origin data is not separately persisted. For exact-name searches, keep the full name together; sharing one generic name word must not qualify an unrelated restaurant.

Google's references: [Search grounding](https://ai.google.dev/gemini-api/docs/google-search), [generateContent and grounding metadata](https://ai.google.dev/api/generate-content).

Validated locally with mocked Gemini and Geoapify responses. Live provider calls require your configured keys and remain unverified until connected.
