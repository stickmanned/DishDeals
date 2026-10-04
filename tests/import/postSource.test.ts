// Synthetic unit tests for /post?source= provenance parameter handling (N-TEXT-FORM).
// Exercises strict normalization, duplicate/malformed parameter rejection, and safety checks.
import { describe, expect, it } from "vitest";
import { parsePostSourceParam, hasNonUrlText } from "../../lib/postSource";

describe("parsePostSourceParam (synthetic URL validation, no network/provider)", () => {
  it("normalizes a valid Instagram Reel link to canonical https://www.instagram.com/reel/<shortcode>/", () => {
    const valid = "https://www.instagram.com/reel/C9_deal123/";
    expect(parsePostSourceParam(valid)).toBe("https://www.instagram.com/reel/C9_deal123/");
  });

  it("normalizes a valid Instagram Post link (/p/) to canonical /reel/ format", () => {
    const postLink = "https://instagram.com/p/C9_deal123/?igsh=abcdef123";
    expect(parsePostSourceParam(postLink)).toBe("https://www.instagram.com/reel/C9_deal123/");
  });

  it("normalizes mobile Instagram links (m.instagram.com)", () => {
    const mobileLink = "https://m.instagram.com/reel/C9_deal123/";
    expect(parsePostSourceParam(mobileLink)).toBe("https://www.instagram.com/reel/C9_deal123/");
  });

  it("safely rejects duplicate source parameters (arrays)", () => {
    const duplicate = ["https://www.instagram.com/reel/C9_deal123/", "https://www.instagram.com/reel/C9_other456/"];
    expect(parsePostSourceParam(duplicate)).toBeNull();
  });

  it("safely rejects non-string or empty inputs", () => {
    expect(parsePostSourceParam(undefined)).toBeNull();
    expect(parsePostSourceParam(null)).toBeNull();
    expect(parsePostSourceParam("")).toBeNull();
    expect(parsePostSourceParam("   ")).toBeNull();
    expect(parsePostSourceParam(12345)).toBeNull();
    expect(parsePostSourceParam({})).toBeNull();
  });

  it("safely rejects non-Instagram domains", () => {
    expect(parsePostSourceParam("https://tiktok.com/@user/video/123456")).toBeNull();
    expect(parsePostSourceParam("https://evil.com/reel/C9_deal123/")).toBeNull();
    expect(parsePostSourceParam("https://instagram.com.evil.com/reel/C9_deal123/")).toBeNull();
  });

  it("safely rejects URLs with credentials, non-standard ports, or path tricks", () => {
    expect(parsePostSourceParam("https://user:pass@instagram.com/reel/C9_deal123/")).toBeNull();
    expect(parsePostSourceParam("https://instagram.com:8080/reel/C9_deal123/")).toBeNull();
    expect(parsePostSourceParam("https://instagram.com/reel/../secret")).toBeNull();
    expect(parsePostSourceParam("http://instagram.com/reel/C9_deal123/")).toBeNull(); // insecure http
  });

  it("safely rejects strings with multiple URLs or trailing text", () => {
    expect(parsePostSourceParam("https://instagram.com/reel/C9_deal123/ https://instagram.com/reel/C9_other456/")).toBeNull();
  });

  it("safely rejects arbitrary prefix or suffix text surrounding the URL", () => {
    expect(parsePostSourceParam("Have a look https://www.instagram.com/reel/C9_deal123/")).toBeNull();
    expect(parsePostSourceParam("https://www.instagram.com/reel/C9_deal123/ check this out")).toBeNull();
    expect(parsePostSourceParam("Shared: https://instagram.com/p/C9_deal123/")).toBeNull();
  });
});

