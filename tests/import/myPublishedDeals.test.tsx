import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  classifyDealSource,
  getDealRetentionInfo,
  getVancouverIsoDate,
  MyPublishedDeals,
} from "../../components/deals/MyPublishedDeals";
import type { Doc, Id } from "../../convex/_generated/dataModel";

// Mock convex/react hooks
let mockAuthState = { isLoading: false, isAuthenticated: true };
let mockDealsState: Array<Doc<"deals"> & { imageUrl: string | null }> | undefined = [];
let mockLastQueryArgs: unknown = undefined;

vi.mock("convex/react", () => ({
  useConvexAuth: () => mockAuthState,
  useMutation: () => vi.fn().mockResolvedValue(null),
  useQuery: (_queryRef: unknown, args: unknown) => {
    mockLastQueryArgs = args;
    if (args === "skip") return undefined;
    return mockDealsState;
  },
}));

vi.mock("@/convex/_generated/api", async () => import("../../convex/_generated/api"));

function sampleDeal(overrides: Partial<Doc<"deals"> & { imageUrl: string | null }> = {}) {
  return {
    _id: "deal_12345678" as Id<"deals">,
    _creationTime: 1728000000000,
    authorId: "user_author_1" as Id<"users">,
    restaurant: "Marutama Ramen",
    dealText: "Half price gyoza with ramen order",
    priceCad: 6.5,
    validDays: ["mon", "tue"],
    validStart: "14:00",
    validEnd: "17:00",
    expiresOn: "2026-10-04",
    conditions: ["Dine-in only"],
    lat: 49.2827,
    lng: -123.1207,
    stillOnCount: 5,
    expiredCount: 0,
    imageUrl: "https://example.com/photo.jpg",
    sourceUrl: "https://www.instagram.com/reel/DA123456789/",
    ...overrides,
  };
}

describe("classifyDealSource (posts vs Reels classification)", () => {
  it("accurately classifies Instagram Reel URLs", () => {
    expect(classifyDealSource("https://www.instagram.com/reel/C9_deal123/")).toEqual({
      kind: "instagram_reel",
      label: "Instagram Reel",
      url: "https://www.instagram.com/reel/C9_deal123/",
    });
    expect(classifyDealSource("https://instagram.com/reels/C9_deal123/?igsh=xyz")).toEqual({
      kind: "instagram_reel",
      label: "Instagram Reel",
      url: "https://instagram.com/reels/C9_deal123/?igsh=xyz",
    });
    expect(classifyDealSource("https://m.instagram.com/reel/C9_deal123/")).toEqual({
      kind: "instagram_reel",
      label: "Instagram Reel",
      url: "https://m.instagram.com/reel/C9_deal123/",
    });
  });

  it("accurately classifies Instagram Post URLs (/p/)", () => {
    expect(classifyDealSource("https://www.instagram.com/p/DA_post987/")).toEqual({
      kind: "instagram_post",
      label: "Instagram Post",
      url: "https://www.instagram.com/p/DA_post987/",
    });
    expect(classifyDealSource("https://instagram.com/p/DA_post987/")).toEqual({
      kind: "instagram_post",
      label: "Instagram Post",
      url: "https://instagram.com/p/DA_post987/",
    });
    expect(classifyDealSource("https://m.instagram.com/p/DA_post987/")).toEqual({
      kind: "instagram_post",
      label: "Instagram Post",
      url: "https://m.instagram.com/p/DA_post987/",
    });
  });

  it("classifies generic or non-/p/ /reel/ Instagram URLs without guessing", () => {
    expect(classifyDealSource("https://www.instagram.com/explore/locations/123/")).toEqual({
      kind: "instagram_generic",
      label: "Instagram source",
      url: "https://www.instagram.com/explore/locations/123/",
    });
    expect(classifyDealSource("https://instagram.com/someuser")).toEqual({
      kind: "instagram_generic",
      label: "Instagram source",
      url: "https://instagram.com/someuser",
    });
  });

  it("classifies non-Instagram links as external links", () => {
    expect(classifyDealSource("https://example.com/specials/gyoza")).toEqual({
      kind: "external_link",
      label: "External link",
      url: "https://example.com/specials/gyoza",
    });
  });

  it("classifies missing or empty source URLs as direct posts", () => {
    expect(classifyDealSource(undefined)).toEqual({ kind: "direct_post", label: "Direct post" });
    expect(classifyDealSource(null)).toEqual({ kind: "direct_post", label: "Direct post" });
    expect(classifyDealSource("")).toEqual({ kind: "direct_post", label: "Direct post" });
    expect(classifyDealSource("   ")).toEqual({ kind: "direct_post", label: "Direct post" });
  });
});

