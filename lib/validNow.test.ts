import { describe, expect, it } from "vitest";
import { validNow, DealValidityInput } from "./validNow";

// Helper to construct UTC Date for specific Vancouver local times
// PDT: UTC-7 (spring/summer/early autumn)
// PST: UTC-8 (late autumn/winter)
function vancouverDate(isoString: string): Date {
  return new Date(isoString);
}

describe("validNow temporal logic", () => {
  const baseDeal: DealValidityInput = {
    validDays: ["mon", "tue", "wed", "thu", "fri"],
    validStart: "11:00",
    validEnd: "14:00",
    expiresOn: "2026-10-31",
  };

  describe("All basic states", () => {
    // 2026-10-07 is a Wednesday (PDT, UTC-7)
    // 11:00 Vancouver = 18:00 UTC
    // 14:00 Vancouver = 21:00 UTC

    it("returns 'valid' with correct minutesLeft when inside window", () => {
      // 12:30 Vancouver (19:30 UTC): 90 minutes until 14:00
      const now = vancouverDate("2026-10-07T19:30:00.000Z");
      const result = validNow(baseDeal, now);
      expect(result).toEqual({ status: "valid", minutesLeft: 90 });
    });

    it("returns 'later_today' before window starts on an active day", () => {
      // 09:00 Vancouver (16:00 UTC)
      const now = vancouverDate("2026-10-07T16:00:00.000Z");
      const result = validNow(baseDeal, now);
      expect(result).toEqual({ status: "later_today" });
    });

    it("returns 'not_today' after window ends on an active day", () => {
      // 14:00 Vancouver (21:00 UTC)
      const now = vancouverDate("2026-10-07T21:00:00.000Z");
      const result = validNow(baseDeal, now);
      expect(result).toEqual({ status: "not_today" });
    });

    it("returns 'not_today' on an inactive weekday", () => {
      // 2026-10-10 is a Saturday (inactive in baseDeal)
      // 12:00 Vancouver (19:00 UTC)
      const now = vancouverDate("2026-10-10T19:00:00.000Z");
      const result = validNow(baseDeal, now);
      expect(result).toEqual({ status: "not_today" });
    });

    it("returns 'expired' after the inclusive Vancouver expiry date", () => {
      // Expiry is 2026-10-31 (Saturday)
      // 2026-11-01 12:00 Vancouver (20:00 UTC)
      const now = vancouverDate("2026-11-01T20:00:00.000Z");
      const result = validNow(baseDeal, now);
      expect(result).toEqual({ status: "expired" });
    });

    it("treats expiry date as inclusive on the expiry date itself", () => {
      // 2026-10-30 is Friday (active day, <= 2026-10-31)
      // 12:00 Vancouver (19:00 UTC)
      const now = vancouverDate("2026-10-30T19:00:00.000Z");
      const result = validNow(baseDeal, now);
      expect(result.status).toBe("valid");
    });
  });

  describe("Exact boundaries (start-inclusive, end-exclusive)", () => {
    // 2026-10-07 Wednesday:
    // 11:00:00.000 Vancouver = 18:00:00.000 UTC
    // 14:00:00.000 Vancouver = 21:00:00.000 UTC

    it("is valid at exact start time (start-inclusive)", () => {
      const atStart = vancouverDate("2026-10-07T18:00:00.000Z");
      expect(validNow(baseDeal, atStart)).toEqual({ status: "valid", minutesLeft: 180 });
    });

    it("is later_today 1ms before start time", () => {
      const beforeStart = vancouverDate("2026-10-07T17:59:59.999Z");
      expect(validNow(baseDeal, beforeStart)).toEqual({ status: "later_today" });
    });

    it("is valid 1ms before end time with 0 minutes left", () => {
      const beforeEnd = vancouverDate("2026-10-07T20:59:59.999Z");
      expect(validNow(baseDeal, beforeEnd)).toEqual({ status: "valid", minutesLeft: 0 });
    });

    it("is not_today at exact end time (end-exclusive)", () => {
      const atEnd = vancouverDate("2026-10-07T21:00:00.000Z");
      expect(validNow(baseDeal, atEnd)).toEqual({ status: "not_today" });
    });
  });

  describe("Edge cases: missing expiry, days, hours, equal times", () => {
    it("returns 'unknown' when expiresOn is null, undefined or empty string", () => {
      const now = vancouverDate("2026-10-07T19:00:00.000Z");
      expect(validNow({ ...baseDeal, expiresOn: null }, now)).toEqual({ status: "unknown" });
      expect(validNow({ ...baseDeal, expiresOn: undefined }, now)).toEqual({ status: "unknown" });
      expect(validNow({ ...baseDeal, expiresOn: "" }, now)).toEqual({ status: "unknown" });
    });

    it("returns 'unknown' for invalid calendar dates in expiresOn", () => {
      const now = vancouverDate("2026-10-07T19:00:00.000Z");
      expect(validNow({ ...baseDeal, expiresOn: "2026-02-30" }, now)).toEqual({ status: "unknown" });
      expect(validNow({ ...baseDeal, expiresOn: "2026-13-01" }, now)).toEqual({ status: "unknown" });
      expect(validNow({ ...baseDeal, expiresOn: "not-a-date" }, now)).toEqual({ status: "unknown" });
      expect(validNow({ ...baseDeal, expiresOn: "2026-04-31" }, now)).toEqual({ status: "unknown" });
    });

    it("treats empty or null validDays as every day", () => {
      // 2026-10-10 is Saturday (19:00 UTC = 12:00 PDT)
      const now = vancouverDate("2026-10-10T19:00:00.000Z");
      const emptyDaysDeal = { ...baseDeal, validDays: [] };
      const nullDaysDeal = { ...baseDeal, validDays: null };
      expect(validNow(emptyDaysDeal, now)).toEqual({ status: "valid", minutesLeft: 120 });
      expect(validNow(nullDaysDeal, now)).toEqual({ status: "valid", minutesLeft: 120 });
    });

    it("treats missing both hours as all day (00:00 to 24:00)", () => {
      const allDayDeal: DealValidityInput = {
        validDays: ["wed"],
        validStart: null,
        validEnd: null,
        expiresOn: "2026-10-31",
      };
      // Wednesday at 00:00 Vancouver (07:00 UTC): 24 hours (1440 mins) left
      const atMidnight = vancouverDate("2026-10-07T07:00:00.000Z");
      expect(validNow(allDayDeal, atMidnight)).toEqual({ status: "valid", minutesLeft: 1440 });

      // Wednesday at 23:59 Vancouver (06:59 UTC next day): 1 min left
      const lateNight = vancouverDate("2026-10-08T06:59:00.000Z");
      expect(validNow(allDayDeal, lateNight)).toEqual({ status: "valid", minutesLeft: 1 });

      // Thursday at 00:00 Vancouver (07:00 UTC) -> not_today
      const thursdayStart = vancouverDate("2026-10-08T07:00:00.000Z");
      expect(validNow(allDayDeal, thursdayStart)).toEqual({ status: "not_today" });
    });

    it("handles one missing boundary (start missing = begins at 00:00)", () => {
      const deal: DealValidityInput = {
        validDays: ["wed"],
        validStart: null,
        validEnd: "12:00",
        expiresOn: "2026-10-31",
      };
      // 09:00 Vancouver (16:00 UTC) -> valid, 180 min left
      const now = vancouverDate("2026-10-07T16:00:00.000Z");
      expect(validNow(deal, now)).toEqual({ status: "valid", minutesLeft: 180 });

      // 12:00 Vancouver (19:00 UTC) -> not_today
      const after = vancouverDate("2026-10-07T19:00:00.000Z");
      expect(validNow(deal, after)).toEqual({ status: "not_today" });
    });

    it("handles one missing boundary (end missing = ends at 24:00)", () => {
      const deal: DealValidityInput = {
        validDays: ["wed"],
        validStart: "17:00",
        validEnd: null,
        expiresOn: "2026-10-31",
      };
      // 15:00 Vancouver (22:00 UTC) -> later_today
      const before = vancouverDate("2026-10-07T22:00:00.000Z");
      expect(validNow(deal, before)).toEqual({ status: "later_today" });

      // 17:00 Vancouver (00:00 UTC next day) -> valid, 7 hours (420 mins) left
      const atStart = vancouverDate("2026-10-08T00:00:00.000Z");
      expect(validNow(deal, atStart)).toEqual({ status: "valid", minutesLeft: 420 });
    });

    it("returns 'unknown' when start and end times are nonmissing and equal", () => {
      const now = vancouverDate("2026-10-07T19:00:00.000Z");
      expect(validNow({ ...baseDeal, validStart: "12:00", validEnd: "12:00" }, now)).toEqual({
        status: "unknown",
      });
      expect(validNow({ ...baseDeal, validStart: "00:00", validEnd: "00:00" }, now)).toEqual({
        status: "unknown",
      });
    });

    it("returns 'unknown' for invalid time formats or malformed inputs", () => {
      const now = vancouverDate("2026-10-07T19:00:00.000Z");
      expect(validNow({ ...baseDeal, validStart: "25:00" }, now)).toEqual({ status: "unknown" });
      expect(validNow({ ...baseDeal, validEnd: "12:60" }, now)).toEqual({ status: "unknown" });
      expect(validNow({ ...baseDeal, validStart: "9:00" }, now)).toEqual({ status: "unknown" });
      expect(validNow({ ...baseDeal, validStart: "24:00" }, now)).toEqual({ status: "unknown" });
      expect(validNow({ ...baseDeal, validDays: ["Monday"] }, now)).toEqual({ status: "unknown" });
      expect(validNow({ ...baseDeal, validDays: "mon" }, now)).toEqual({ status: "unknown" });
      expect(validNow(null, now)).toEqual({ status: "unknown" });
      expect(validNow(undefined, now)).toEqual({ status: "unknown" });
      expect(validNow("deal", now)).toEqual({ status: "unknown" });
      expect(validNow(baseDeal, new Date("invalid"))).toEqual({ status: "unknown" });
    });
  });

  describe("Overnight windows & previous weekday tail", () => {
    // Deal valid only Friday 21:00 to 02:00
    // Friday: 2026-10-02 (PDT, UTC-7). 21:00 Vancouver = 2026-10-03 04:00 UTC
    // Saturday: 2026-10-03. 02:00 Vancouver = 2026-10-03 09:00 UTC
    const fridayNightDeal: DealValidityInput = {
      validDays: ["fri"],
      validStart: "21:00",
      validEnd: "02:00",
      expiresOn: "2026-10-31",
    };

    it("recognizes overnight tail on Saturday morning as belonging to Friday", () => {
      // Saturday 01:00 Vancouver (08:00 UTC) -> valid, 60 minutes left
      const saturdayEarly = vancouverDate("2026-10-03T08:00:00.000Z");
      expect(validNow(fridayNightDeal, saturdayEarly)).toEqual({
        status: "valid",
        minutesLeft: 60,
      });
    });

    it("ends overnight tail at end time on Saturday morning", () => {
      // Saturday 02:00 Vancouver (09:00 UTC) -> not_today
      const saturdayAtEnd = vancouverDate("2026-10-03T09:00:00.000Z");
      expect(validNow(fridayNightDeal, saturdayAtEnd)).toEqual({ status: "not_today" });

      // Saturday afternoon 14:00 Vancouver (21:00 UTC) -> not_today
      const saturdayAfternoon = vancouverDate("2026-10-03T21:00:00.000Z");
      expect(validNow(fridayNightDeal, saturdayAfternoon)).toEqual({ status: "not_today" });
    });

    it("handles transition between yesterday tail and today evening on consecutive days", () => {
      const weekendDeal: DealValidityInput = {
        validDays: ["fri", "sat"],
        validStart: "21:00",
        validEnd: "02:00",
        expiresOn: "2026-10-31",
      };

      // Saturday 01:00 Vancouver: inside Friday's tail -> valid, 60 min left
      const satEarly = vancouverDate("2026-10-03T08:00:00.000Z");
      expect(validNow(weekendDeal, satEarly)).toEqual({ status: "valid", minutesLeft: 60 });

      // Saturday 03:00 Vancouver (10:00 UTC): Friday tail ended, Saturday window at 21:00 -> later_today
      const satMidday = vancouverDate("2026-10-03T10:00:00.000Z");
      expect(validNow(weekendDeal, satMidday)).toEqual({ status: "later_today" });

      // Saturday 21:00 Vancouver (04:00 UTC next day): Saturday window active -> valid, 300 min left (5h)
      const satNight = vancouverDate("2026-10-04T04:00:00.000Z");
      expect(validNow(weekendDeal, satNight)).toEqual({ status: "valid", minutesLeft: 300 });
    });

    it("does not allow overnight tail to extend beyond inclusive expiry", () => {
      // Expiry is Friday 2026-10-02 (inclusive)
      const expiringFridayDeal: DealValidityInput = {
        validDays: ["fri"],
        validStart: "21:00",
        validEnd: "02:00",
        expiresOn: "2026-10-02",
      };

      // Friday 22:00 Vancouver (05:00 UTC Saturday): valid, but window clamped at midnight!
      // 2 hours until midnight (120 mins)
      const friNight = vancouverDate("2026-10-03T05:00:00.000Z");
      expect(validNow(expiringFridayDeal, friNight)).toEqual({
        status: "valid",
        minutesLeft: 120,
      });

      // Saturday 00:00 Vancouver (07:00 UTC Saturday): date > expiresOn -> expired!
      const satMidnight = vancouverDate("2026-10-03T07:00:00.000Z");
      expect(validNow(expiringFridayDeal, satMidnight)).toEqual({ status: "expired" });

      // Saturday 01:00 Vancouver (08:00 UTC Saturday) -> expired
      const satEarly = vancouverDate("2026-10-03T08:00:00.000Z");
      expect(validNow(expiringFridayDeal, satEarly)).toEqual({ status: "expired" });
    });
  });

  describe("Daylight Saving Time (America/Vancouver)", () => {
    // 1. Spring Forward: Sunday, March 8, 2026
    // At 02:00 PST (10:00 UTC), clocks advance to 03:00 PDT (10:00 UTC).
    // The hour from 02:00 to 02:59 does not exist.
    it("accounts for spring forward jump in elapsed minutes left", () => {
      const springDeal: DealValidityInput = {
        validDays: ["sun"],
        validStart: "01:00",
        validEnd: "04:00",
        expiresOn: "2026-03-31",
      };

      // Sunday March 8, 2026 at 01:00 PST (09:00 UTC).
      // Deal ends at 04:00 PDT (11:00 UTC).
      // Wall-clock difference is 3 hours, but elapsed real time is 2 hours = 120 minutes!
      const now = vancouverDate("2026-03-08T09:00:00.000Z");
      expect(validNow(springDeal, now)).toEqual({ status: "valid", minutesLeft: 120 });
    });

    it("accounts for 23-hour day duration for all-day deal on spring forward", () => {
      const allDaySpringDeal: DealValidityInput = {
        validDays: ["sun"],
        validStart: null,
        validEnd: null,
        expiresOn: "2026-03-31",
      };

      // Sunday March 8, 2026 at 00:00 PST (08:00 UTC).
      // Ends at 24:00 (March 9 00:00 PDT = 07:00 UTC).
      // Total day length is 23 hours = 1380 minutes.
      const atMidnight = vancouverDate("2026-03-08T08:00:00.000Z");
      expect(validNow(allDaySpringDeal, atMidnight)).toEqual({
        status: "valid",
        minutesLeft: 1380,
      });
    });

    it("returns 'unknown' if deal boundary falls in the spring-forward gap", () => {
      const gapDeal: DealValidityInput = {
        validDays: ["sun"],
        validStart: "01:00",
        validEnd: "02:30", // 02:30 does not exist on March 8, 2026!
        expiresOn: "2026-03-31",
      };
      const now = vancouverDate("2026-03-08T09:00:00.000Z");
      expect(validNow(gapDeal, now)).toEqual({ status: "unknown" });
    });

    // 2. Fall Back: Sunday, November 1, 2026
    // At 02:00 PDT (09:00 UTC), clocks fall back to 01:00 PST (09:00 UTC).
    // The hour from 01:00 to 01:59 occurs twice.
    it("accounts for fall back repeated hour in elapsed minutes left", () => {
      const fallDeal: DealValidityInput = {
        validDays: ["sun"],
        validStart: "00:30",
        validEnd: "03:30",
        expiresOn: "2026-11-30",
      };

      // Sunday November 1, 2026 at 00:30 PDT (07:30 UTC).
      // Deal ends at 03:30 PST (11:30 UTC).
      // Wall-clock difference is 3 hours, but elapsed real time is 4 hours = 240 minutes!
      const now = vancouverDate("2026-11-01T07:30:00.000Z");
      expect(validNow(fallDeal, now)).toEqual({ status: "valid", minutesLeft: 240 });
    });

    it("ends at the first occurrence when an end time falls into the repeated hour", () => {
      const shortFallDeal: DealValidityInput = {
        validDays: ["sun"],
        validStart: "00:30",
        validEnd: "01:30",
        expiresOn: "2026-11-30",
      };

      // 00:30 PDT (07:30 UTC): ends at first 01:30 (01:30 PDT = 08:30 UTC)
      // 60 minutes left
      const atStart = vancouverDate("2026-11-01T07:30:00.000Z");
      expect(validNow(shortFallDeal, atStart)).toEqual({ status: "valid", minutesLeft: 60 });

      // 01:15 PST (second pass, 09:15 UTC): already ended at 08:30 UTC -> not_today
      const secondPass = vancouverDate("2026-11-01T09:15:00.000Z");
      expect(validNow(shortFallDeal, secondPass)).toEqual({ status: "not_today" });
    });

    it("accounts for 25-hour day duration for all-day deal on fall back", () => {
      const allDayFallDeal: DealValidityInput = {
        validDays: ["sun"],
        validStart: null,
        validEnd: null,
        expiresOn: "2026-11-30",
      };

      // Sunday November 1, 2026 at 00:00 PDT (07:00 UTC).
      // Ends at 24:00 (November 2 00:00 PST = 08:00 UTC).
      // Total day length is 25 hours = 1500 minutes.
      const atMidnight = vancouverDate("2026-11-01T07:00:00.000Z");
      expect(validNow(allDayFallDeal, atMidnight)).toEqual({
        status: "valid",
        minutesLeft: 1500,
      });
    });
  });
});
