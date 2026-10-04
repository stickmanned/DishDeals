// A published deal needs both a start and an end time, or neither (convex/deals.ts rejects one without the other
// with "Provide both start and end times, or neither."). The form must catch this before the server does.
import { describe, expect, it } from "vitest";
import { createDraft, dealDraftReducer, validateForPublish, type DealDraft } from "../../lib/dealDraft";
import { GENERIC_PUBLISH_FAILURE, publishMessage } from "../../lib/imageDraftFlow";

function reviewed(times: { validStart?: string; validEnd?: string }): DealDraft {
  let d = createDraft({ restaurant: "Ramen Danbo", dealText: "Lunch combo", validDays: ["mon"], conditions: [], ...times });
  for (const field of ["restaurant", "dealText", "validDays", "conditions"] as const) d = dealDraftReducer(d, { type: "REVIEW_FIELD", field });
  for (const field of ["hours", "address", "priceCad", "expiresOn"] as const) d = dealDraftReducer(d, { type: "REVIEW_OMISSION", field });
  return dealDraftReducer(d, { type: "CONFIRM_LOCATION", lat: 49.2875, lng: -123.1289 });
}

describe("start and end time must be set together", () => {
  it("blocks a start time without an end time, naming the fix", () => {
    const result = validateForPublish(reviewed({ validStart: "17:00" }));
    expect(result.valid).toBe(false);
    expect(result.errors.join(" | ")).toMatch(/both start and end times/i);
  });

  it("blocks an end time without a start time", () => {
    const result = validateForPublish(reviewed({ validEnd: "21:00" }));
    expect(result.valid).toBe(false);
    expect(result.errors.join(" | ")).toMatch(/both start and end times/i);
  });

  it("allows both times, or neither (all day)", () => {
    expect(validateForPublish(reviewed({ validStart: "17:00", validEnd: "21:00" })).errors.join(" | ")).not.toMatch(/both start and end times/i);
    expect(validateForPublish(reviewed({})).errors.join(" | ")).not.toMatch(/both start and end times/i);
  });
});

describe("publish failure copy", () => {
  it("shows the server's fixed validation reasons instead of a generic line", () => {
    const err = (data: string) => Object.assign(new Error("[Request ID: x] Server Error"), { data });
    expect(publishMessage(err("Provide both start and end times, or neither."))).toMatch(/both start and end times/i);
    expect(publishMessage(err("Start time must be HH:MM from 00:00 to 23:59."))).toMatch(/start time/i);
    expect(publishMessage(err("Expiry must be a real date, YYYY-MM-DD."))).toMatch(/expiry/i);
  });

  it("still hides unknown server text and request ids", () => {
    const err = Object.assign(new Error("[Request ID: abc] Server Error sk-secret"), { data: "database exploded at table deals sk-secret" });
    expect(publishMessage(err)).toBe(GENERIC_PUBLISH_FAILURE);
  });
});

describe("resetting the valid times", () => {
  const withTimes = () => {
    const d = createDraft({ restaurant: "Ramen Danbo", dealText: "Lunch combo", validDays: ["mon"], conditions: [], validStart: "17:00", validEnd: "21:00" });
    return dealDraftReducer(dealDraftReducer(d, { type: "REVIEW_FIELD", field: "validStart" }), { type: "REVIEW_FIELD", field: "validEnd" });
  };

  it("CLEAR_HOURS empties both times and asks for the all-day confirmation again", () => {
    const next = dealDraftReducer(withTimes(), { type: "CLEAR_HOURS" });
    expect(next.fields.validStart.value).toBeNull();
    expect(next.fields.validEnd.value).toBeNull();
    expect(next.fields.validStart.isReviewed).toBe(false);
    expect(next.fields.validEnd.isReviewed).toBe(false);
  });

  it("an all-day deal publishes once the empty hours are confirmed, and not before", () => {
    let d = reviewed({});
    d = dealDraftReducer(d, { type: "SET_FIELD", field: "validStart", value: "17:00" });
    d = dealDraftReducer(d, { type: "SET_FIELD", field: "validEnd", value: "21:00" });
    d = dealDraftReducer(d, { type: "CLEAR_HOURS" });
    expect(validateForPublish(d).valid).toBe(false);
    d = dealDraftReducer(d, { type: "REVIEW_OMISSION", field: "hours" });
    expect(validateForPublish(d).valid).toBe(true);
  });
});
