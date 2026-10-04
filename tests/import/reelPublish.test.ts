// Synthetic checks of the Reel publish/geocode bindings and the keyed per-offer review. Fake create and
// geocode callbacks stand in for the backend; markup is rendered once with react-dom/server (no browser, no
// WKWebView, no real Convex, no provider, no phone). A passing result here is NOT live publish evidence.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DraftValidationError, buildPublishFields, createDraft, dealDraftReducer, validateForPublish, type DealDraft, type DraftFieldKey, type PublishFields,
} from "../../lib/dealDraft";
import {
  GENERIC_PUBLISH_ERROR, MAX_OFFERS, SEARCH_MESSAGES, PublishBindingError, PublishBlocked, PublishGuard, SEARCH_ERROR, activeAfterRemove, appendOffers, applyLatePlan,
  createPublishHandler, createSearch, liveDraft, offerListFrom, parseCandidates, publishGateMessage, publishPreconditionError, receiptFor, removeOffer, replaceOffers, toCreateArgs,
  updateOffer, type CreateArgs, type GateInput,
} from "../../lib/reels/publish";
import { CanonicalReelReview } from "../../components/reels/CanonicalReelReview";

const FIELDS: DraftFieldKey[] = ["restaurant", "dealText", "address", "priceCad", "validStart", "validEnd", "expiresOn", "validDays", "conditions"];
function confirmed(over: Parameters<typeof createDraft>[0] = {}): DealDraft {
  let d = createDraft({ restaurant: "Cafe", dealText: "Lunch special", address: "1 Fixture St", priceCad: 9.5, validDays: ["mon"], validStart: "11:00", validEnd: "14:00", expiresOn: "2026-12-31", conditions: ["dine-in"], sourceUrl: "https://example.invalid/draft-source", ...over });
  for (const field of FIELDS) d = dealDraftReducer(d, { type: "REVIEW_FIELD", field });
  return dealDraftReducer(d, { type: "CONFIRM_LOCATION", lat: 49.28, lng: -123.12 });
}
const ITEM = { sourceUrl: "https://www.instagram.com/reel/AbCdEf123/", videoId: "kd7videostorageid00000001" };
const DEAL_ID = "k57dealidentifier0000000001";
const signedIn: GateInput = { isLoading: false, isAuthenticated: true, me: { userId: "u", displayName: "Sam" } };

describe("stable per-offer keys", () => {
  const d = (n: string) => createDraft({ restaurant: n });
  it("wraps drafts with distinct keys and never reuses one after removal", () => {
    let list = offerListFrom([d("a"), d("b"), d("c")]);
    expect(list.entries.map(e => e.key)).toEqual(["offer-0", "offer-1", "offer-2"]);
    list = removeOffer(list, "offer-1");
    list = appendOffers(list, [d("d")]);
    expect(list.entries.map(e => e.key)).toEqual(["offer-0", "offer-2", "offer-3"]);
  });
  it("append and remove leave every other offer's key (so its mounted form) and draft object untouched", () => {
    const base = offerListFrom([d("a"), d("b"), d("c")]);
    const appended = appendOffers(base, [d("x")]);
    base.entries.forEach((e, i) => { expect(appended.entries[i].key).toBe(e.key); expect(appended.entries[i].draft).toBe(e.draft); });
    const removed = removeOffer(appended, "offer-0");
    expect(removed.entries.map(e => e.key)).toEqual(["offer-1", "offer-2", "offer-3"]);
    expect(removed.entries[0].draft).toBe(base.entries[1].draft);
  });
  it("cannot remove the last offer or exceed ten", () => {
    const one = offerListFrom([d("a")]);
    expect(removeOffer(one, "offer-0")).toBe(one);
    let list = offerListFrom(Array.from({ length: MAX_OFFERS }, () => d("x")));
    list = appendOffers(list, [d("y")]);
    expect(list.entries).toHaveLength(MAX_OFFERS);
  });
  it("updateOffer changes only the matching key", () => {
    const base = offerListFrom([d("a"), d("b")]);
    const next = updateOffer(base, "offer-1", draft => dealDraftReducer(draft, { type: "SET_FIELD", field: "restaurant", value: "changed" }));
    expect(next.entries[0]).toBe(base.entries[0]);
    expect(next.entries[1].draft.fields.restaurant.value).toBe("changed");
  });
  it("a per-offer callback reads its own live draft by key, not a stale index", () => {
    let list = offerListFrom([d("a"), d("b"), d("c")]);
    const keyOfC = list.entries[2].key;
    list = removeOffer(list, "offer-0"); // c is now at index 1; a stale index 2 would be wrong
    expect(liveDraft(list, keyOfC)?.fields.restaurant.value).toBe("c");
    expect(liveDraft(list, "offer-0")).toBeUndefined();
  });
  it("active index stays in bounds after removal", () => {
    expect(activeAfterRemove(2, 0, 2)).toBe(1);
    expect(activeAfterRemove(1, 1, 2)).toBe(1);
    expect(activeAfterRemove(2, 2, 2)).toBe(1);
    expect(activeAfterRemove(0, 0, 1)).toBe(0);
    expect(activeAfterRemove(1, 2, 2)).toBe(1);
  });
  it("late extraction: append mode adds only new offers and keeps every existing key; replace and Load latest re-create all", () => {
    const base = offerListFrom([d("a"), d("b")]);
    const appended = applyLatePlan(base, { mode: "append", drafts: [...base.entries.map(e => e.draft), d("m1"), d("m2")] });
    expect(appended.entries.map(e => e.key)).toEqual(["offer-0", "offer-1", "offer-2", "offer-3"]);
    expect(appended.entries[0].draft).toBe(base.entries[0].draft);
    const replaced = applyLatePlan(base, { mode: "replace", drafts: [d("n1")] });
    expect(replaced.entries.map(e => e.key)).toEqual(["offer-2"]);
    expect(replaceOffers(base, [d("z")]).entries[0].key).not.toBe("offer-0");
  });
});

