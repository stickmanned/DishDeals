import { it, expect, vi } from "vitest";
import { extractWithGemini } from "../src/gemini";
import { findRestaurant } from "../src/geoapify";
import { inputSchema } from "../src/contracts";
import { fetchJson } from "../src/network";
import { input, deal, modelResponse, geoResponse } from "./fixtures";

it("sends images through inlineData and checks output schema", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(modelResponse({ deals: [deal], rejectionReason: null }));
  await extractWithGemini(inputSchema.parse({ source: { type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" } }), { apiKey: "test", model: "gemini-2.5-flash", fetcher });
  const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
  expect(body.contents[0].parts[1].inlineData).toEqual({ mimeType: "image/png", data: "iVBORw0KGgo=" });
});
it("does not hallucinate content from an inaccessible URL", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ candidates: [{ finishReason: "STOP",
    content: { parts: [{ text: "Probably a promotion" }] }, urlContextMetadata: { urlMetadata: [{ retrievedUrl: "https://example.com", urlRetrievalStatus: "URL_RETRIEVAL_STATUS_PAYWALL" }] } }] }));
  await expect(extractWithGemini(inputSchema.parse({ source: { type: "url", url: "https://example.com" } }), { apiKey: "test", model: "gemini-2.5-flash", fetcher })).rejects.toMatchObject({ code: "SOURCE_UNREADABLE" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("retrieves URLs before structured extraction and never fetches the submitted URL locally", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: "STOP",
    content: { parts: [{ text: input.source.text }] }, urlContextMetadata: { urlMetadata: [{ retrievedUrl: "https://example.com/deal", urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" }] } }] }))
    .mockResolvedValueOnce(modelResponse({ deals: [deal], rejectionReason: null }));
  const result = await extractWithGemini(inputSchema.parse({ source: { type: "url", url: "https://example.com/deal" } }), { apiKey: "test", model: "gemini-2.5-flash", fetcher });
  expect(result.deals).toHaveLength(1);
  expect(fetcher.mock.calls.every(([url]) => String(url).startsWith("https://generativelanguage.googleapis.com/"))).toBe(true);
});
it("falls back on invalid model JSON but never on a key error", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(modelResponse({ wrong: true })).mockResolvedValueOnce(modelResponse({ deals: [deal], rejectionReason: null }));
  await extractWithGemini(inputSchema.parse(input), { apiKey: "test", model: "primary", fallbackModel: "fallback", fetcher });
  expect(fetcher.mock.calls[1][0]).toContain("/fallback:generateContent");
  const denied = vi.fn<typeof fetch>().mockResolvedValue(new Response("sensitive provider text", { status: 403 }));
  await expect(extractWithGemini(inputSchema.parse(input), { apiKey: "test", model: "primary", fallbackModel: "fallback", fetcher: denied })).rejects.toMatchObject({ code: "PROVIDER_AUTH" });
  expect(denied).toHaveBeenCalledTimes(1);
});
it("flags invented evidence for manual review", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(modelResponse({ deals: [{ ...deal, evidence: "Everything is free!" }], rejectionReason: null }));
  const result = await extractWithGemini(inputSchema.parse(input), { apiKey: "test", model: "primary", fetcher });
  expect(result.deals[0].warnings.join(" ")).toContain("verbatim");
});
it("ignores country mismatches, missing coordinates, and city centroids", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(geoResponse([{ place_id: "city", country_code: "ca" }]))
    .mockResolvedValueOnce(geoResponse([
      { place_id: "city", name: "Example Ramen", country_code: "ca", formatted: "Richmond", lat: 49, lon: -123, categories: ["administrative"] },
      { place_id: "us", name: "Example Ramen", country_code: "us", formatted: "USA", lat: 49, lon: -123, categories: ["catering.restaurant"] },
      { place_id: "no-coordinates", name: "Example Ramen", country_code: "ca", formatted: "Richmond", categories: ["catering.restaurant"] },
    ]));
  expect(await findRestaurant(deal, inputSchema.parse(input), { apiKey: "test", fetcher })).toEqual([]);
});
it("retries transient failures with a bound", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("busy", { status: 429 })).mockResolvedValueOnce(Response.json({ ok: true }));
  expect(await fetchJson("https://example.com", {}, "Test", fetcher)).toEqual({ ok: true });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("never starts a provider call after the workflow budget is exhausted", async () => {
  const fetcher = vi.fn<typeof fetch>();
  await expect(fetchJson("https://example.com", {}, "Test", fetcher, { deadline: Date.now() - 1 })).rejects.toMatchObject({ code: "WORKFLOW_TIMEOUT" });
  expect(fetcher).not.toHaveBeenCalled();
});
it("rejects successful URL metadata for a different source", async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ candidates: [{ finishReason: "STOP",
    content: { parts: [{ text: input.source.text }] }, urlContextMetadata: { urlMetadata: [{ retrievedUrl: "https://unrelated.example/offers", urlRetrievalStatus: "URL_RETRIEVAL_STATUS_SUCCESS" }] } }] }));
  await expect(extractWithGemini(inputSchema.parse({ source: { type: "url", url: "https://example.com/deal" } }), { apiKey: "test", model: "primary", fetcher })).rejects.toMatchObject({ code: "SOURCE_UNREADABLE" });
});
