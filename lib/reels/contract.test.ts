import { expect, test } from "vitest";
import { buildReelExtractionRequest, instagramSourceKind, normalizeInstagramUrl, runReelExtraction, toCanonical, validateExtraction } from "./contract";
import type { NativeContext } from "./nativeContext";
const draft = { restaurant: null, address: null, dealText: "$8 meal", price: 8, currency: null, validDays: null, validStart: null, validEnd: null, expiresOn: null, conditions: null };
const output = { isDeal: true, drafts: [draft], evidence: [
  { draftIndex: 0, field: "dealText", channel: "audio", quote: "$8 meal", timestampSeconds: 3 },
  { draftIndex: 0, field: "price", channel: "visual", quote: "$8", timestampSeconds: 4 },
], transcript: "$8 meal", warnings: ["Currency unknown"] };
test("normalizes shared prose and rejects ambiguous or unsafe targets", () => {
  expect(normalizeInstagramUrl("Have a look https://m.instagram.com/p/AbCdEf123/?igsh=123")).toBe("https://www.instagram.com/p/AbCdEf123/");
  expect(normalizeInstagramUrl("https://instagram.com/reels/AbCdEf123/")).toBe("https://www.instagram.com/reel/AbCdEf123/");
  expect(normalizeInstagramUrl("https://instagram.com/reel/AbCdEf123/")).toBe("https://www.instagram.com/reel/AbCdEf123/");
  expect(instagramSourceKind("https://www.instagram.com/p/AbCdEf123/")).toBe("post");
  expect(instagramSourceKind("https://www.instagram.com/reel/AbCdEf123/")).toBe("reel");
  expect(instagramSourceKind("https://www.instagram.com/reels/AbCdEf123/")).toBe("reel");
  expect(instagramSourceKind("https://example.com")).toBe("unknown");
  expect(instagramSourceKind("https://user:pass@instagram.com/reel/AbCdEf123/")).toBe("unknown");
  expect(instagramSourceKind("https://instagram.com:8080/p/AbCdEf123/")).toBe("unknown");
  expect(instagramSourceKind("http://instagram.com/p/AbCdEf123/")).toBe("unknown");
  expect(instagramSourceKind("https://evil.com/?q=/p/AbCdEf123/")).toBe("unknown");
  expect(instagramSourceKind("https://instagram.com.evil/reel/AbCdEf123/")).toBe("unknown");
  expect(instagramSourceKind(null)).toBe("unknown");
  expect(instagramSourceKind(undefined)).toBe("unknown");
  for (const url of ["https://instagram.com.evil/reel/AbCdEf123/", "http://instagram.com/reel/AbCdEf123/", "https://user:pass@instagram.com/reel/AbCdEf123/", "https://instagram.com/share/reel/x", "https://localhost/reel/AbCdEf123/", "https://instagram.com/reel/AbCdEf123/ https://evil.com/"]) expect(() => normalizeInstagramUrl(url)).toThrow();
});
test("keeps unknown fields and non-CAD currency without invented canonical prices", () => {
  expect(validateExtraction(output, "", 12).drafts[0].validDays).toBeNull();
  expect(() => toCanonical(draft)).toThrow("Review unknown");
  expect(toCanonical({ ...draft, restaurant: "Cafe", validDays: [], conditions: [], currency: "USD" }).deals[0].priceCad).toBeNull();
});
test("rejects unsupported facts, invalid schedules/dates, contradictory offers and evidence", () => {
  for (const change of [{ price: -1 }, { currency: "dollars" }, { validStart: "25:99" }, { expiresOn: "2026-02-30" }, { restaurant: "Made up" }])
    expect(() => validateExtraction({ ...output, drafts: [{ ...draft, ...change }] }, "", 12)).toThrow();
  expect(() => validateExtraction({ ...output, isDeal: false }, "", 12)).toThrow();
  expect(() => validateExtraction({ ...output, evidence: [{ ...output.evidence[0], timestampSeconds: 99 }] }, "", 12)).toThrow();
  expect(() => validateExtraction({ ...output, evidence: [{ ...output.evidence[0], channel: "caption" }] }, "different caption", 12)).toThrow();
});
test("typed source constraints need source-supported evidence and an ISO start date (synthetic)", () => {
  const caption = "Starts June 15, 2026 for members";
  const constraint = { draftIndex: 0, code: "FUTURE_START", detail: "Starts June 15", startsOn: "2026-06-15", channel: "caption", quote: "Starts June 15, 2026", timestampSeconds: null };
  expect(validateExtraction({ ...output, constraints: [constraint] }, caption, 12).constraints).toHaveLength(1);
  expect(validateExtraction({ ...output }, caption, 12).constraints).toBeUndefined();
  for (const bad of [{ draftIndex: 1 }, { startsOn: null }, { startsOn: "2026-13-01" }, { code: "OTHER" }, { quote: "Starts next week" }, { channel: "visual" }, { quote: "Starts June 15", startsOn: "2026-06-15" }])
    expect(() => validateExtraction({ ...output, constraints: [{ ...constraint, ...bad }] }, caption, 12)).toThrow();
});
// ---- Native supplied text (N-SOURCE-D). Synthetic fragments, labeled mock transport; no model or network. ----
const fragments = ["Cafe Aroma lunch special", "$8 bowl, Mon to Fri 11:00-14:00"];
const suppliedContext: NativeContext = { version: 1, textFragments: fragments, registeredTypes: ["public.url"], receivedAt: 1790000000, truncated: false };
const captionDraft = { ...draft, restaurant: "Cafe Aroma", dealText: "$8 bowl" };
const captionOutput = (quote: string, channel = "caption") => ({ isDeal: true, drafts: [captionDraft], transcript: "", warnings: [], evidence: [
  { draftIndex: 0, field: "restaurant", channel, quote, timestampSeconds: null }, { draftIndex: 0, field: "dealText", channel, quote: "$8 bowl", timestampSeconds: null },
  { draftIndex: 0, field: "price", channel, quote: "$8", timestampSeconds: null }] });