describe("getDealRetentionInfo (Vancouver local 7-day retention rule)", () => {
  it("treats missing or invalid expiresOn as unknown expiry retained indefinitely", () => {
    const unknown1 = getDealRetentionInfo(undefined, new Date("2026-10-04T12:00:00Z"));
    expect(unknown1.hasExpiry).toBe(false);
    expect(unknown1.isEligibleForDeletion).toBe(false);
    expect(unknown1.statusLabel).toContain("No expiration date");
    expect(unknown1.retentionNote).toContain("retained indefinitely");

    const unknown2 = getDealRetentionInfo("invalid-date", new Date("2026-10-04T12:00:00Z"));
    expect(unknown2.hasExpiry).toBe(false);
    expect(unknown2.isEligibleForDeletion).toBe(false);
  });

  it("treats active deals on expiresOn date as active and not eligible for deletion", () => {
    // 2026-10-04 15:00 UTC = 2026-10-04 08:00 Vancouver
    const now = new Date("2026-10-04T15:00:00Z");
    const info = getDealRetentionInfo("2026-10-04", now);
    expect(info.hasExpiry).toBe(true);
    expect(info.isExpired).toBe(false);
    expect(info.isEligibleForDeletion).toBe(false);
    expect(info.deletionDateVancouver).toBe("2026-10-12");
    expect(info.statusLabel).toContain("Expires on 2026-10-04");
    expect(info.retentionNote).toContain("Retained for 7 calendar days after expiry");
  });

  it("treats deals within the 7 calendar days after expiresOn as expired but NOT eligible for deletion", () => {
    // Day 7 after Oct 4 is Oct 11.
    // 2026-10-11 23:00 Vancouver = 2026-10-12 06:00 UTC
    const nowWithinRetention = new Date("2026-10-12T06:00:00Z"); // Oct 11 23:00 Vancouver
    expect(getVancouverIsoDate(nowWithinRetention)).toBe("2026-10-11");

    const info = getDealRetentionInfo("2026-10-04", nowWithinRetention);
    expect(info.isExpired).toBe(true);
    expect(info.isEligibleForDeletion).toBe(false);
    expect(info.deletionDateVancouver).toBe("2026-10-12");
    expect(info.statusLabel).toContain("Expired on 2026-10-04");
    expect(info.retentionNote).toContain("Retained until 2026-10-12");
  });

  it("treats deals 7 full calendar days after expiresOn as eligible for deletion", () => {
    // Exactly Oct 12 00:00 Vancouver = Oct 12 07:00 UTC
    const nowEligible = new Date("2026-10-12T07:00:00Z");
    expect(getVancouverIsoDate(nowEligible)).toBe("2026-10-12");

    const info = getDealRetentionInfo("2026-10-04", nowEligible);
    expect(info.isExpired).toBe(true);
    expect(info.isEligibleForDeletion).toBe(true);
    expect(info.retentionNote).toContain("Eligible for deletion");
  });
});

describe("MyPublishedDeals component rendering", () => {
  it("renders sign-in prompt and skips query when user is signed out", () => {
    mockAuthState = { isLoading: false, isAuthenticated: false };
    mockDealsState = [];
    mockLastQueryArgs = undefined;

    const html = renderToStaticMarkup(createElement(MyPublishedDeals));
    expect(mockLastQueryArgs).toBe("skip");
    expect(html).toContain("Sign in to see your published deals");
    expect(html).toContain('/signin?next=/post');
    expect(html).toContain("Saved Instagram posts/Reels");
    expect(html).toContain('/reels');
  });

  it("renders loading state when authenticated and query is loading", () => {
    mockAuthState = { isLoading: false, isAuthenticated: true };
    mockDealsState = undefined;

    const html = renderToStaticMarkup(createElement(MyPublishedDeals));
    expect(mockLastQueryArgs).toEqual({ limit: 50 });
    expect(html).toContain("Loading your published deals");
  });

  it("renders empty state with link to private saved reels when user has no published deals", () => {
    mockAuthState = { isLoading: false, isAuthenticated: true };
    mockDealsState = [];

    const html = renderToStaticMarkup(createElement(MyPublishedDeals));
    expect(html).toContain("You haven’t published any deals yet");
    expect(html).toContain("Saved Instagram posts/Reels");
    expect(html).toContain('/reels');
    expect(html).toContain("Private saves are separate from public deals");
  });

  it("renders published deals with restaurant, deal text, price, public badge, and source classification", () => {
    mockAuthState = { isLoading: false, isAuthenticated: true };
    mockDealsState = [
      sampleDeal({
        _id: "deal_reel_1" as Id<"deals">,
        restaurant: "Phở Hòa",
        dealText: "$10 Bowl of Pho",
        priceCad: 10,
        sourceUrl: "https://www.instagram.com/reel/C9_reel123/",
        expiresOn: "2026-10-04",
      }),
      sampleDeal({
        _id: "deal_post_2" as Id<"deals">,
        restaurant: "Saku Pork Cutlet",
        dealText: "Free extra curry sauce",
        priceCad: undefined,
        sourceUrl: "https://www.instagram.com/p/C9_post456/",
        expiresOn: undefined,
      }),
      sampleDeal({
        _id: "deal_manual_3" as Id<"deals">,
        restaurant: "Miku Restaurant",
        dealText: "Aburi Salmon Oshi 2-for-1",
        priceCad: 22,
        sourceUrl: undefined,
        expiresOn: "2026-09-01", // Past retention date
      }),
    ];

    const html = renderToStaticMarkup(createElement(MyPublishedDeals));

    // Restaurant names
    expect(html).toContain("Phở Hòa");
    expect(html).toContain("Saku Pork Cutlet");
    expect(html).toContain("Miku Restaurant");

    // Deal text and price
    expect(html).toContain("$10 Bowl of Pho");
    expect(html).toContain("$10.00 CAD");
    expect(html).toContain("Free extra curry sauce");
    expect(html).toContain("Price varies");

    // Public status badges
    expect(html).toContain("Public deal");

    // Source classification
    expect(html).toContain("Instagram Reel");
    expect(html).toContain("Instagram Post");
    expect(html).toContain("Direct post");

    // Links to detail and edit
    expect(html).toContain('/deal/deal_reel_1');
    expect(html).toContain('/deal/deal_reel_1/edit');
    expect(html).toContain('/deal/deal_post_2');
    expect(html).toContain('/deal/deal_post_2/edit');
    expect(html).toContain('/deal/deal_manual_3');
    expect(html).toContain('/deal/deal_manual_3/edit');

    // Deletion gating check
    // deal_reel_1 expires 2026-10-04 -> locked (within retention or active)
    expect(html).toContain("Delete (locked)");
    // deal_manual_3 expired 2026-09-01 -> eligible for deletion (>= 7 calendar days passed)
    expect(html).toContain("Delete deal");
  });
});