describe("hasNonUrlText (guards against empty, whitespace, and URL-only text analysis)", () => {
  it("returns false for empty or whitespace-only inputs", () => {
    expect(hasNonUrlText("", "")).toBe(false);
    expect(hasNonUrlText("   ", undefined)).toBe(false);
    expect(hasNonUrlText(null, " \t\n ")).toBe(false);
  });

  it("returns false for URL-only strings in caption or text across all link forms", () => {
    // standard scheme links
    expect(hasNonUrlText("https://www.instagram.com/reel/C9_deal123/", "")).toBe(false);
    expect(hasNonUrlText("", "http://example.com/deal")).toBe(false);
    expect(hasNonUrlText("https://instagram.com/reel/123 https://instagram.com/reel/456", "")).toBe(false);
    expect(hasNonUrlText("www.instagram.com/reel/123", "")).toBe(false);
    expect(hasNonUrlText("HTTPS://WWW.INSTAGRAM.COM/p/ABC/", "")).toBe(false);

    // bare domain links
    expect(hasNonUrlText("instagram.com/p/ABC/", "")).toBe(false);
    expect(hasNonUrlText("instagram.com", "")).toBe(false);
    expect(hasNonUrlText("", "example.org")).toBe(false);

    // scheme-relative links
    expect(hasNonUrlText("//www.instagram.com/p/ABC/", "")).toBe(false);

    // parenthesized or quoted links
    expect(hasNonUrlText("(https://www.instagram.com/p/ABC/)", "")).toBe(false);
    expect(hasNonUrlText("“https://www.instagram.com/p/ABC/”", "")).toBe(false);
    expect(hasNonUrlText("[https://www.instagram.com/p/ABC/]", "")).toBe(false);
    expect(hasNonUrlText("<https://www.instagram.com/p/ABC/>", "")).toBe(false);

    // multiple link lines
    expect(hasNonUrlText("https://example.org/a\nhttps://example.org/b", "")).toBe(false);
  });

  it("returns false for punctuation-only content with no letters or digits", () => {
    expect(hasNonUrlText("...!", "  ")).toBe(false);
    expect(hasNonUrlText("---", "()")).toBe(false);
    expect(hasNonUrlText(";:,.", "??!!")).toBe(false);
  });

  it("returns true when actual non-URL caption or text is present", () => {
    expect(hasNonUrlText("Half price wings every Wednesday", "")).toBe(true);
    expect(hasNonUrlText("", "Tacos $2.50 all day Tuesday")).toBe(true);
    expect(hasNonUrlText("Special lunch menu https://instagram.com/reel/123", "")).toBe(true);
    expect(hasNonUrlText("Check this out!", "https://instagram.com/reel/123")).toBe(true);
    expect(hasNonUrlText("Pho:C$10", "")).toBe(true);
    expect(hasNonUrlText("拉面 $10", "")).toBe(true);
    expect(hasNonUrlText("2-for-1 pho on Tuesday https://www.instagram.com/p/ABC/", "")).toBe(true);
  });
});

describe("source provenance prefill and manual edit persistence", () => {
  it("initializes provenanceUrl and preserves manual edits across hook/deps updates and rerenders", async () => {
    const rawParam = "https://instagram.com/p/C9_deal123/?igsh=abc";
    const initialSourceUrl = parsePostSourceParam(rawParam);
    expect(initialSourceUrl).toBe("https://www.instagram.com/reel/C9_deal123/");

    const { ImageDraftFlow } = await import("../../lib/imageDraftFlow");
    const fakeDeps = {
      prepareImage: async () => ({} as never),
      getToken: async () => null,
      generateUploadUrl: async () => "",
      upload: async () => ({ ok: false as const, reason: "network" as const }),
      extract: async () => ({
        result: { isDeal: true, deals: [{ restaurant: "Ramen", address: "123 St", dealText: "Combo", priceCad: 10, confidence: { restaurant: 0.9 } }] },
        manualReview: [],
        requiresBlockingReview: false,
        model: "synthetic",
      }),
      createDeal: async () => "deal_id_12345",
    };

    const flow = new ImageDraftFlow(fakeDeps);
    if (initialSourceUrl) {
      flow.setContext({ provenanceUrl: initialSourceUrl });
    }

    expect(flow.getSnapshot().source.provenanceUrl).toBe("https://www.instagram.com/reel/C9_deal123/");

    // User edits the provenance URL manually
    flow.setContext({ provenanceUrl: "https://www.instagram.com/reel/manually_edited_456/" });
    expect(flow.getSnapshot().source.provenanceUrl).toBe("https://www.instagram.com/reel/manually_edited_456/");

    // setDeps (simulating React rerender with fresh hook deps) preserves user edit
    flow.setDeps({ ...fakeDeps });
    expect(flow.getSnapshot().source.provenanceUrl).toBe("https://www.instagram.com/reel/manually_edited_456/");
  });
});
