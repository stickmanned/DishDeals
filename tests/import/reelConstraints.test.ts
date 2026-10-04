// N-SOURCE-C: typed source constraints. Everything here is SYNTHETIC: fixtures are invented text,
// the model SDK is a labeled in-memory transport, and nothing is a real video, live Gemini output,
// network call or phone check. Visual quotes are only structurally validated; none of this proves
// what a real video shows.
import { describe, expect, it, vi } from "vitest";
import {
  buildReelExtractionRequest,
  quoteSupportsDate,
  reelExtraction,
  reelExtractionResponse,
  runReelExtraction,
  validateExtraction,
  REEL_SYSTEM_INSTRUCTION,
  type ReelExtractionInput,
  type ReelModelTransport,
} from "../../lib/reels/contract";
import {
  LEGACY_CONSTRAINT_REVIEW_DETAIL,
  REEL_EXTRACTION_CONTRACT_GAPS,
  reelExtractionToDealDrafts,
} from "../../lib/reels/toDealDraft";
import { buildPublishFields, dealDraftReducer, DraftValidationError, validateForPublish, type DealDraft } from "../../lib/dealDraft";

const CAPTION = "Ramen Danbo, 1333 Robson St. Gyoza combo $12.50 CAD weekdays 11:00-15:00 until 2026-12-31 dine-in only. Starts June 15, 2026. Members only.";
const TRANSCRIPT = "Starting next Monday we have the lunch deal, limited to members";
const DURATION = 30;

const draft = {
  restaurant: "Ramen Danbo", address: "1333 Robson St", dealText: "Gyoza combo", price: 12.5, currency: "CAD",
  validDays: ["mon", "tue", "wed", "thu", "fri"], validStart: "11:00", validEnd: "15:00", expiresOn: "2026-12-31", conditions: ["dine-in only"],
};
const field = (name: string, quote = "Ramen Danbo") => ({ draftIndex: 0, field: name, channel: "caption", quote, timestampSeconds: null });
const evidence = ["restaurant", "address", "dealText", "price", "currency", "validDays", "hours", "expiresOn", "conditions"].map(f => field(f));
const futureStart = { draftIndex: 0, code: "FUTURE_START", detail: "Deal starts June 15, 2026", startsOn: "2026-06-15", channel: "caption", quote: "Starts June 15, 2026", timestampSeconds: null };
const unsupported = { draftIndex: 0, code: "UNSUPPORTED_CONSTRAINT", detail: "Members only", startsOn: null, channel: "caption", quote: "Members only", timestampSeconds: null };
const base = (over: Record<string, unknown> = {}) => ({ isDeal: true, drafts: [draft], evidence, transcript: TRANSCRIPT, warnings: [], constraints: [], ...over });
const parse = (raw: unknown, caption = CAPTION) => validateExtraction(raw, caption, DURATION);

function publishReady(d: DealDraft): DealDraft {
  d = dealDraftReducer(d, { type: "ACCEPT_ALL_SUGGESTIONS" });
  return dealDraftReducer(d, { type: "CONFIRM_LOCATION", lat: 49.2827, lng: -123.1207 });
}
const resolveAll = (d: DealDraft, note = "Checked the source against the video") =>
  d.reviewIssues.reduce((acc, i) => dealDraftReducer(acc, { type: "RESOLVE_REVIEW_ISSUE", issueId: i.id, resolutionNote: note }), d);

