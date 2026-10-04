// Synthetic regression tests for public-deal entry from private Reel saves.
// Rendered via react-dom/server SSR markup (not a browser, not WKWebView, not a phone, no network/cloud).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanonicalReelReview } from "../../components/reels/CanonicalReelReview";
import type { Doc, Id } from "../../convex/_generated/dataModel";

const SOURCE_URL = "https://www.instagram.com/reel/C9_deal123/";
const ENCODED_SOURCE = encodeURIComponent(SOURCE_URL);

let mockGetItem: Doc<"reelItems"> | null = null;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isLoading: false, isAuthenticated: true }),
  useMutation: () => vi.fn().mockResolvedValue({}),
  useQuery: (_fn: unknown, args: unknown) => {
    const a = args as { itemId?: string } | undefined;
    return a?.itemId ? mockGetItem : [];
  },
  useAction: () => vi.fn().mockResolvedValue([]),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: vi.fn(), signOut: vi.fn() }),
  useConvexAuth: () => ({ fetchAccessToken: vi.fn().mockResolvedValue("fake-token") }),
}));

// Path aliases for vitest
vi.mock("@/convex/_generated/api", async () => import("../../convex/_generated/api"));
vi.mock("@/lib/nativeSession", async () => import("../../lib/nativeSession"));
vi.mock("@/lib/reels/suppliedMedia", async () => import("../../lib/reels/suppliedMedia"));
vi.mock("@/lib/reels/publish", async () => import("../../lib/reels/publish"));
vi.mock("@/lib/reels/contract", async () => import("../../lib/reels/contract"));

// DOM parsing helper for rendered <button> elements in SSR markup
interface RenderedButton {
  tag: string;
  type: string;
  className: string;
  text: string;
  disabled: boolean;
  rawAttrs: string;
}

function parseButtons(html: string): RenderedButton[] {
  const matches = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)];
  return matches.map((m) => {
    const rawAttrs = m[1];
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    const typeMatch = /type=["']([^"']+)["']/i.exec(rawAttrs);
    const classMatch = /class(?:Name)?=["']([^"']+)["']/i.exec(rawAttrs);
    return {
      tag: "button",
      type: typeMatch ? typeMatch[1] : "",
      className: classMatch ? classMatch[1] : "",
      text,
      disabled: /\bdisabled\b/i.test(rawAttrs),
      rawAttrs,
    };
  });
}

function findSubmitPublishButton(buttons: RenderedButton[]): RenderedButton | undefined {
  return buttons.find(
    (b) => b.type === "submit" && b.className.includes("draft-submit") && b.text === "Publish deal"
  );
}

// Synthetic sample item for testing
function makeSyntheticItem(overrides: Partial<Doc<"reelItems">> = {}): Doc<"reelItems"> {
  return {
    _id: "reel-fixture-0001" as unknown as Id<"reelItems">,
    _creationTime: 1728000000000,
    updatedAt: 1728000000000,
    ownerId: "user-fixture-0001" as unknown as Id<"users">,
    sourceUrl: SOURCE_URL,
    videoId: "video-fixture-0001" as unknown as Id<"_storage">,
    status: "ready",
    sourceKind: "supplied" as const,
    attempts: 0,
    expiresAt: Date.now() + 7 * 86400000,
    draftJson: JSON.stringify([
      {
        restaurant: "Sample Bistro",
        dealText: "Half price appetizers",
        address: "123 Main St",
        price: 10,
        currency: "CAD",
        validDays: ["mon", "tue"],
        validStart: "15:00",
        validEnd: "18:00",
        expiresOn: "2026-12-31",
        conditions: ["dine-in"],
      },
    ]),
    caption: "Check out this great deal!",
    generation: 1,
    draftRevision: 1,
    draftEdited: false,
    ...overrides,
  };
}