describe("publish gate", () => {
  it.each([
    [{ isLoading: true, isAuthenticated: false, me: undefined }, "Checking your account…"],
    [{ isLoading: false, isAuthenticated: false, me: null }, "Sign in to publish."],
    [{ isLoading: false, isAuthenticated: true, me: undefined }, "Checking your profile…"],
    [{ isLoading: false, isAuthenticated: true, me: null }, "Create your profile first (open Profile), then publish."],
  ] as [GateInput, string][])("blocks %j", (input, message) => expect(publishGateMessage(input)).toBe(message));
  it("allows a signed-in user with a profile only", () => expect(publishGateMessage(signedIn)).toBeNull());
});

describe("exact deals.create arguments", () => {
  it("built from real canonical publish fields: only the create arguments, source from the owned item, no author or counts", () => {
    const fields = buildPublishFields(confirmed());
    const args = toCreateArgs(fields, ITEM);
    expect(args).toEqual({
      restaurant: "Cafe", dealText: "Lunch special", validDays: ["mon"], conditions: ["dine-in"], lat: 49.28, lng: -123.12,
      address: "1 Fixture St", priceCad: 9.5, validStart: "11:00", validEnd: "14:00", expiresOn: "2026-12-31", sourceUrl: ITEM.sourceUrl,
    });
    for (const forbidden of ["authorId", "stillOnCount", "expiredCount", "confidence", "imageId", "videoId"]) expect(forbidden in args).toBe(false);
    expect(args.sourceUrl).not.toBe("https://example.invalid/draft-source"); // the owned item's link wins
  });
  it("omits every absent optional instead of sending null, and converts explicit nulls to omission", () => {
    const minimal = toCreateArgs({ restaurant: "R", dealText: "D", validDays: [], conditions: [], lat: 49, lng: -123 } as PublishFields, { sourceUrl: ITEM.sourceUrl });
    expect(Object.keys(minimal).sort()).toEqual(["conditions", "dealText", "lat", "lng", "restaurant", "sourceUrl", "validDays"]);
    const withNulls = toCreateArgs({ restaurant: "R", dealText: "D", validDays: [], conditions: [], lat: 49, lng: -123, address: null, priceCad: null, validStart: null, validEnd: null, expiresOn: null, imageId: null } as unknown as PublishFields, ITEM);
    expect(Object.values(withNulls).some(v => v === null || v === undefined)).toBe(false);
    expect("imageId" in withNulls).toBe(false);
  });
  it("never lets the uploaded video id become the image id, and validates an image id's shape first", () => {
    const base = { restaurant: "R", dealText: "D", validDays: [], conditions: [], lat: 49, lng: -123 };
    expect(() => toCreateArgs({ ...base, imageId: ITEM.videoId } as PublishFields, ITEM)).toThrow(PublishBindingError);
    expect(() => toCreateArgs({ ...base, imageId: "bad id!" } as PublishFields, ITEM)).toThrow(PublishBindingError);
    expect(() => toCreateArgs({ ...base, imageId: 5 } as unknown as PublishFields, ITEM)).toThrow(PublishBindingError);
    expect(toCreateArgs({ ...base, imageId: "kg2ownedimagestorage0000001" } as PublishFields, ITEM).imageId).toBe("kg2ownedimagestorage0000001");
  });
});