describe("constraint parsing and source evidence (actual validateExtraction)", () => {
  it("accepts source-supported caption, audio and visual constraints and an explicit empty array", () => {
    expect(parse(base()).constraints).toEqual([]);
    const result = parse(base({ constraints: [
      futureStart,
      { ...unsupported, channel: "audio", quote: "limited to members", timestampSeconds: 12 },
      { ...unsupported, channel: "visual", quote: "MEMBERS ONLY sign", timestampSeconds: DURATION },
    ] }));
    expect(result.constraints).toHaveLength(3);
  });

  it("keeps parsing stored/legacy output that has no constraints array (absence is preserved, not filled in)", () => {
    const legacy = { isDeal: true, drafts: [draft], evidence, transcript: TRANSCRIPT, warnings: [] };
    expect(parse(legacy).constraints).toBeUndefined();
    expect(reelExtractionResponse.safeParse(legacy).success).toBe(false);
  });

  it.each([
    ["draft index past the drafts", { ...unsupported, draftIndex: 1 }],
    ["draft index out of range", { ...unsupported, draftIndex: 10 }],
    ["negative draft index", { ...unsupported, draftIndex: -1 }],
    ["unsupported code", { ...unsupported, code: "PAST_START" }],
    ["lowercase code", { ...unsupported, code: "future_start" }],
    ["malformed start date", { ...futureStart, startsOn: "2026-02-30" }],
    ["non-ISO start date", { ...futureStart, startsOn: "June 15, 2026" }],
    ["FUTURE_START without a date", { ...futureStart, startsOn: null }],
    ["UNSUPPORTED_CONSTRAINT carrying a date", { ...unsupported, startsOn: "2026-06-15" }],
    ["unknown channel", { ...unsupported, channel: "meta" }],
    ["absent quote", { ...unsupported, quote: undefined }],
    ["blank quote", { ...unsupported, quote: "   " }],
    ["oversized quote", { ...unsupported, quote: "x".repeat(1001) }],
    ["oversized detail", { ...unsupported, detail: "x".repeat(501) }],
    ["negative timestamp", { ...unsupported, channel: "visual", timestampSeconds: -1 }],
    ["non-finite timestamp", { ...unsupported, channel: "visual", timestampSeconds: Infinity }],
    ["extra property (a confidence score)", { ...unsupported, confidence: 0.9 }],
  ])("rejects %s", (_name, constraint) => {
    expect(() => parse(base({ constraints: [constraint] }))).toThrow();
  });

  it("rejects too many constraints and a non-array value", () => {
    expect(() => parse(base({ constraints: Array.from({ length: 21 }, () => unsupported) }))).toThrow();
    expect(parse(base({ constraints: Array.from({ length: 20 }, () => unsupported) })).constraints).toHaveLength(20);
    expect(() => parse(base({ constraints: "Members only" }))).toThrow();
    expect(() => parse(base({ constraints: null }))).toThrow();
  });

  it("rejects evidence that is not in the supplied caption, transcript or video duration", () => {
    expect(() => parse(base({ constraints: [{ ...unsupported, quote: "Students only" }] }))).toThrow("Caption constraint evidence is not in the source");
    expect(() => parse(base({ constraints: [{ ...unsupported, channel: "audio", quote: "members only", timestampSeconds: 5 }] }))).toThrow("Audio constraint evidence is not in the transcript");
    expect(() => parse(base({ constraints: [{ ...unsupported, channel: "audio", quote: "limited to members", timestampSeconds: null }] }))).toThrow("timestamp");
    expect(() => parse(base({ constraints: [{ ...unsupported, channel: "audio", quote: "limited to members", timestampSeconds: DURATION + 1 }] }))).toThrow("timestamp");
    expect(() => parse(base({ constraints: [{ ...unsupported, channel: "visual", timestampSeconds: null }] }))).toThrow("timestamp");
    expect(() => parse(base({ constraints: [{ ...unsupported, channel: "visual", timestampSeconds: DURATION + 0.5 }] }))).toThrow("timestamp");
  });

  it("rejects a future start that the quote does not literally state (no invented calendar date)", () => {
    // Relative date, no anchor in the quote: the model must say UNSUPPORTED_CONSTRAINT instead.
    const relative = { ...futureStart, channel: "audio", quote: "Starting next Monday", timestampSeconds: 2, startsOn: "2026-06-15" };
    expect(() => parse(base({ constraints: [relative] }))).toThrow("does not literally state the start date");
    expect(() => parse(base({ constraints: [{ ...futureStart, startsOn: "2026-06-16" }] }))).toThrow("does not literally state");
    expect(() => parse(base({ constraints: [{ ...futureStart, startsOn: "2027-06-15" }] }))).toThrow("does not literally state");
    // A year the quote never states is not promoted to an exact startsOn, with or without a publication date.
    const yearless = { ...futureStart, quote: "Starts June 15", startsOn: "2026-06-15" };
    expect(() => parse(base({ constraints: [yearless] }), "Ramen Danbo. Starts June 15 for members")).toThrow("does not literally state");
    expect(() => parse(base({ constraints: [{ ...futureStart, quote: "Starts June 15, 2025" }] }), "Ramen Danbo. Starts June 15, 2025")).toThrow("does not literally state");
    // Ambiguous numeric MDY/DMY dates are rejected for either reading.
    const numeric = (startsOn: string) => ({ ...futureStart, quote: "starts 06/07/2026", startsOn });
    for (const iso of ["2026-06-07", "2026-07-06"]) expect(() => parse(base({ constraints: [numeric(iso)] }), "Ramen Danbo. starts 06/07/2026")).toThrow("does not literally state");
    // A full unambiguous numeric date is fine, and so is the same quote kept as an unresolved constraint.
    expect(parse(base({ constraints: [{ ...futureStart, quote: "starts 06/15/2026" }] }), "Ramen Danbo. starts 06/15/2026").constraints).toHaveLength(1);
    expect(parse(base({ constraints: [{ ...unsupported, detail: "Starts June 15 (year not stated)", quote: "Starts June 15" }] }), "Ramen Danbo. Starts June 15 for members").constraints).toHaveLength(1);
    // The same relative statement is accepted as an unresolved, date-less constraint.
    expect(parse(base({ constraints: [{ ...unsupported, detail: "Starts next Monday (date unknown)", channel: "audio", quote: "Starting next Monday", timestampSeconds: 2 }] })).constraints).toHaveLength(1);
  });

  it("applies the existing field-evidence rules unchanged", () => {
    expect(() => parse(base({ evidence: evidence.slice(1) }))).toThrow("Missing evidence");
    expect(() => parse(base({ isDeal: false }))).toThrow();
    expect(() => parse(base({ constraints: [unsupported], drafts: [], isDeal: false, evidence: [] }))).toThrow();
  });
});

