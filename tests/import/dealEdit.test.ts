/**
 * Tests for canonical author edit/delete helpers (T-10B).
 *
 * All users, deals and mutation functions here are SYNTHETIC. The exported helpers are exactly
 * those the detail and edit components call; no network, provider or cloud is involved.
 */
import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { dealDraftReducer } from "../../lib/dealDraft";
import {
  GENERIC_DELETE_ERROR,
  GENERIC_SAVE_ERROR,
  DealEditError,
  buildUpdateArgs,
  canEditDeal,
  changedExternally,
  dealSignature,
  editAccess,
  initDraftFromSavedDeal,
  submitDealDelete,
  submitDealUpdate,
  type SavedDeal,
} from "../../lib/dealEdit";

const DEAL_ID = "deal-1" as Id<"deals">;
const AUTHOR = "user-author" as Id<"users">;
const OTHER = "user-other" as Id<"users">;
const IMAGE = "storage-img-1" as Id<"_storage">;

const saved = (over: Partial<SavedDeal> = {}): SavedDeal => ({
  _id: DEAL_ID,
  authorId: AUTHOR,
  restaurant: "Gastown Pizza",
  address: "12 Water St",
  dealText: "Two slices and pop",
  priceCad: 8,
  validDays: ["mon", "tue"],
  validStart: "11:00",
  validEnd: "15:00",
  expiresOn: "2027-01-31",
  conditions: ["Dine-in only"],
  lat: 49.2827,
  lng: -123.107,
  imageId: IMAGE,
  sourceUrl: "https://www.instagram.com/reel/abc/",
  ...over,
});

describe("canEditDeal / editAccess (real userId vs canonical authorId only)", () => {
  it("allows only an exact userId match", () => {
    expect(canEditDeal({ userId: AUTHOR }, { authorId: AUTHOR })).toBe(true);
    expect(canEditDeal({ userId: OTHER }, { authorId: AUTHOR })).toBe(false);
  });

  it("denies signed-out, loading, profile-less and missing ids", () => {
    expect(canEditDeal(null, { authorId: AUTHOR })).toBe(false);
    expect(canEditDeal(undefined, { authorId: AUTHOR })).toBe(false);
    expect(canEditDeal({ userId: AUTHOR }, null)).toBe(false);
    expect(canEditDeal({ userId: "" }, { authorId: "" })).toBe(false);
    expect(canEditDeal({ userId: AUTHOR }, { authorId: undefined })).toBe(false);
  });

  it("is not fooled by duplicate or identical display names", () => {
    const me = { userId: OTHER, displayName: "Sam" };
    const deal = { authorId: AUTHOR, authorName: "Sam" };
    expect(canEditDeal(me, deal)).toBe(false);
  });

  it("maps auth/me state to the edit route view", () => {
    const deal = { authorId: AUTHOR };
    expect(editAccess({ authLoading: true, isAuthenticated: false, me: undefined, deal })).toBe("loading");
    expect(editAccess({ authLoading: false, isAuthenticated: false, me: null, deal })).toBe("signed_out");
    expect(editAccess({ authLoading: false, isAuthenticated: true, me: undefined, deal })).toBe("loading");
    expect(editAccess({ authLoading: false, isAuthenticated: true, me: null, deal })).toBe("forbidden");
    expect(editAccess({ authLoading: false, isAuthenticated: true, me: { userId: OTHER }, deal })).toBe("forbidden");
    expect(editAccess({ authLoading: false, isAuthenticated: true, me: { userId: AUTHOR }, deal })).toBe("allowed");
  });
});

describe("initDraftFromSavedDeal", () => {
  it("populates every persisted field as reviewed with the saved confirmed location", () => {
    const d = initDraftFromSavedDeal(saved());
    expect(d.fields.restaurant.value).toBe("Gastown Pizza");
    expect(d.fields.priceCad.value).toBe(8);
    expect(d.fields.validDays.value).toEqual(["mon", "tue"]);
    expect(d.fields.conditions.value).toEqual(["Dine-in only"]);
    expect(Object.values(d.fields).every((f) => f.isReviewed)).toBe(true);
    expect(Object.values(d.fields).every((f) => f.suggestion === undefined)).toBe(true);
    expect(d.location).toEqual({ lat: 49.2827, lng: -123.107, confirmed: true });
    expect(d.imageId).toBe(IMAGE);
    expect(d.sourceUrl).toBe("https://www.instagram.com/reel/abc/");
    expect(d.reviewIssues).toEqual([]);
  });

  it("treats absent optional fields as reviewed omissions", () => {
    const d = initDraftFromSavedDeal(
      saved({ address: undefined, priceCad: undefined, validStart: undefined, validEnd: undefined, expiresOn: undefined, validDays: [], conditions: [] })
    );
    expect(d.fields.address.value).toBeNull();
    expect(d.fields.priceCad.value).toBeNull();
    expect(d.fields.validStart.value).toBeNull();
    expect(Object.values(d.fields).every((f) => f.isReviewed)).toBe(true);
  });

  it("leaves a corrupt weekday unreviewed and corrupt coordinates unplaced instead of guessing", () => {
    const d = initDraftFromSavedDeal(saved({ validDays: ["mon", "funday"], lat: 999 }));
    expect(d.fields.validDays.value).toEqual(["mon"]);
    expect(d.fields.validDays.isReviewed).toBe(false);
    expect(d.location).toBeNull();
  });
});