test("a caption quote may be a substring of ONE supplied fragment or of the editable caption", () => {
  expect(validateExtraction(captionOutput("Cafe Aroma"), "", 12, fragments).drafts).toHaveLength(1);
  expect(validateExtraction(captionOutput("Cafe Aroma"), "Cafe Aroma $8 bowl", 12).drafts).toHaveLength(1);
  // All accessible fragments count, not just the first.
  expect(validateExtraction({ ...captionOutput("Cafe Aroma"), evidence: captionOutput("Cafe Aroma").evidence.map(e => ({ ...e, quote: "Mon to Fri" })) }, "", 12, fragments).evidence).toHaveLength(3);
});
test("a quote joined across two fragments, or across a fragment and the caption, is not source evidence", () => {
  expect(() => validateExtraction(captionOutput("Cafe Aroma lunch special $8 bowl"), "", 12, fragments)).toThrow("not in the source");
  expect(() => validateExtraction(captionOutput("Cafe Aroma lunch special\n$8 bowl"), "", 12, fragments)).toThrow("not in the source");
  expect(() => validateExtraction(captionOutput("special my caption"), "my caption", 12, fragments)).toThrow("not in the source");
});
test("supplied text never validates audio or visual quotes, nor constraint or caption quotes absent from every source", () => {
  expect(() => validateExtraction(captionOutput("Cafe Aroma", "audio"), "", 12, fragments)).toThrow("not in the transcript");
  expect(() => validateExtraction(captionOutput("Nowhere Bistro"), "", 12, fragments)).toThrow("not in the source");
  const constraint = { draftIndex: 0, code: "FUTURE_START", detail: "starts later", startsOn: "2026-06-15", channel: "caption", quote: "Starts June 15, 2026", timestampSeconds: null };
  expect(() => validateExtraction({ ...captionOutput("Cafe Aroma"), constraints: [constraint] }, "", 12, fragments)).toThrow();
  const withFragment = ["Starts June 15, 2026 for members"];
  expect(validateExtraction({ ...captionOutput("Cafe Aroma"), evidence: captionOutput("Cafe Aroma").evidence.map(e => ({ ...e, quote: "Starts June 15, 2026" })), constraints: [constraint] }, "", 12, withFragment).constraints).toHaveLength(1);
});
test("the model request carries the supplied text as its own labeled part, separate from the editable caption", () => {
  const base = { model: "m", mimeType: "video/mp4", videoBase64: "AAAA", caption: "Manual caption", publishedAt: "2026-09-01", duration: 12, supplied: { sourceUrl: "https://www.instagram.com/reel/AbCdE12345/" } };
  const withContext = buildReelExtractionRequest({ ...base, nativeContext: suppliedContext }).contents[0].parts;
  expect(withContext).toHaveLength(3);
  expect(JSON.parse((withContext[1] as { text: string }).text)).toMatchObject({ caption: "Manual caption", publishedAt: "2026-09-01" });
  const source = JSON.parse((withContext[2] as { text: string }).text);
  expect(source.nativeSuppliedSource).toMatchObject({ complete: true, textFragments: fragments });
  expect(JSON.stringify(withContext)).not.toContain("1790000000"); // receipt clock is never a date anchor
  expect(JSON.stringify(withContext)).not.toContain("public.url"); // offered types are not source content
  expect(JSON.stringify(withContext[1])).not.toContain("Cafe Aroma"); // fragments are never flattened into the caption part
  // Old context-less requests are byte-identical in shape: video + one text part.
  expect(buildReelExtractionRequest(base).contents[0].parts).toHaveLength(2);
  expect(buildReelExtractionRequest({ ...base, nativeContext: null }).contents[0].parts).toHaveLength(2);
});
test("extraction validates evidence against every supplied fragment, and rejects a fabricated join, through the model transport", async () => {
  const input = { model: "m", mimeType: "video/mp4", videoBase64: "AAAA", caption: "", publishedAt: null, duration: 12, nativeContext: suppliedContext };
  const transport = (output: unknown) => ({ models: { generateContent: async () => ({ candidates: [{ finishReason: "STOP" }], text: JSON.stringify(output) }) } });
  expect((await runReelExtraction(transport(captionOutput("Cafe Aroma")), input, 12)).drafts).toHaveLength(1);
  await expect(runReelExtraction(transport(captionOutput("Cafe Aroma lunch special $8 bowl")), input, 12)).rejects.toThrow("not in the source");
});
