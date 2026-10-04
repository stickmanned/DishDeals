import { describe, it, expect, vi } from "vitest";
import { processDeal, liveDependencies, localDate } from "../../lib/workflow/workflow";
import { inputSchema, dealSchema } from "../../lib/workflow/contracts";
import { WorkflowError, safeError } from "../../lib/workflow/errors";
import { input, deal, place, now, modelResponse, geoResponse } from "./fixtures";

describe("deal ingestion", () => {
  it("extracts, resolves and produces a map-ready result using real provider adapters", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(modelResponse({ deals: [deal], rejectionReason: null }))
      .mockResolvedValueOnce(geoResponse([{ place_id: "city-id", country_code: "ca" }]))
      .mockResolvedValueOnce(geoResponse([{ place_id: place.placeId, name: place.name, formatted: place.address,
        lat: place.latitude, lon: place.longitude, city: "Richmond", country_code: "ca", categories: place.categories }]));
    const deps = liveDependencies({ GEMINI_API_KEY: "fake-gemini", GEOAPIFY_API_KEY: "fake-geo", WORKFLOW_PROVIDER_USAGE_AUTHORIZED: "true" }, fetcher);
    const result = await processDeal(input, { ...deps, now });
    expect(result.outcomes[0].status).toBe("ready");
    expect(result.outcomes[0].restaurant?.latitude).toBe(49.1666);
    expect(result.source.contentHash).toMatch(/^[0-9a-f]{64}$/);
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(body.generationConfig.responseJsonSchema.properties.deals).toBeDefined();
    expect(body.systemInstruction.parts[0].text).toContain("UNTRUSTED");
    expect(fetcher.mock.calls[2][0]).toContain("filter=place%3Acity-id");
  });
  it("keeps unresolved branches off the map", async () => {
    const result = await processDeal(input, { extract: async () => ({ deals: [deal], rejectionReason: null }),
      locate: async () => [place, { ...place, placeId: "second-branch", matchScore: 0.99 }], now });
    expect(result.outcomes[0].status).toBe("needs_review");
    expect(result.outcomes[0].restaurant).toBeNull();
  });
  it("rejects expired offers and evaluates expiry in the local timezone", async () => {
    expect(localDate(new Date("2026-10-04T02:00:00Z"), "America/Vancouver")).toBe("2026-10-03");
    const result = await processDeal(input, { extract: async () => ({ deals: [{ ...deal, endDate: "2026-10-02" }], rejectionReason: null }), locate: async () => [place], now });
    expect(result.outcomes[0].status).toBe("rejected");
  });
  it("reviews unknown publication dates, currencies and uncertain extraction", async () => {
    const result = await processDeal({ source: { type: "text", text: input.source.text } }, {
      extract: async () => ({ deals: [{ ...deal, price: 8, confidence: 0.6 }], rejectionReason: null }), locate: async () => [place], now });
    expect(result.outcomes[0].status).toBe("needs_review");
    expect(result.outcomes[0].reviewReasons.join(" ")).toContain("currency");
    expect(result.outcomes[0].reviewReasons.join(" ")).toContain("publication date");
  });
  it("returns no deals for unrelated text", async () => {
    const locate = vi.fn();
    const result = await processDeal(input, { extract: async () => ({ deals: [], rejectionReason: "No explicit dining offer." }), locate, now });
    expect(result.outcomes).toEqual([]); expect(locate).not.toHaveBeenCalled();
  });
  it("preserves extraction for review when the location provider fails", async () => {
    const result = await processDeal(input, { extract: async () => ({ deals: [deal], rejectionReason: null }),
      locate: async () => { throw new WorkflowError("PROVIDER_BUSY", "Geoapify busy", true); }, now });
    expect(result.outcomes[0].status).toBe("needs_review");
    expect(result.outcomes[0].reviewReasons.join(" ")).toContain("provider failed");
  });
  it("reuses one location lookup for multiple offers from the same branch", async () => {
    const locate = vi.fn(async () => [place]);
    const result = await processDeal(input, { extract: async () => ({ deals: [deal, { ...deal, title: "Free tea" }], rejectionReason: null }), locate, now });
    expect(result.outcomes).toHaveLength(2); expect(locate).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed inputs and impossible dates before calls", async () => {
    for (const url of ["http://example.com", "https://localhost", "https://127.0.0.1", "https://192.168.1.2", "https://user:secret@example.com", "https://example.com:8080"]) {
      expect(inputSchema.safeParse({ source: { type: "url", url } }).success).toBe(false);
    }
    expect(inputSchema.safeParse({ source: { type: "image", mimeType: "image/png", data: "not-base64" } }).success).toBe(false);
    expect(dealSchema.safeParse({ ...deal, endDate: "2026-02-30" }).success).toBe(false);
    expect(dealSchema.safeParse({ ...deal, startDate: "2026-11-01", endDate: "2026-10-31" }).success).toBe(false);
  });
  it("fails clearly when keys are absent and sanitizes unknown errors", () => {
    expect(() => liveDependencies({})).toThrow("GEMINI_API_KEY");
    expect(safeError(new Error("secret-api-key"))).not.toHaveProperty("message", "secret-api-key");
  });
  it("requires review when a matching name contradicts the source address", async () => {
    const result = await processDeal(input, { extract: async () => ({ deals: [deal], rejectionReason: null }),
      locate: async () => [{ ...place, address: "999 Other Street, Richmond", matchScore: 0.85 }], now });
    expect(result.outcomes[0].status).toBe("needs_review");
    expect(result.outcomes[0].reviewReasons.join(" ")).toContain("address does not match");
  });
});
