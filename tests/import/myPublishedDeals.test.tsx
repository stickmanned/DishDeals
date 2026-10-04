import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyDealSource,
  formatDealExpiryPolicy,
  MyPublishedDeals,
  PublishedDealsErrorBoundary,
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

const ORIGINAL_CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_CONVEX_URL = "https://proper-marmot-82.convex.cloud";
  mockAuthState = { isLoading: false, isAuthenticated: true };
  mockDealsState = [];
  mockLastQueryArgs = undefined;
});

afterEach(() => {
  if (ORIGINAL_CONVEX_URL !== undefined) {
    process.env.NEXT_PUBLIC_CONVEX_URL = ORIGINAL_CONVEX_URL;
  } else {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
  }
});

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

describe("classifyDealSource (exact anchored regex: /p|reel|reels/[A-Za-z0-9_-]{5,64}/?$)", () => {
  it("accurately classifies valid HTTPS Instagram Reel URLs with anchored shortcode (5-64 chars)", () => {
    expect(classifyDealSource("https://www.instagram.com/reel/C9_deal123/")).toEqual({
      kind: "instagram_reel",
      label: "Instagram Reel",
      url: "https://www.instagram.com/reel/C9_deal123/",
    });
    expect(classifyDealSource("https://instagram.com/reels/C9_deal123")).toEqual({
      kind: "instagram_reel",
      label: "Instagram Reel",
      url: "https://instagram.com/reels/C9_deal123",
    });
    expect(classifyDealSource("https://m.instagram.com/reel/12345/")).toEqual({
      kind: "instagram_reel",
      label: "Instagram Reel",
      url: "https://m.instagram.com/reel/12345/",
    });
  });

  it("accurately classifies valid HTTPS Instagram Post URLs (/p/) with anchored shortcode (5-64 chars)", () => {
    expect(classifyDealSource("https://www.instagram.com/p/DA_post987/")).toEqual({
      kind: "instagram_post",
      label: "Instagram Post",
      url: "https://www.instagram.com/p/DA_post987/",
    });
    expect(classifyDealSource("https://instagram.com/p/DA_post987")).toEqual({
      kind: "instagram_post",
      label: "Instagram Post",
      url: "https://instagram.com/p/DA_post987",
    });
  });

  it("falls back to generic Instagram source when path suffix is present (no path suffix allowed)", () => {
    // Has extra path suffix: /comments or /embed
    expect(classifyDealSource("https://www.instagram.com/reel/C9_deal123/comments")).toEqual({
      kind: "instagram_generic",
      label: "Instagram source",
      url: "https://www.instagram.com/reel/C9_deal123/comments",
    });
    expect(classifyDealSource("https://instagram.com/p/DA_post987/extra/path")).toEqual({
      kind: "instagram_generic",
      label: "Instagram source",
      url: "https://instagram.com/p/DA_post987/extra/path",
    });
  });

  it("falls back to generic Instagram source when shortcode is outside 5-64 chars bound", () => {
    // 4 chars: too short
    expect(classifyDealSource("https://www.instagram.com/reel/1234/")).toEqual({
      kind: "instagram_generic",
      label: "Instagram source",
      url: "https://www.instagram.com/reel/1234/",
    });
  });

  it("safely rejects credentials, ports, non-HTTPS, or invalid schemes without creating clickable hrefs", () => {
    expect(classifyDealSource("https://user:pass@instagram.com/reel/C9_deal123/")).toEqual({
      kind: "direct_post",
      label: "Direct post",
    });
    expect(classifyDealSource("https://instagram.com:8080/reel/C9_deal123/")).toEqual({
      kind: "direct_post",
      label: "Direct post",
    });
    expect(classifyDealSource("http://instagram.com/reel/C9_deal123/")).toEqual({
      kind: "direct_post",
      label: "Direct post",
    });
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
  });
});

