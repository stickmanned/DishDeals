// The valid-times reset. The phone's native time picker can empty a field without firing a change event, so the form
// carries its own reset and also reads the field's real value on input/blur. SSR render only, like the other component tests.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { createDraft } from "../../lib/dealDraft";
import { DealReviewForm } from "../../components/deals/DealReviewForm";
import { nextTimeAction } from "../../lib/dealReviewForm";

const render = (times: { validStart?: string; validEnd?: string }) =>
  renderToStaticMarkup(createElement(DealReviewForm, {
    draft: createDraft({ restaurant: "Ramen Danbo", dealText: "Lunch combo", validDays: ["mon"], conditions: [], ...times }),
    onAction: () => {}, onPublish: async () => {},
  } as never));

describe("reset button", () => {
  it("shows when a time is set, and the all-day confirmation shows once both are empty", () => {
    expect(render({ validStart: "17:00", validEnd: "21:00" })).toMatch(/Reset times/);
    const empty = render({});
    expect(empty).not.toMatch(/Reset times/);
    expect(empty).toMatch(/Confirm all-day hours/);
  });
});

describe("reading the native time field", () => {
  it("an emptied field clears both times when the other is already empty (so confirmation appears)", () => {
    expect(nextTimeAction("validStart", "", { validStart: "17:00", validEnd: null })).toEqual({ type: "CLEAR_HOURS" });
  });
  it("an emptied field leaves the other time alone", () => {
    expect(nextTimeAction("validStart", "", { validStart: "17:00", validEnd: "21:00" })).toEqual({ type: "SET_FIELD", field: "validStart", value: null });
  });
  it("a typed time is set", () => {
    expect(nextTimeAction("validEnd", "21:30", { validStart: null, validEnd: null })).toEqual({ type: "SET_FIELD", field: "validEnd", value: "21:30" });
  });
});
