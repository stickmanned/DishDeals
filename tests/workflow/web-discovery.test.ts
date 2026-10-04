import { it, expect, vi } from "vitest";
import { discoverWeb, supplementEmptySearch } from "../../lib/workflow/web-discovery";
import { searchInputSchema } from "../../lib/workflow/search-contracts";
import { searchDeals } from "../../lib/workflow/search";

export const groundedResponse = () => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "No current offer could be verified. Check the restaurant's official page." }] },
  groundingMetadata: { webSearchQueries: ["Haidilao Vancouver official"],
    groundingChunks: [{ web: { uri: "https://www.haidilao.com/", title: "Haidilao" } }, { web: { uri: "https://uncited.example/", title: "Not cited" } }],
    groundingSupports: [{ groundingChunkIndices: [0] }], searchEntryPoint: { renderedContent: '<div><a href="https://www.google.com/search?q=haidilao">Search suggestions</a></div>' } } }] });
const input = searchInputSchema.parse({ query: "海底捞", language: "en" });
it("requires actual Google Search grounding and returns only cited public sources without inventing an offer", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(groundedResponse());
  const result = await discoverWeb(input, { apiKey: "private-key", model: "primary", fetcher });
  const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
  expect(body.tools).toEqual([{ google_search: {} }]);
  expect(body.contents[0].parts[0].text).toContain("海底捞");
  expect(result.sources).toEqual([{ url: "https://www.haidilao.com/", title: "Haidilao" }]);
  expect(result.text).toContain("No current offer");
  expect(result.searchSuggestionsHtml).toContain("Search suggestions");
  expect(JSON.stringify(result)).not.toContain("private-key");
});
it.each([
  { content: { parts: [{ text: "I remember a discount" }] } },
  { content: { parts: [{ text: "Claim" }] }, groundingMetadata: { webSearchQueries: ["q"], groundingChunks: [{ web: { uri: "http://127.0.0.1/" } }], groundingSupports: [{ groundingChunkIndices: [0] }], searchEntryPoint: { renderedContent: "suggestions" } } },
  { content: { parts: [{ text: "Claim" }] }, groundingMetadata: { webSearchQueries: ["q"], groundingChunks: [{ web: { uri: "https://example.com/" } }], groundingSupports: [{ groundingChunkIndices: [0] }] } },
])("rejects memory-only answers, unsafe sources, and missing mandatory search suggestions", async candidate => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ candidates: [{ finishReason: "STOP", ...candidate }] }));
  await expect(discoverWeb(input, { apiKey: "test", model: "primary", fetcher })).rejects.toMatchObject({ code: "UNVERIFIED_WEB_SEARCH" });
});
it("skips online search for stored results, detail pitches and missing required filters", async () => {
  const fetcher = vi.fn<typeof fetch>();
  const base = await searchDeals(input, { records: [] });
  for (const [result, query] of [
    [{ ...base, recommendations: [{}] }, input],
    [base, { ...input, focusDealId: "specific" }],
    [{ ...base, intent: { ...base.intent, maxPrice: 10 } }, input],
    [{ ...base, intent: { ...base.intent, requiresOrigin: true } }, input],
  ] as const) await supplementEmptySearch(result as typeof base, query, { apiKey: "test", model: "primary", fetcher }, new Date());
  expect(fetcher).not.toHaveBeenCalled();
});
it("returns a clear failure rather than ungrounded or sensitive provider output", async () => {
  const base = await searchDeals(input, { records: [] });
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("private-key and source content", { status: 403 }));
  const result = await supplementEmptySearch(base, input, { apiKey: "private-key", model: "primary", fetcher }, new Date());
  expect(result.webDiscovery).toBeUndefined();
  expect(result.warnings.join(" ")).toContain("could not verify online");
  expect(JSON.stringify(result)).not.toContain("private-key");
});