describe("buildUpdateArgs", () => {
  it("an unchanged save sends exactly the canonical fields and keeps image and source", () => {
    const original = saved();
    const args = buildUpdateArgs(DEAL_ID, initDraftFromSavedDeal(original), original);
    expect(args).toEqual({
      dealId: DEAL_ID,
      restaurant: "Gastown Pizza",
      address: "12 Water St",
      dealText: "Two slices and pop",
      priceCad: 8,
      validDays: ["mon", "tue"],
      validStart: "11:00",
      validEnd: "15:00",
      expiresOn: "2027-01-31",
      conditions: ["Dine-in only"],
      lat: 49.2827,
      lng: -123.107,
      imageId: IMAGE,
      sourceUrl: "https://www.instagram.com/reel/abc/",
    });
  });

  it("never includes author, vote counts, ids or other non-request fields", () => {
    const original = { ...saved(), stillOnCount: 9, expiredCount: 3, authorName: "Sam", imageUrl: "https://x" } as SavedDeal;
    const args = buildUpdateArgs(DEAL_ID, initDraftFromSavedDeal(original), original);
    expect(Object.keys(args).sort()).toEqual(
      ["address", "conditions", "dealId", "dealText", "expiresOn", "imageId", "lat", "lng", "priceCad", "restaurant", "sourceUrl", "validDays", "validEnd", "validStart"].sort()
    );
  });

  it("omits cleared optional fields (never null) so the full-replacement update clears them", () => {
    const original = saved();
    let d = initDraftFromSavedDeal(original);
    d = dealDraftReducer(d, { type: "SET_FIELD", field: "priceCad", value: null });
    d = dealDraftReducer(d, { type: "SET_FIELD", field: "address", value: null });
    d = dealDraftReducer(d, { type: "SET_FIELD", field: "expiresOn", value: null });
    d = dealDraftReducer(d, { type: "SET_FIELD", field: "validStart", value: null });
    d = dealDraftReducer(d, { type: "SET_FIELD", field: "validEnd", value: null });
    d = dealDraftReducer(d, { type: "SET_FIELD", field: "validDays", value: [] });
    d = dealDraftReducer(d, { type: "SET_FIELD", field: "conditions", value: [] });
    // Clearing the address invalidates the saved confirmation; the author confirms a point again.
    d = dealDraftReducer(d, { type: "CONFIRM_LOCATION", lat: 49.28, lng: -123.1 });
    const args = buildUpdateArgs(DEAL_ID, d, original);
    for (const key of ["priceCad", "address", "expiresOn", "validStart", "validEnd"]) {
      expect(Object.prototype.hasOwnProperty.call(args, key)).toBe(false);
    }
    expect(args.validDays).toEqual([]);
    expect(args.conditions).toEqual([]);
    expect(args.lat).toBe(49.28);
    expect(JSON.stringify(args)).not.toContain("null");
  });

  it("restaurant or address edits invalidate the saved pin until explicitly re-confirmed", () => {
    const original = saved();
    for (const field of ["restaurant", "address"] as const) {
      let d = initDraftFromSavedDeal(original);
      d = dealDraftReducer(d, { type: "SET_FIELD", field, value: "Changed" });
      expect(d.location).toBeNull();
      expect(() => buildUpdateArgs(DEAL_ID, d, original)).toThrow(/explicitly confirmed/);
      d = dealDraftReducer(d, { type: "CONFIRM_LOCATION", lat: 49.3, lng: -123.2 });
      expect(buildUpdateArgs(DEAL_ID, d, original)).toMatchObject({ lat: 49.3, lng: -123.2 });
    }
  });

  it("a proposal change (INVALIDATE_LOCATION) blocks the save until confirmed", () => {
    const original = saved();
    const d = dealDraftReducer(initDraftFromSavedDeal(original), { type: "INVALIDATE_LOCATION" });
    expect(() => buildUpdateArgs(DEAL_ID, d, original)).toThrow(DealEditError);
  });

  it("rejects blank required fields and unreviewed fields through the shared gate", () => {
    const original = saved();
    const blank = dealDraftReducer(initDraftFromSavedDeal(original), { type: "SET_FIELD", field: "dealText", value: "   " });
    expect(() => buildUpdateArgs(DEAL_ID, blank, original)).toThrow(/Deal text is required/);

    const unreviewed = initDraftFromSavedDeal(saved({ validDays: ["mon", "funday"] }));
    expect(() => buildUpdateArgs(DEAL_ID, unreviewed, original)).toThrow(/Valid days must be explicitly reviewed/);
  });

  it("preflights the backend rule that start and end times come together", () => {
    const original = saved();
    const d = dealDraftReducer(initDraftFromSavedDeal(original), { type: "SET_FIELD", field: "validEnd", value: null });
    expect(() => buildUpdateArgs(DEAL_ID, d, original)).toThrow(/both start and end times/);
  });

  it("the image id can never be newly claimed: only the original deal's id is sent", () => {
    const original = saved();
    let d = initDraftFromSavedDeal(original);
    d = dealDraftReducer(d, { type: "SET_IMAGE_ID", imageId: "someone-elses-image" });
    expect(buildUpdateArgs(DEAL_ID, d, original).imageId).toBe(IMAGE);

    const noImage = saved({ imageId: undefined });
    const withDraftImage = dealDraftReducer(initDraftFromSavedDeal(noImage), { type: "SET_IMAGE_ID", imageId: "new-image" });
    expect("imageId" in buildUpdateArgs(DEAL_ID, withDraftImage, noImage)).toBe(false);
  });

  it("keeps the saved source link even if the draft's copy is changed", () => {
    const original = saved();
    const d = dealDraftReducer(initDraftFromSavedDeal(original), { type: "SET_SOURCE_URL", sourceUrl: "https://evil.example/" });
    expect(buildUpdateArgs(DEAL_ID, d, original).sourceUrl).toBe("https://www.instagram.com/reel/abc/");
  });

  it("retains partial edits across a failed attempt (the draft is never mutated)", () => {
    const original = saved();
    const d = dealDraftReducer(initDraftFromSavedDeal(original), { type: "SET_FIELD", field: "dealText", value: "Edited text" });
    const before = JSON.stringify(d);
    buildUpdateArgs(DEAL_ID, d, original);
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe("server round trips", () => {
  const args = () => buildUpdateArgs(DEAL_ID, initDraftFromSavedDeal(saved()), saved());

  it("update resolves only after the server confirms and passes the exact args", async () => {
    const update = vi.fn().mockResolvedValue(null);
    await expect(submitDealUpdate(update, args())).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith(args());
  });

  it("a rejected update becomes a generic error with no server detail", async () => {
    const update = vi.fn().mockRejectedValue(new Error("Only the author can edit this deal. secret-stack"));
    const error = await submitDealUpdate(update, args()).catch((e) => e);
    expect(error).toBeInstanceOf(DealEditError);
    expect(error.message).toBe(GENERIC_SAVE_ERROR);
    expect(error.message).not.toContain("secret");
  });

  it("delete reports success only after the server resolved", async () => {
    const order: string[] = [];
    const remove = vi.fn(async () => {
      order.push("server");
      return null;
    });
    const outcome = await submitDealDelete(remove, DEAL_ID);
    order.push("after");
    expect(outcome).toEqual({ ok: true });
    expect(order).toEqual(["server", "after"]);
    expect(remove).toHaveBeenCalledWith({ dealId: DEAL_ID });
  });

  it("a failed delete is a generic failure, never a fake success", async () => {
    const remove = vi.fn().mockRejectedValue(new Error("Only the author can delete this deal."));
    const outcome = await submitDealDelete(remove, DEAL_ID);
    expect(outcome).toEqual({ ok: false, message: GENERIC_DELETE_ERROR });
  });
});

describe("external change detection", () => {
  it("treats absent and undefined optionals as equal and own saves as known", () => {
    const base = saved();
    expect(dealSignature(base)).toBe(dealSignature({ ...base, address: base.address }));
    expect(changedExternally([base], { ...base })).toBe(false);
    const mine = saved({ dealText: "Mine" });
    expect(changedExternally([base], mine)).toBe(true);
    expect(changedExternally([base, mine], mine)).toBe(false);
  });

  it("detects changes to any persisted editable field including image and location", () => {
    const base = saved();
    for (const over of [{ restaurant: "x" }, { lat: 49.1 }, { imageId: undefined }, { priceCad: undefined }, { conditions: [] }] as Partial<SavedDeal>[]) {
      expect(changedExternally([base], saved(over))).toBe(true);
    }
  });
});
