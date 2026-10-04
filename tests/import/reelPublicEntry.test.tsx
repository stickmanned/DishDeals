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

  it("explains private save vs. public community publication clearly", () => {
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
    expect(html).toMatch(/publish.*public/i);
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

  it("distinguishes available publish controls from unavailable publish state", () => {
    const item = makeSyntheticItem();

    // Available publish handler
    const availableHtml = renderToStaticMarkup(
      createElement(CanonicalReelReview, {
        item,
        onSave: async () => {},
        sourceUrl: SOURCE_URL,
        onPublish: async () => {},
      })
    );
    expect(availableHtml).toContain("Publish deal");

    // Unavailable publish handler
    const reason = "Publishing is disabled in offline mode.";
    const unavailableHtml = renderToStaticMarkup(
      createElement(CanonicalReelReview, {
        item,
        onSave: async () => {},
        sourceUrl: SOURCE_URL,
        onPublish: undefined,
        publishUnavailableReason: reason,
      })
    );
    expect(unavailableHtml).toContain(reason);
    expect(unavailableHtml).toContain("Save draft privately");
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

  it("renders public deal entry panel with anchor link and encoded /post link", async () => {
    const { ReelIntake } = await import("../../components/reels/ReelIntake");
    const html = renderToStaticMarkup(
      createElement(ReelIntake, { itemId: "reel-fixture-0001" })
    );

    // 1. Clear public deal entry and explanation of private save vs public publication
    expect(html).toMatch(/public deal entry/i);
    expect(html).toMatch(/private save vs\.? public deal/i);

    // 2. Direct review anchor #reel-deal-review
    expect(html).toContain('href="#reel-deal-review"');

    // 3. Link to /post?source=<encoded sourceUrl>
    expect(html).toContain(`/post?source=${ENCODED_SOURCE}`);

    // 4. Recording is described as optional with accurate copy (link alone supplies no facts)
    expect(html).toMatch(/attach.*recording.*\(optional\)/i);
    expect(html).toMatch(/link alone supplies no facts|link alone is never analyzed|link alone cannot be analyzed/i);
  });
});