describe("review-level publish preconditions", () => {
  const ok = { available: true, unavailableReason: "unavailable", alreadyPublished: false, versionChanged: false, inFlight: false, offerExists: true };
  it("passes only when everything is clear", () => expect(publishPreconditionError(ok)).toBeNull());
  it.each([
    [{ available: false }, "unavailable"], [{ alreadyPublished: true }, "already published"], [{ versionChanged: true }, "changed elsewhere"],
    [{ inFlight: true }, "already in progress"], [{ offerExists: false }, "no longer in this review"],
  ] as [Partial<typeof ok>, string][])("refuses %j", (over, text) => expect(publishPreconditionError({ ...ok, ...over })).toContain(text));
  it("reports an unavailable publish before anything else", () => expect(publishPreconditionError({ ...ok, available: false, alreadyPublished: true, versionChanged: true })).toBe("unavailable"));
});

describe("receipts", () => {
  it("only a genuine canonical-shaped deal id is a receipt, with its real links", () => {
    expect(receiptFor(DEAL_ID)).toEqual({ dealId: DEAL_ID, dealPath: `/deal/${DEAL_ID}`, mapPath: `/map?deal=${DEAL_ID}` });
    for (const bad of [undefined, null, "", "short", "has space in id", "../../etc/passwd", "a".repeat(80), 7, { id: DEAL_ID }]) expect(receiptFor(bad)).toBeNull();
  });
});

describe("publish handler", () => {
  const setup = (over: Partial<{ gate: GateInput; create: (a: CreateArgs) => Promise<unknown> }> = {}) => {
    const create = vi.fn(over.create ?? (async () => DEAL_ID));
    const guard = new PublishGuard();
    return { create, guard, publish: createPublishHandler({ gate: () => over.gate ?? signedIn, create, item: () => ITEM, guard }) };
  };
  const fields = () => buildPublishFields(confirmed());

  it("creates once with the exact arguments and returns the genuine receipt", async () => {
    const s = setup();
    const receipt = await s.publish(fields());
    expect(receipt).toEqual({ dealId: DEAL_ID, dealPath: `/deal/${DEAL_ID}`, mapPath: `/map?deal=${DEAL_ID}` });
    expect(s.create).toHaveBeenCalledTimes(1);
    expect(s.create.mock.calls[0][0]).toEqual(toCreateArgs(fields(), ITEM));
  });
  it.each([
    [{ isLoading: true, isAuthenticated: false, me: undefined }], [{ isLoading: false, isAuthenticated: false, me: null }],
    [{ isLoading: false, isAuthenticated: true, me: undefined }], [{ isLoading: false, isAuthenticated: true, me: null }],
  ] as [GateInput][])("never calls create for gate state %j", async gate => {
    const s = setup({ gate });
    await expect(s.publish(fields())).rejects.toBeInstanceOf(PublishBlocked);
    expect(s.create).not.toHaveBeenCalled();
    expect(s.guard.inFlight).toBe(false);
  });
  it("is single-flight: a double click or a second offer while one is pending makes no second create", async () => {
    let finish!: (id: string) => void;
    const s = setup();
    s.create.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
    const first = s.publish(fields());
    await expect(s.publish(fields())).rejects.toThrow("already in progress");
    expect(s.create).toHaveBeenCalledTimes(1);
    finish(DEAL_ID);
    await expect(first).resolves.toMatchObject({ dealId: DEAL_ID });
    await s.publish(fields()); // allowed again once the first settled
    expect(s.create).toHaveBeenCalledTimes(2);
  });
  it("reports one generic message for any backend failure, leaking nothing, and releases the guard", async () => {
    const s = setup({ create: async () => { throw new Error("ConvexError: Only the author can edit; internal id k57secret"); } });
    const error = await s.publish(fields()).then(() => null, (e: Error) => e);
    expect(error?.message).toBe(GENERIC_PUBLISH_ERROR);
    expect(error?.message).not.toMatch(/author|secret|internal/i);
    // The outcome is unknown after a failed or lost response, so the copy must not claim nothing was published.
    expect(GENERIC_PUBLISH_ERROR).not.toMatch(/nothing was published/i);
    expect(GENERIC_PUBLISH_ERROR).toMatch(/could not be confirmed/i);
    expect(GENERIC_PUBLISH_ERROR).toMatch(/edits are kept/i);
    expect(GENERIC_PUBLISH_ERROR).toMatch(/check the map/i);
    expect(s.guard.inFlight).toBe(false);
  });
  it.each([undefined, null, "", "bad id", 12])("a response that is not a genuine id (%j) is never a receipt", async bad => {
    const s = setup({ create: async () => bad });
    await expect(s.publish(fields())).rejects.toThrow(GENERIC_PUBLISH_ERROR);
  });
  it("a binding refusal (video id as image) surfaces its own message and makes no create call", async () => {
    const s = setup();
    await expect(s.publish({ ...fields(), imageId: ITEM.videoId } as PublishFields)).rejects.toBeInstanceOf(PublishBindingError);
    expect(s.create).not.toHaveBeenCalled();
    expect(s.guard.inFlight).toBe(false);
  });
});

