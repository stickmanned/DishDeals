import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  classifyDealSource,
  formatDealExpiryPolicy,
  MyPublishedDeals,
} from "../../components/deals/MyPublishedDeals";
import type { Doc, Id } from "../../convex/_generated/dataModel";

// Mock convex/react hooks
let mockAuthState = { isLoading: false, isAuthenticated: true };
let mockDealsState: Array<Doc<"deals"> & { imageUrl: string | null }> | undefined = [];
let mockLastQueryArgs: unknown = undefined;

vi.mock("convex/react", () => ({
  useConvexAuth: () => mockAuthState,
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

describe("classifyDealSource (posts vs Reels strict URL classification)", () => {
  it("accurately classifies valid HTTPS Instagram Reel URLs with anchored shortcode", () => {
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

  it("accurately classifies valid HTTPS Instagram Post URLs (/p/) with anchored shortcode", () => {
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

  it("classifies generic Instagram URLs on exact hosts without guessing original kind", () => {
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

  it("safely rejects credentials, ports, non-HTTPS, or invalid schemes without creating clickable hrefs", () => {
    // Credentials in URL
    expect(classifyDealSource("https://user:pass@instagram.com/reel/C9_deal123/")).toEqual({
      kind: "direct_post",
      label: "Direct post",
    });
    // Non-standard port
    expect(classifyDealSource("https://instagram.com:8080/reel/C9_deal123/")).toEqual({
      kind: "direct_post",
      label: "Direct post",
    });
    // Plain HTTP
    expect(classifyDealSource("http://instagram.com/reel/C9_deal123/")).toEqual({
      kind: "direct_post",
      label: "Direct post",
    });
    // Dangerous schemes
    expect(classifyDealSource("javascript:alert(1)")).toEqual({
      kind: "direct_post",
      label: "Direct post",
    });
    expect(classifyDealSource("data:text/html,<h1>XSS</h1>")).toEqual({
      kind: "direct_post",
      label: "Direct post",
    });
  });

  it("classifies safe external HTTPS links", () => {
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

describe("formatDealExpiryPolicy (verbatim expiresOn & confirmed 7-day policy copy)", () => {
  it("shows retained indefinitely copy for missing or empty expiry", () => {
    expect(formatDealExpiryPolicy(undefined)).toEqual({
      hasExpiry: false,
      policyText: "No expiration date (retained indefinitely)",
    });
    expect(formatDealExpiryPolicy(null)).toEqual({
      hasExpiry: false,
      policyText: "No expiration date (retained indefinitely)",
    });
    expect(formatDealExpiryPolicy("")).toEqual({
      hasExpiry: false,
      policyText: "No expiration date (retained indefinitely)",
    });
    expect(formatDealExpiryPolicy("   ")).toEqual({
      hasExpiry: false,
      policyText: "No expiration date (retained indefinitely)",
    });
  });

  it("shows expiresOn verbatim and 7-day auto-deletion policy copy for provided expiry", () => {
    const result = formatDealExpiryPolicy("2026-10-04");
    expect(result.hasExpiry).toBe(true);
    expect(result.expiresOnVerbatim).toBe("2026-10-04");
    expect(result.policyText).toBe(
      "Expires on 2026-10-04 (auto-deleted 7 calendar days after expiry in America/Vancouver)",
    );
  });
});

describe("MyPublishedDeals component rendering (read-only list, no delete UI)", () => {
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

  it("renders published deals with read-only list/detail/edit links and NO delete mutation UI", () => {
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
        expiresOn: "2026-09-01",
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

    // Expiry verbatim and policy text
    expect(html).toContain("Expires: 2026-10-04");
    expect(html).toContain("auto-deleted 7 calendar days after expiry in America/Vancouver");
    expect(html).toContain("No expiration date (retained indefinitely)");

    // Read-only navigation links: detail and edit
    expect(html).toContain('/deal/deal_reel_1');
    expect(html).toContain('/deal/deal_reel_1/edit');
    expect(html).toContain('/deal/deal_post_2');
    expect(html).toContain('/deal/deal_post_2/edit');
    expect(html).toContain('/deal/deal_manual_3');
    expect(html).toContain('/deal/deal_manual_3/edit');

    // Confirm NO delete mutation UI or delete buttons exist (read-only list)
    expect(html).not.toContain("Delete deal");
    expect(html).not.toContain("Delete (locked)");
    expect(html).not.toContain("Confirm delete");
  });
});