describe("quoteSupportsDate (complete, unambiguous dates only)", () => {
  it.each([
    ["Starts June 15, 2026", "2026-06-15", true],
    ["begins on 15th of June 2026", "2026-06-15", true],
    ["from Jun. 15 2026", "2026-06-15", true],
    ["15 JUNE, 2026", "2026-06-15", true],
    ["Sept 3, 2026", "2026-09-03", true],
    ["starts 2026-06-15", "2026-06-15", true],
    ["starts 06/15/2026", "2026-06-15", true],
    ["starts 15/06/2026", "2026-06-15", true],
    ["starts 6.6.2026", "2026-06-06", true],
    // missing year: never promoted to a calendar date, even though a publication date could suggest one
    ["Starts June 15", "2026-06-15", false],
    ["Starts 15 June", "2026-06-15", false],
    ["starts 06/15", "2026-06-15", false],
    ["starts 6-5", "2026-06-05", false],
    ["Sept 3", "2026-09-03", false],
    // fabricated or conflicting year/day/month
    ["Starts June 15, 2025", "2026-06-15", false],
    ["Starts June 15, 2026", "2027-06-15", false],
    ["Starts June 150, 2026", "2026-06-15", false],
    ["Starts June 1, 2026", "2026-06-15", false],
    ["Starts July 15, 2026", "2026-06-15", false],
    ["starts 2026-06-15", "2026-06-16", false],
    ["starts 12026-06-15", "2026-06-15", false],
    // ambiguous numeric order: both month/day readings are calendar-valid
    ["starts 06/07/2026", "2026-06-07", false],
    ["starts 06/07/2026", "2026-07-06", false],
    ["starts 03-04-2026", "2026-03-04", false],
    ["starts 06/15/2026", "2026-06-16", false],
    // relative or unrelated
    ["starts next Monday", "2026-06-15", false],
    ["Starts tomorrow", "2026-06-15", false],
    ["call 604 555 1215", "2026-06-15", false],
    ["Starts Marching on 15, 2026", "2026-03-15", false],
  ])("%s -> %s is %s", (quote, iso, expected) => expect(quoteSupportsDate(quote, iso)).toBe(expected));
});