describe("CanonicalReelReview public entry and copy (SSR markup; not a phone)", () => {
  it("provides direct review anchor id='reel-deal-review' for jumping from private save result", () => {
    const item = makeSyntheticItem();
    const html = renderToStaticMarkup(
      createElement(CanonicalReelReview, {
        item,
        onSave: async () => {},
        sourceUrl: SOURCE_URL,
        onPublish: async () => {},
      })
    );
    expect(html).toContain('id="reel-deal-review"');
  });

  it("explains private save vs. public community publication clearly with pending feed integration copy", () => {
    const item = makeSyntheticItem();
    const html = renderToStaticMarkup(
      createElement(CanonicalReelReview, {
        item,
        onSave: async () => {},
        sourceUrl: SOURCE_URL,
        onPublish: async () => {},
      })
    );
    // Discloses that saving keeps the draft private, while publishing makes the deal public
    expect(html).toMatch(/private save vs\.? public deal/i);
    expect(html).toMatch(/private to your account/i);
    expect(html).toMatch(/community deal on the map and deal detail page/i);
    expect(html).toMatch(/feed integration is pending until resolved/i);
    // Verifies broken live Discover feed is not promised as immediately active
    expect(html).not.toMatch(/for everyone on the Discover feed/i);
  });

  it("renders encoded provenance link to standard /post form (/post?source=...)", () => {
    const item = makeSyntheticItem();
    const html = renderToStaticMarkup(
      createElement(CanonicalReelReview, {
        item,
        onSave: async () => {},
        sourceUrl: SOURCE_URL,
        onPublish: async () => {},
      })
    );
    expect(html).toContain(`/post?source=${ENCODED_SOURCE}`);
  });

  describe("Publish affordance: button rendering and gating states (DOM parsed; not bare copy)", () => {
    it("MUST render actual submit <button> element with draft-submit class when onPublish is provided with no reason", () => {
      const item = makeSyntheticItem();
      const html = renderToStaticMarkup(
        createElement(CanonicalReelReview, {
          item,
          onSave: async () => {},
          sourceUrl: SOURCE_URL,
          onPublish: async () => {},
          publishUnavailableReason: undefined,
        })
      );

      const buttons = parseButtons(html);
      const submitBtn = findSubmitPublishButton(buttons);

      expect(submitBtn).toBeDefined();
      expect(submitBtn?.tag).toBe("button");
      expect(submitBtn?.type).toBe("submit");
      expect(submitBtn?.className).toContain("draft-submit");
      expect(submitBtn?.className).toContain("button primary");
      expect(submitBtn?.text).toBe("Publish deal");
      expect(submitBtn?.disabled).toBe(false);
    });

    it("must NOT render submit button when onPublish is undefined (no-handler default unavailable)", () => {
      const item = makeSyntheticItem();
      const html = renderToStaticMarkup(
        createElement(CanonicalReelReview, {
          item,
          onSave: async () => {},
          sourceUrl: SOURCE_URL,
          onPublish: undefined,
          publishUnavailableReason: undefined,
        })
      );

      const buttons = parseButtons(html);
      const submitBtn = findSubmitPublishButton(buttons);

      // Submit button is NOT rendered
      expect(submitBtn).toBeUndefined();
      expect(buttons.some((b) => b.text === "Publish deal")).toBe(false);

      // Default unavailable message is rendered instead
      expect(html).toContain("Community deal publishing is not available in this view. You can save this draft privately.");
      // Private save action is preserved
      expect(html).toContain("Save draft privately");
    });

    it("must NOT render submit button when onPublish is provided with explicit signed-out reason", () => {
      const item = makeSyntheticItem();
      const signedOutReason = "Sign in to publish.";
      const html = renderToStaticMarkup(
        createElement(CanonicalReelReview, {
          item,
          onSave: async () => {},
          sourceUrl: SOURCE_URL,
          onPublish: async () => {},
          publishUnavailableReason: signedOutReason,
        })
      );

      const buttons = parseButtons(html);
      const submitBtn = findSubmitPublishButton(buttons);

      expect(submitBtn).toBeUndefined();
      expect(buttons.some((b) => b.text === "Publish deal")).toBe(false);
      expect(html).toContain(signedOutReason);
    });

    it("must NOT render submit button when onPublish is provided with explicit profile-pending reason", () => {
      const item = makeSyntheticItem();
      const profileReason = "Create your profile first (open Profile), then publish.";
      const html = renderToStaticMarkup(
        createElement(CanonicalReelReview, {
          item,
          onSave: async () => {},
          sourceUrl: SOURCE_URL,
          onPublish: async () => {},
          publishUnavailableReason: profileReason,
        })
      );

      const buttons = parseButtons(html);
      const submitBtn = findSubmitPublishButton(buttons);

      expect(submitBtn).toBeUndefined();
      expect(buttons.some((b) => b.text === "Publish deal")).toBe(false);
      expect(html).toContain(profileReason);
    });

    it("regression mutation revert guard: catches false-pass from explanatory copy when publish button is absent", () => {
      const item = makeSyntheticItem();
      // Simulate the original bug state: where publishUnavailableReason was defaulted to a string in CanonicalReelReview,
      // suppressing DealReviewForm's submit button even when onPublish was passed.
      const simulatedBugHtml = renderToStaticMarkup(
        createElement(CanonicalReelReview, {
          item,
          onSave: async () => {},
          sourceUrl: SOURCE_URL,
          onPublish: async () => {},
          publishUnavailableReason: "Community deal publishing is not available in this view. You can save this draft privately.",
        })
      );

      // Naive string check false-passes because explanatory copy contains "Publish deal"
      expect(simulatedBugHtml.includes("Publish deal")).toBe(true);

      // DOM parsing correctly detects that NO actual submit button tag exists in this state
      const buttons = parseButtons(simulatedBugHtml);
      const submitBtn = findSubmitPublishButton(buttons);
      expect(submitBtn).toBeUndefined();
    });
  });
});