describe("the canonical gate still blocks before any create call", () => {
  it("an unconfirmed offer, a missing location and every typed restriction refuse to build fields", () => {
    expect(() => buildPublishFields(createDraft({ restaurant: "Cafe" }))).toThrow(DraftValidationError);
    const noPin = dealDraftReducer(confirmed(), { type: "INVALIDATE_LOCATION" });
    expect(validateForPublish(noPin).valid).toBe(false);
    // A future start is a hard blocker even if someone marked it resolved; an unresolved unsupported restriction blocks too.
    for (const resolved of [false, true]) {
      const draft = { ...confirmed(), reviewIssues: [{ id: "i1", code: "FUTURE_START", detail: "starts next month", resolved, blocking: true }] } as DealDraft;
      expect(() => buildPublishFields(draft), `FUTURE_START resolved=${resolved}`).toThrow(DraftValidationError);
    }
    const restriction = { ...confirmed(), reviewIssues: [{ id: "i2", code: "UNSUPPORTED_CONSTRAINT", detail: "members only", resolved: false, blocking: true }] } as DealDraft;
    expect(() => buildPublishFields(restriction)).toThrow(DraftValidationError);
  });
  it("a legacy blocking review issue keeps blocking until resolved", () => {
    const open = { ...confirmed(), reviewIssues: [{ id: "legacy", code: "CURRENCY_UNVERIFIED", detail: "unverified currency", resolved: false, blocking: true }] } as DealDraft;
    expect(validateForPublish(open).valid).toBe(false);
  });
  it("editing the restaurant or address invalidates a confirmed pin", () => {
    const edited = dealDraftReducer(confirmed(), { type: "SET_FIELD", field: "address", value: "2 Elsewhere Rd" });
    expect(edited.location?.confirmed ?? false).toBe(false);
  });
});

