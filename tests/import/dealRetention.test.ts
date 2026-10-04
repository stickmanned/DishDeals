import { describe, expect, it } from "vitest";

describe("canonical Vancouver retention cutoff", () => {
  it.each([
    ["2026-10-04", "2026-10-12T07:00:00.000Z"],
    ["2025-03-02", "2025-03-10T07:00:00.000Z"], // historical spring DST
    ["2025-10-26", "2025-11-03T08:00:00.000Z"], // historical fall DST
    ["2026-10-25", "2026-11-02T07:00:00.000Z"], // permanent Pacific, no 2026 fallback
    ["2024-02-25", "2024-03-04T08:00:00.000Z"],
    ["2026-12-28", "2027-01-05T07:00:00.000Z"],
  ])("retains %s through seven complete subsequent calendar days", async (expiry, cutoff) => {
    const { dealDeletionTime, isDealDeletionDue } = await import("../../lib/dealRetention");
    const expected = Date.parse(cutoff);
    expect(dealDeletionTime(expiry)).toBe(expected);
    expect(isDealDeletionDue(expiry, expected - 1)).toBe(false);
    expect(isDealDeletionDue(expiry, expected)).toBe(true);
    expect(isDealDeletionDue(expiry, expected + 1)).toBe(true);
  });
  it.each([undefined, null, "", "2026-02-30", "2025-02-29", "2026-13-01", "2026-00-01", "2026-10-00", "10/04/2026", "2026-1-04", "2026-10-04T00:00:00Z", " 2026-10-04", 123])("retains missing/malformed legacy expiry %s", async expiry => {
    const { dealDeletionTime, isDealDeletionDue } = await import("../../lib/dealRetention");
    expect(dealDeletionTime(expiry)).toBeNull();
    expect(isDealDeletionDue(expiry, Date.parse("2030-01-01T00:00:00Z"))).toBe(false);
  });
  it("fails closed for a non-finite clock", async () => {
    const { isDealDeletionDue } = await import("../../lib/dealRetention");
    for (const now of [NaN, Infinity, -Infinity]) expect(isDealDeletionDue("2026-10-04", now)).toBe(false);
  });
});