describe("formatDealExpiryPolicy (verbatim expiresOn & confirmed 7-day policy copy)", () => {
  it("shows retained indefinitely copy for missing or empty expiry", () => {
    expect(formatDealExpiryPolicy(undefined)).toEqual({
      hasExpiry: false,
      policyText: "No expiration date (retained indefinitely)",
    });
    expect(formatDealExpiryPolicy("")).toEqual({
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

describe("PublishedDealsErrorBoundary (nested error boundary around authored list)", () => {
  it("renders children when no error has occurred", () => {
    const html = renderToStaticMarkup(
      createElement(
        PublishedDealsErrorBoundary,
        null,
        createElement("div", { id: "child-content" }, "Authored deals content"),
      ),
    );
    expect(html).toContain('id="child-content"');
    expect(html).toContain("Authored deals content");
    expect(html).not.toContain("Couldn’t load your published deals");
  });

  it("catches error transition, renders generic error message with Retry button, and triggers onRetry callback", () => {
    let retried = false;
    const boundary = new PublishedDealsErrorBoundary({
      children: createElement("div", null, "Initial"),
      onRetry: () => {
        retried = true;
      },
    });

    expect(boundary.state).toEqual({ hasError: false });

    // Simulate error transition caught by React error boundary lifecycle
    const derived = PublishedDealsErrorBoundary.getDerivedStateFromError();
    expect(derived).toEqual({ hasError: true });

    // Boundary enters error state
    boundary.state = derived;
    const errorMarkup = renderToStaticMarkup(boundary.render() as React.ReactElement);

    expect(errorMarkup).toContain("Couldn’t load your published deals");
    expect(errorMarkup).toContain("Please check your connection and try again.");
    expect(errorMarkup).toContain("Retry");

    // Clicking Retry resets boundary state and notifies host to remount query
    boundary.setState = vi.fn().mockImplementation((stateUpdate: unknown) => {
      const next = typeof stateUpdate === "function" ? (stateUpdate as (s: unknown) => unknown)(boundary.state) : stateUpdate;
      boundary.state = { ...boundary.state, ...(next as object) };
    }) as unknown as typeof boundary.setState;

    const rendered = boundary.render() as React.ReactElement<{
      children: [
        unknown,
        unknown,
        React.ReactElement<{ children: React.ReactElement<{ onClick: () => void }> }>
      ];
    }>;
    const button = rendered.props.children[2].props.children;
    button.props.onClick();

    expect(boundary.state.hasError).toBe(false);
    expect(retried).toBe(true);
  });
});

describe("MyPublishedDeals unconfigured backend guard", () => {
  it("renders backend unconfigured notice BEFORE any Convex hook runs when NEXT_PUBLIC_CONVEX_URL is unset", () => {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
    const html = renderToStaticMarkup(createElement(MyPublishedDeals));
    expect(html).toContain("The live deal service is not connected here");
    expect(html).toContain('id="your-posts"');
    // Ensure no Convex query ran
    expect(mockLastQueryArgs).toBeUndefined();
  });
});

describe("MyPublishedDeals component rendering (read-only list, no delete UI, community map/detail copy)", () => {
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

  it("renders empty state mentioning community map and detail page (no live feed mention)", () => {
    mockAuthState = { isLoading: false, isAuthenticated: true };
    mockDealsState = [];

    const html = renderToStaticMarkup(createElement(MyPublishedDeals));
    expect(html).toContain("You haven’t published any deals yet");
    expect(html).toContain("community map and detail page");
    expect(html).not.toContain("feed"); // Verified no live feed mention
  });

  it("renders published deals with read-only list/detail/edit links, section id, and NO delete mutation UI", () => {
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
    ];

    const html = renderToStaticMarkup(createElement(MyPublishedDeals));

    // Anchored section id for jump link navigation
    expect(html).toContain('id="your-posts"');

    // Restaurant names
    expect(html).toContain("Phở Hòa");
    expect(html).toContain("Saku Pork Cutlet");

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

    // Expiry verbatim and policy text
    expect(html).toContain("Expires: 2026-10-04");
    expect(html).toContain("auto-deleted 7 calendar days after expiry in America/Vancouver");
    expect(html).toContain("No expiration date (retained indefinitely)");

    // Read-only navigation links: detail and edit
    expect(html).toContain('/deal/deal_reel_1');
    expect(html).toContain('/deal/deal_reel_1/edit');
    expect(html).toContain('/deal/deal_post_2');
    expect(html).toContain('/deal/deal_post_2/edit');

    // Confirm NO delete mutation UI or delete buttons exist (read-only list)
    expect(html).not.toContain("Delete deal");
    expect(html).not.toContain("Delete (locked)");
    expect(html).not.toContain("Confirm delete");

    // Copy confirms community map and detail page, not feed
    expect(html).toContain("community map and detail page");
    expect(html).not.toContain("feed");
  });
});