describe("ReelIntake public entry from owned Reel result (SSR markup; not a phone)", () => {
  beforeEach(() => {
    mockGetItem = makeSyntheticItem();
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://proper-marmot-82.ca-central-1.convex.cloud");
    vi.stubEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "https://proper-marmot-82.ca-central-1.convex.site");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders public deal entry panel with anchor link, encoded /post link, and pending feed copy", async () => {
    const { ReelIntake } = await import("../../components/reels/ReelIntake");
    const html = renderToStaticMarkup(
      createElement(ReelIntake, { itemId: "reel-fixture-0001" })
    );

    // 1. Clear public deal entry and explanation of private save vs public publication
    expect(html).toMatch(/public deal entry/i);
    expect(html).toMatch(/private save vs\.? public deal/i);
    expect(html).toMatch(/community deal on the map and deal detail page/i);
    expect(html).toMatch(/feed integration is pending until resolved/i);
    expect(html).not.toMatch(/for everyone on the Discover feed/i);

    // 2. Direct review anchor #reel-deal-review
    expect(html).toContain('href="#reel-deal-review"');

    // 3. Link to /post?source=<encoded sourceUrl>
    expect(html).toContain(`/post?source=${ENCODED_SOURCE}`);

    // 4. Recording is described as optional with accurate copy (link alone supplies no facts)
    expect(html).toMatch(/attach.*recording.*\(optional\)/i);
    expect(html).toMatch(/link alone supplies no facts|link alone is never analyzed|link alone cannot be analyzed/i);
  });

  it("renders distinct copy and links for Instagram Post vs Reel vs unknown sources", async () => {
    const { ReelIntake } = await import("../../components/reels/ReelIntake");

    // Case 1: Instagram Post (/p/)
    mockGetItem = makeSyntheticItem({ sourceUrl: "https://www.instagram.com/p/POST12345/" });
    const postHtml = renderToStaticMarkup(
      createElement(ReelIntake, { itemId: "reel-fixture-0001" })
    );
    expect(postHtml).toContain(">Original Post</a>");
    expect(postHtml).toContain("This saved post is private to your account.");

    // Case 2: Instagram Reel (/reel/)
    mockGetItem = makeSyntheticItem({ sourceUrl: "https://www.instagram.com/reel/REEL12345/" });
    const reelHtml = renderToStaticMarkup(
      createElement(ReelIntake, { itemId: "reel-fixture-0001" })
    );
    expect(reelHtml).toContain(">Original Reel</a>");
    expect(reelHtml).toContain("This saved Reel is private to your account.");

    // Case 3: Unknown / historical row
    mockGetItem = makeSyntheticItem({ sourceUrl: "https://example.com/other" });
    const unknownHtml = renderToStaticMarkup(
      createElement(ReelIntake, { itemId: "reel-fixture-0001" })
    );
    expect(unknownHtml).toContain(">Original Post or Reel</a>");
    expect(unknownHtml).toContain("This saved post or Reel is private to your account.");
  });
});