describe("model request and transport (labeled synthetic SDK transport)", () => {
  const input: ReelExtractionInput = { model: "synthetic-model", mimeType: "video/mp4", videoBase64: "U1lOVEhFVElD", caption: CAPTION, publishedAt: "2026-06-01T17:00:00.000Z", duration: DURATION };
  const transport = (text: string | undefined, finishReason = "STOP") => {
    const generateContent = vi.fn().mockResolvedValue({ candidates: [{ finishReason }], text });
    return { generateContent, transport: { models: { generateContent } } as ReelModelTransport };
  };

  it("sends the video, caption, publication date and timezone, with a schema that REQUIRES constraints", () => {
    const request = buildReelExtractionRequest(input);
    expect(request.model).toBe("synthetic-model");
    const [video, text] = request.contents[0].parts;
    expect(video).toEqual({ inlineData: { mimeType: "video/mp4", data: "U1lOVEhFVElD" } });
    expect(JSON.parse((text as { text: string }).text)).toEqual({ caption: CAPTION, publishedAt: "2026-06-01T17:00:00.000Z", timezone: "America/Vancouver" });
    const schema = request.config.responseJsonSchema as { required: string[]; properties: Record<string, { maxItems?: number; items?: { properties: Record<string, unknown>; required: string[]; additionalProperties: boolean } }> };
    expect(schema.required).toContain("constraints");
    expect(schema.properties.constraints.maxItems).toBe(20);
    expect(Object.keys(schema.properties.constraints.items!.properties).sort()).toEqual(["channel", "code", "detail", "draftIndex", "quote", "startsOn", "timestampSeconds"]);
    expect(schema.properties.constraints.items!.additionalProperties).toBe(false);
    expect(request.config).toMatchObject({ temperature: 0, responseMimeType: "application/json" });
  });

  it("supplied recordings add provenance only and never ask to fetch the link", () => {
    const request = buildReelExtractionRequest({ ...input, supplied: { sourceUrl: "https://www.instagram.com/reel/AbCdEf123/" } });
    const context = JSON.parse((request.contents[0].parts[1] as { text: string }).text);
    expect(context).toMatchObject({ sourceUrl: "https://www.instagram.com/reel/AbCdEf123/", durationSecondsBrowserSupplied: DURATION });
    expect(context.sourceUrlNote).toContain("never fetch");
  });

  it("instructs the model on constraints without asking for scores or invented dates", () => {
    for (const phrase of ["ALWAYS return the constraints array", "FUTURE_START", "UNSUPPORTED_CONSTRAINT", "never infer or guess a year or date", "including the four-digit year", "ambiguous numeric date", "even if a publication date was supplied", "exact transcript substrings", "not confidence or probability", "leave the field null"])
      expect(REEL_SYSTEM_INSTRUCTION).toContain(phrase);
    expect(REEL_SYSTEM_INSTRUCTION).toContain("Confidence is not requested");
  });

  it("returns a validated extraction from a source-supported response", async () => {
    const { generateContent, transport: t } = transport(JSON.stringify(base({ constraints: [futureStart, unsupported] })));
    const result = await runReelExtraction(t, input, DURATION);
    expect(result.constraints).toEqual([futureStart, unsupported]);
    expect(reelExtractionResponse.parse(result)).toEqual(result);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("rejects incomplete, empty, malformed and source-unsupported responses", async () => {
    await expect(runReelExtraction(transport(JSON.stringify(base()), "MAX_TOKENS").transport, input, DURATION)).rejects.toThrow("Incomplete extraction");
    await expect(runReelExtraction(transport(undefined).transport, input, DURATION)).rejects.toThrow("Incomplete extraction");
    await expect(runReelExtraction(transport("not json").transport, input, DURATION)).rejects.toThrow();
    await expect(runReelExtraction(transport(JSON.stringify(base({ constraints: [{ ...futureStart, startsOn: "2026-07-01" }] }))).transport, input, DURATION)).rejects.toThrow("does not literally state");
    await expect(runReelExtraction(transport(JSON.stringify(base({ constraints: [{ ...unsupported, quote: "Students only" }] }))).transport, input, DURATION)).rejects.toThrow("not in the source");
    await expect(runReelExtraction(transport(JSON.stringify(base({ constraints: [{ ...unsupported, draftIndex: 3 }] }))).transport, input, DURATION)).rejects.toThrow();
  });

  it("still parses an old-shape response, which the adapter then holds for human review", async () => {
    const { constraints: _omit, ...legacy } = base();
    void _omit;
    const result = await runReelExtraction(transport(JSON.stringify(legacy)).transport, input, DURATION);
    expect(result.constraints).toBeUndefined();
    const { drafts } = reelExtractionToDealDrafts(result);
    expect(drafts[0].reviewIssues.map(i => i.detail)).toEqual([LEGACY_CONSTRAINT_REVIEW_DETAIL]);
  });
});

describe("adapter and canonical reducer/publish validator", () => {
  const adapt = (raw: unknown) => reelExtractionToDealDrafts(JSON.parse(JSON.stringify(parse(raw))));

  it("a source-supported FUTURE_START becomes a hard block that no resolution or edit can clear", () => {
    const { drafts, sidecar } = adapt(base({ constraints: [futureStart] }));
    let d = drafts[0];
    expect(d.reviewIssues).toEqual([expect.objectContaining({ code: "FUTURE_START", blocking: true, resolved: false, detail: "Deal starts June 15, 2026", dealIndex: 0 })]);
    expect(sidecar.contractGaps).toEqual([]);

    d = publishReady(d);
    expect(validateForPublish(d).errors).toEqual([expect.stringContaining("Hard blocker: future-start deal")]);

    // Generic resolution, with and without a note, does nothing.
    d = resolveAll(d);
    d = dealDraftReducer(d, { type: "RESOLVE_REVIEW_ISSUE", issueId: d.reviewIssues[0].id, resolutionNote: "" });
    expect(d.reviewIssues[0].resolved).toBe(false);
    // Manual edits of every field, re-review and a new pin do not clear it either.
    d = dealDraftReducer(d, { type: "SET_FIELD", field: "restaurant", value: "Ramen Danbo" });
    d = dealDraftReducer(d, { type: "SET_FIELD", field: "dealText", value: "Gyoza combo" });
    d = dealDraftReducer(d, { type: "SET_FIELD", field: "priceCad", value: 12.5 });
    d = dealDraftReducer(d, { type: "SET_FIELD", field: "expiresOn", value: "2026-12-31" });
    d = dealDraftReducer(d, { type: "CONFIRM_LOCATION", lat: 49.2827, lng: -123.1207 });
    expect(d.reviewIssues[0]).toMatchObject({ code: "FUTURE_START", resolved: false });
    const verdict = validateForPublish(d);
    expect(verdict.valid).toBe(false);
    expect(verdict.errors).toEqual(expect.arrayContaining([expect.stringContaining("Hard blocker: future-start deal")]));
    expect(() => buildPublishFields(d)).toThrow(DraftValidationError);
  });

  it("UNSUPPORTED_CONSTRAINT is an explicit source review that blocks until resolved with a real note", () => {
    const { drafts } = adapt(base({ constraints: [unsupported] }));
    let d = publishReady(drafts[0]);
    expect(d.reviewIssues).toEqual([expect.objectContaining({ code: "UNSUPPORTED_CONSTRAINT", blocking: true, resolved: false, detail: "Members only" })]);
    expect(validateForPublish(d).errors).toEqual([expect.stringContaining("Unresolved provider constraint: Members only")]);
    d = dealDraftReducer(d, { type: "RESOLVE_REVIEW_ISSUE", issueId: d.reviewIssues[0].id, resolutionNote: "  " });
    expect(validateForPublish(d).valid).toBe(false);
    d = resolveAll(d, "Confirmed members-only limit in the video");
    expect(validateForPublish(d).valid).toBe(true);
  });

  it("a year-less or ambiguous start is held as a blocking UNSUPPORTED_CONSTRAINT with no typed date", () => {
    const caption = "Ramen Danbo. Starts June 15 for members. Also from 06/07/2026.";
    for (const quote of ["Starts June 15", "from 06/07/2026"]) {
      const note = { ...unsupported, detail: `Start date not fully stated: ${quote}`, quote };
      const parsed = parse(base({ constraints: [note] }), caption);
      expect(parsed.constraints![0]).toMatchObject({ code: "UNSUPPORTED_CONSTRAINT", startsOn: null });
      const { drafts, sidecar } = reelExtractionToDealDrafts(parsed);
      expect(drafts[0].reviewIssues).toEqual([expect.objectContaining({ code: "UNSUPPORTED_CONSTRAINT", blocking: true, resolved: false })]);
      expect(drafts[0].reviewIssues.some(i => i.code === "FUTURE_START")).toBe(false);
      expect(sidecar.constraints![0].startsOn).toBeNull();
      expect(validateForPublish(publishReady(drafts[0])).valid).toBe(false);
    }
  });

  it("a FUTURE_START on one offer never leaks to another, and typed notes keep warnings", () => {
    const second = { ...draft, restaurant: "Second Cafe" };
    const { drafts, sidecar } = adapt(base({
      drafts: [draft, second], evidence: [...evidence, ...evidence.map(e => ({ ...e, draftIndex: 1 }))],
      warnings: ["Caption and audio disagree about hours"], constraints: [{ ...futureStart, draftIndex: 1 }],
    }));
    expect(drafts[0].reviewIssues.map(i => i.code)).toEqual(["UNSUPPORTED_CONSTRAINT"]);
    expect(drafts[0].reviewIssues[0].detail).toBe("Caption and audio disagree about hours");
    expect(drafts[1].reviewIssues.map(i => i.code).sort()).toEqual(["FUTURE_START", "UNSUPPORTED_CONSTRAINT"]);
    expect(sidecar.warnings).toEqual(["Caption and audio disagree about hours"]);
    expect(validateForPublish(resolveAll(publishReady(drafts[0]))).valid).toBe(true);
    expect(validateForPublish(resolveAll(publishReady(drafts[1]))).valid).toBe(false);
  });

  it("a valid annotation is accepted but everything stays tentative, with no invented confidence", () => {
    const { drafts, sidecar } = adapt(base({ constraints: [unsupported, futureStart] }));
    const d = drafts[0];
    for (const key of ["restaurant", "address", "dealText", "priceCad", "validDays", "validStart", "validEnd", "expiresOn", "conditions"] as const) {
      expect(d.fields[key].isReviewed).toBe(false);
      expect(d.fields[key].isManuallyEdited).toBe(false);
      expect(d.fields[key].suggestion?.confidence).toBeUndefined();
    }
    expect(d.fields.restaurant.value).toBeNull();
    expect(d.fields.restaurant.suggestion?.value).toBe("Ramen Danbo");
    expect(validateForPublish(d).valid).toBe(false);
    expect(JSON.stringify([d, sidecar])).not.toMatch(/confidence"\s*:\s*\{/);
  });

  it("carries constraint evidence separately in a cloned sidecar next to evidence, transcript and warnings", () => {
    const raw = base({ warnings: ["Possible blackout dates"], constraints: [futureStart, { ...unsupported, channel: "audio", quote: "limited to members", timestampSeconds: 12 }] });
    const parsed = parse(raw);
    const { sidecar } = reelExtractionToDealDrafts(parsed);
    expect(sidecar.constraints).toEqual(parsed.constraints);
    expect(sidecar.constraints).not.toBe(parsed.constraints);
    expect(sidecar.constraints![1]).toMatchObject({ channel: "audio", quote: "limited to members", timestampSeconds: 12 });
    expect(sidecar.evidence).toEqual(parsed.evidence);
    expect(sidecar.transcript).toBe(TRANSCRIPT);
    expect(sidecar.warnings).toEqual(["Possible blackout dates"]);
    expect(Object.keys(sidecar).sort()).toEqual(["constraints", "contractGaps", "evidence", "missingFieldsByDraft", "transcript", "warnings"]);
    sidecar.constraints![0].detail = "mutated";
    expect(parsed.constraints![0].detail).toBe("Deal starts June 15, 2026");
  });

  it("legacy output without constraints stays unknown: explicit blocking review per offer and reported gaps", () => {
    const second = { ...draft, restaurant: "Second Cafe" };
    const legacy = { isDeal: true, drafts: [draft, second], evidence: [...evidence, ...evidence.map(e => ({ ...e, draftIndex: 1 }))], transcript: TRANSCRIPT, warnings: [] };
    const { drafts, sidecar } = reelExtractionToDealDrafts(legacy);
    expect(sidecar.constraints).toBeUndefined();
    expect("constraints" in sidecar).toBe(false);
    expect(sidecar.contractGaps).toEqual(REEL_EXTRACTION_CONTRACT_GAPS);
    for (const [i, d] of drafts.entries()) {
      expect(d.reviewIssues).toEqual([expect.objectContaining({ code: "UNSUPPORTED_CONSTRAINT", blocking: true, resolved: false, dealIndex: i, detail: LEGACY_CONSTRAINT_REVIEW_DETAIL })]);
      expect(validateForPublish(publishReady(d)).errors).toEqual([expect.stringContaining("Unresolved provider constraint")]);
      expect(validateForPublish(resolveAll(publishReady(d), "Reviewed the original reel for start date and limits")).valid).toBe(true);
    }
  });

  it("has no bypass: ignored options and warning text can never skip the legacy review or invent FUTURE_START", () => {
    const legacy = { isDeal: true, drafts: [draft], evidence, transcript: TRANSCRIPT, warnings: ["Starts June 15, 2026 per caption"] };
    for (const options of [undefined, {}, { sourceUrl: null }, { enforceLegacyConstraintReview: false, legacyConstraintReview: false, skipLegacyReview: true } as never]) {
      const { drafts } = reelExtractionToDealDrafts(legacy, options);
      expect(drafts[0].reviewIssues.map(i => [i.code, i.detail])).toEqual([
        ["UNSUPPORTED_CONSTRAINT", LEGACY_CONSTRAINT_REVIEW_DETAIL],
        ["UNSUPPORTED_CONSTRAINT", "Starts June 15, 2026 per caption"],
      ]);
    }
  });

  it("an empty constraints array is the model's 'none found': no legacy note, gaps cleared, still human-confirmed", () => {
    const { drafts, sidecar } = adapt(base());
    expect(drafts[0].reviewIssues).toEqual([]);
    expect(sidecar.constraints).toEqual([]);
    expect(sidecar.contractGaps).toEqual([]);
    expect(validateForPublish(drafts[0]).valid).toBe(false); // suggestions still pending, pin unconfirmed
    expect(validateForPublish(publishReady(drafts[0])).valid).toBe(true);
  });

  it("the strict schema and adapter reject a constraint pointing at a missing draft", () => {
    expect(() => reelExtractionToDealDrafts(base({ constraints: [{ ...unsupported, draftIndex: 1 }] }))).toThrow();
    expect(reelExtraction.safeParse(base({ constraints: [{ ...unsupported, draftIndex: 1 }] })).success).toBe(false);
  });
});
