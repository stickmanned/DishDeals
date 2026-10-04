import { describe, expect, it } from "vitest";
import { formatVancouverParts } from "./vancouverTime";
import { validNow } from "./validNow";

function wall(iso: string) {
  const parts = formatVancouverParts(new Date(iso), "en-US", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}

describe("Vancouver historical and permanent Pacific time", () => {
  it("retains the final March gap and the historical winter offset", () => {
    expect(wall("2026-03-08T09:59:00Z")).toMatchObject({ hour: "01", minute: "59" });
    expect(wall("2026-03-08T10:00:00Z")).toMatchObject({ hour: "03", minute: "00" });
    expect(wall("2026-01-01T08:00:00Z")).toMatchObject({ day: "01", hour: "00" });
  });
  it("preserves 2025 fallback but has no 2026 repeated hour", () => {
    expect(wall("2025-11-02T08:30:00Z")).toMatchObject({ hour: "01", minute: "30" });
    expect(wall("2025-11-02T09:30:00Z")).toMatchObject({ hour: "01", minute: "30" });
    expect(wall("2026-11-01T08:30:00Z")).toMatchObject({ hour: "01", minute: "30" });
    expect(wall("2026-11-01T09:30:00Z")).toMatchObject({ hour: "02", minute: "30" });
  });
  it("keeps January 2027 and November overnight windows at UTC-7", () => {
    expect(wall("2027-01-01T07:00:00Z")).toMatchObject({ year: "2027", day: "01", hour: "00" });
    expect(validNow({ validDays: ["sun"], validStart: "00:30", validEnd: "03:30", expiresOn: "2026-11-30" }, new Date("2026-11-01T07:30:00Z"))).toEqual({ status: "valid", minutesLeft: 180 });
    expect(validNow({ validDays: [], expiresOn: "2026-11-30" }, new Date("2026-11-01T07:00:00Z"))).toEqual({ status: "valid", minutesLeft: 1440 });
    expect(validNow({ validDays: ["sat"], validStart: "21:00", validEnd: "02:00", expiresOn: "2026-11-01" }, new Date("2026-11-01T08:30:00Z"))).toEqual({ status: "valid", minutesLeft: 30 });
  });
});
