// Pressing Publish must always end in something visible: published, a list of what to fix, or a failure message.
// Before this, the readiness check ran outside the try block of an async event handler, so an unexpected throw (or a
// server call that never answered) left the screen unchanged: "nothing happens". Synthetic drafts, no network.
import { describe, expect, it, vi } from "vitest";
import { createDraft, dealDraftReducer, type DealDraft } from "../../lib/dealDraft";
import { submitForPublish, SLOW_PUBLISH_MESSAGE } from "../../lib/dealReviewForm";

function readyDraft(): DealDraft {
  let d = createDraft({ restaurant: "Cockney Kings", dealText: "Cod and chips $1.50", priceCad: 1.5, validDays: ["sun"], validStart: "12:00", validEnd: "16:00", conditions: ["Limit one per person"] });
  for (const field of ["restaurant", "dealText", "priceCad", "validDays", "validStart", "validEnd", "conditions"] as const) d = dealDraftReducer(d, { type: "REVIEW_FIELD", field });
  for (const field of ["address", "expiresOn"] as const) d = dealDraftReducer(d, { type: "REVIEW_OMISSION", field });
  return dealDraftReducer(d, { type: "CONFIRM_LOCATION", lat: 49.28, lng: -123.12 });
}

describe("submitForPublish", () => {
  it("publishes a ready draft with the canonical fields", async () => {
    const publish = vi.fn(async (fields: unknown) => (void fields, undefined));
    const outcome = await submitForPublish(readyDraft(), "1.5", publish);
    expect(outcome).toEqual({ kind: "published" });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toMatchObject({ restaurant: "Cockney Kings", priceCad: 1.5, lat: 49.28, lng: -123.12 });
  });

  it("returns the list of things to fix, without calling the server, when the draft is not ready", async () => {
    const publish = vi.fn(async () => undefined);
    const outcome = await submitForPublish(createDraft({ restaurant: "X" }), undefined, publish);
    expect(outcome.kind).toBe("blocked");
    expect(outcome.kind === "blocked" && outcome.errors.length).toBeGreaterThan(0);
    expect(publish).not.toHaveBeenCalled();
  });

  it("turns a server rejection into a visible failure with its message", async () => {
    const outcome = await submitForPublish(readyDraft(), "1.5", async () => { throw new Error("Create your profile first (open Profile), then publish."); });
    expect(outcome).toEqual({ kind: "failed", message: "Create your profile first (open Profile), then publish." });
  });

  it("turns an unexpected throw anywhere in the readiness check into a visible failure instead of silence", async () => {
    const broken = new Proxy(readyDraft(), { get(target, key) { if (key === "fields") throw new Error("unexpected draft state"); return Reflect.get(target, key); } });
    const outcome = await submitForPublish(broken as DealDraft, "1.5", async () => undefined);
    expect(outcome).toEqual({ kind: "failed", message: "unexpected draft state" });
  });

  it("gives a generic message for a non-Error rejection", async () => {
    const outcome = await submitForPublish(readyDraft(), "1.5", () => Promise.reject("nope"));
    expect(outcome).toEqual({ kind: "failed", message: "Publish request failed." });
  });

  it("stops waiting for a server that never answers and says the deal may still be published", async () => {
    const started = Date.now();
    const outcome = await submitForPublish(readyDraft(), "1.5", () => new Promise(() => {}), { timeoutMs: 30 });
    expect(outcome).toEqual({ kind: "failed", message: SLOW_PUBLISH_MESSAGE });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(SLOW_PUBLISH_MESSAGE).toMatch(/may still be published/i);
  });
});