describe("geocode search binding (explicit Find only)", () => {
  const good = { lat: 49.28, lng: -123.12, label: "Cafe, Vancouver" };
  it("returns genuine candidates, capped at five, dropping anything malformed or out of range", () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ ...good, label: `P${i}` }));
    expect(parseCandidates(six)).toHaveLength(5);
    expect(parseCandidates([good, { lat: NaN, lng: 0, label: "x" }, { lat: 90, lng: 0, label: "pole" }, { lat: 49, lng: 181, label: "far" }, { lat: 49, lng: -123, label: "  " }, null, "x", { lat: "49", lng: -123, label: "s" }])).toEqual([good]);
    expect(parseCandidates([])).toEqual([]); // nothing found stays empty: no guessed pin
    expect(() => parseCandidates({ results: [] })).toThrow(SEARCH_ERROR);
  });
  it("calls the geocoder once per explicit call with the query unchanged, and never on its own", async () => {
    const call = vi.fn(async () => [good]);
    const search = createSearch(call);
    expect(call).not.toHaveBeenCalled();
    expect(await search("Cafe, 1 Fixture St")).toEqual([good]);
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("Cafe, 1 Fixture St");
  });
  const withData = (data: unknown) => Object.assign(new Error("[CONVEX A] secret internals"), { data });
  it("maps only whitelisted geocoder codes to fixed client wording", async () => {
    for (const [code, message] of Object.entries(SEARCH_MESSAGES)) {
      await expect(createSearch(async () => { throw withData({ code, message: "server text" }); })("q"), code).rejects.toThrow(message);
    }
    expect(Object.keys(SEARCH_MESSAGES).sort()).toEqual(["CONFIGURATION_ERROR", "GEOCODE_FAILED", "INVALID_QUERY", "INVALID_RESPONSE", "NOT_SIGNED_IN", "PROVIDER_ERROR", "PROVIDER_TIMEOUT", "PROVIDER_UNAVAILABLE", "RATE_LIMITED"]);
  });
  it("a known code never echoes the server's message: secrets in the body cannot reach the screen", async () => {
    const leaked = "User-Agent DishDeals/1.0 (me@example.invalid) q=private place https://nominatim.example.invalid key=SECRET";
    const error = await createSearch(async () => { throw withData({ code: "RATE_LIMITED", message: leaked, retryAfterMs: 1000 }); })("q").then(() => null, (e: Error) => e);
    expect(error?.message).toBe(SEARCH_MESSAGES.RATE_LIMITED);
    expect(error?.message).not.toMatch(/SECRET|example\.invalid|private place|User-Agent/);
  });
  it("an unknown, missing, non-string or prototype-name code gets the generic message, whatever the body says", async () => {
    const leaked = "SECRET provider body";
    for (const data of [{ code: "SOMETHING_NEW", message: leaked }, { message: leaked }, { code: 5, message: leaked }, { code: "toString", message: leaked }, { code: "__proto__", message: leaked }, { code: "constructor", message: leaked }, null, "SECRET", undefined]) {
      const error = await createSearch(async () => { throw withData(data); })("q").then(() => null, (e: Error) => e);
      expect(error?.message, JSON.stringify(data)).toBe(SEARCH_ERROR);
      expect(error?.message).not.toContain("SECRET");
    }
    await expect(createSearch(async () => { throw new Error("socket reset with the query inside"); })("q")).rejects.toThrow(SEARCH_ERROR);
    await expect(createSearch(async () => "not an array")("q")).rejects.toThrow(SEARCH_ERROR);
  });
});

describe("rendered structure (react-dom/server markup only; not a browser)", () => {
  const reel = (restaurant: string) => ({ restaurant, address: null, dealText: `${restaurant} offer`, price: null, currency: null, validDays: null, validStart: null, validEnd: null, expiresOn: null, conditions: null });
  const item = { draftJson: JSON.stringify([reel("Alpha"), reel("Beta"), reel("Gamma")]), caption: "c", generation: 1, draftRevision: 1, draftEdited: true, status: "ready" };
  const html = renderToStaticMarkup(createElement(CanonicalReelReview, { item, onSave: async () => {}, sourceUrl: ITEM.sourceUrl, onPublish: async () => receiptFor(DEAL_ID)! }));

  it("keeps one review form mounted per offer with stable keys; only the active offer is visible and focusable", () => {
    const wrappers = [...html.matchAll(/<div[^>]*data-offer-key="(offer-\d)"[^>]*>/g)];
    expect(wrappers.map(m => m[1])).toEqual(["offer-0", "offer-1", "offer-2"]);
    expect(html.match(/Review Deal Draft/g)).toHaveLength(3);
    expect(wrappers[0][0]).not.toMatch(/\shidden=""/);
    expect(wrappers[0][0]).not.toMatch(/inert/);
    for (const hidden of wrappers.slice(1)) {
      expect(hidden[0]).toMatch(/\shidden=""/);
      expect(hidden[0]).toMatch(/inert/);
      expect(hidden[0]).toMatch(/aria-hidden="true"/);
    }
  });
  it("shows no publish receipt or community-published claim before a genuine create", () => {
    expect(html).not.toContain("Published to the community");
    expect(html).not.toContain("/deal/");
  });
  it("keeps the private-save controls and the source evidence", () => {
    expect(html).toContain("Save draft privately");
    expect(html).toContain("Source evidence");
  });
});
