import { describe, expect, it } from "vitest";
import {
  safeDestination,
  safeSourceUrl,
  retryAllowed,
  jobSchema,
  type JobData,
} from "./workflow";
import { draftSchema, emptyDraft, previewDeal } from "./draft";
describe("safe frontend routes and source links", () => {
  it("keeps internal return routes", () =>
    expect(safeDestination("/post")).toBe("/post"));
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/ /evil.example",
    null,
  ])("rejects unsafe return destination %s", (v) =>
    expect(safeDestination(v)).toBe("/profile"),
  );
  it.each([
    "javascript:alert(1)",
    "http://example.com",
    "https://password:secret@example.com",
    "not-a-url",
    "https://localhost/offer",
    "https://192.168.1.1/offer",
    "https://[::1]/offer",
    "https://example.com:3000/offer",
    "https://offer.local/offer",
    "https://offer.internal/offer",
    "https://offer.localhost/offer",
  ])("rejects unsafe source %s", (v) =>
    expect(safeSourceUrl(v)).toBeUndefined(),
  );
  it("permits HTTPS attribution", () =>
    expect(safeSourceUrl("https://example.com/offer")).toBe(
      "https://example.com/offer",
    ));
  it("rejects source URLs beyond the backend limit", () =>
    expect(
      safeSourceUrl(`https://example.com/${"a".repeat(2048)}`),
    ).toBeUndefined());
});
describe("local preview draft validation", () => {
  const valid = {
    ...emptyDraft,
    restaurant: "Test cafe",
    dealText: "A latte for $3",
    price: "3.00",
  };
  it("requires a restaurant and offer", () =>
    expect(draftSchema.safeParse(emptyDraft).success).toBe(false));
  it.each(["-1", "0.001", "abc", "100001"])(
    "rejects invalid CAD price %s",
    (price) =>
      expect(draftSchema.safeParse({ ...valid, price }).success).toBe(false),
  );
  it("keeps unknown price absent and doesn't fabricate coordinates", () => {
    const d = previewDeal(
      { ...valid, price: "" },
      "preview-test",
      "Test member",
    );
    expect(d.priceCad).toBeUndefined();
    expect(d.lat).toBeUndefined();
    expect(d.lng).toBeUndefined();
    expect(d.isDemo).toBe(true);
  });
  it("allows overnight hours", () =>
    expect(
      draftSchema.safeParse({ ...valid, start: "21:00", end: "01:00" }).success,
    ).toBe(true));
  it("rejects malformed times", () =>
    expect(draftSchema.safeParse({ ...valid, start: "25:00" }).success).toBe(
      false,
    ));
  it("rejects a nonexistent date", () =>
    expect(
      draftSchema.safeParse({ ...valid, expiry: "2026-02-30" }).success,
    ).toBe(false));
});
describe("job states", () => {
  const base: JobData = {
    jobId: "test-job",
    status: "failed",
    createdAt: 1,
    updatedAt: 1000,
    result: null,
    error: null,
    deals: [],
  };
  it("accepts empty queued jobs without fabricating percent progress", () =>
    expect(jobSchema.safeParse({ ...base, status: "queued" }).success).toBe(
      true,
    ));
  it("rejects unknown job status", () =>
    expect(jobSchema.safeParse({ ...base, status: "success" }).success).toBe(
      false,
    ));
  it("allows failed retry", () => expect(retryAllowed(base, 1001)).toBe(true));
  it("doesn't retry active jobs", () =>
    expect(retryAllowed({ ...base, status: "processing" }, 1001)).toBe(false));
  it("allows stale processing retry", () =>
    expect(
      retryAllowed({ ...base, status: "processing" }, 1000 + 16 * 60_000),
    ).toBe(true));
  it("doesn't retry published jobs", () =>
    expect(
      retryAllowed({
        ...base,
        deals: [{ status: "published" } as JobData["deals"][number]],
      }),
    ).toBe(false));
});
