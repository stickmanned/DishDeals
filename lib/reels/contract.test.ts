import { expect, test } from "vitest";
import { normalizeInstagramUrl, toCanonical, validateExtraction } from "./contract";
const draft = { restaurant: null, address: null, dealText: "$8 meal", price: 8, currency: null, validDays: null, validStart: null, validEnd: null, expiresOn: null, conditions: null };
const output = { isDeal: true, drafts: [draft], evidence: [
  { draftIndex: 0, field: "dealText", channel: "audio", quote: "$8 meal", timestampSeconds: 3 },
  { draftIndex: 0, field: "price", channel: "visual", quote: "$8", timestampSeconds: 4 },
], transcript: "$8 meal", warnings: ["Currency unknown"] };
test("normalizes shared prose and rejects ambiguous or unsafe targets", () => {
  expect(normalizeInstagramUrl("Have a look https://m.instagram.com/p/AbCdEf123/?igsh=123")).toBe("https://www.instagram.com/reel/AbCdEf123/");
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
