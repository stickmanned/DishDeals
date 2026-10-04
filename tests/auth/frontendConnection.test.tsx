// @vitest-environment node
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { ConvexReactClient, useConvex } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { frontendConnection } from "../../lib/frontendConnection";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// The aliases below resolve the production component's local modules in this standalone Vitest config.
vi.mock("@/lib/frontend/deals", async () => import("../../lib/frontend/deals"));
vi.mock("@/lib/frontend/demoDeals", async () => import("../../lib/frontend/demoDeals"));
vi.mock("@/lib/frontend/workflow", async () => import("../../lib/frontend/workflow"));
vi.mock("@/lib/frontend/draft", async () => import("../../lib/frontend/draft"));
vi.mock("@/convex/_generated/api", async () => import("../../convex/_generated/api"));
vi.mock("@/lib/frontendConnection", async () => import("../../lib/frontendConnection"));

const URL_A = "https://first-app.convex.cloud";
const URL_B = "https://other-app.convex.cloud";
afterEach(() => vi.unstubAllEnvs());

describe("frontend connection boundary", () => {
  it("uses canonical client even when optional legacy variable is omitted", () => expect(frontendConnection(URL_A, undefined)).toBe("canonical"));
  it("normalizes the same HTTPS origin without a second session", () => expect(frontendConnection(URL_A, `${URL_A}:443/`)).toBe("canonical"));
  it.each([URL_B, `${URL_A}/private`, `${URL_A}?token=private`, `${URL_A}#private`, "https://user:password@first-app.convex.cloud", "http://first-app.convex.cloud", "not-a-url"])("rejects a mismatched or invalid legacy target %s", target => expect(frontendConnection(URL_A, target)).toBe("canonical_conflict"));
  it("preserves standalone legacy integration and explicit no-backend preview", () => {
    expect(frontendConnection(undefined, URL_B)).toBe("standalone");
    expect(frontendConnection(undefined, undefined)).toBe("preview");
  });
});

describe("actual production provider composition (SSR; no backend/auth request)", () => {
  it.each([undefined, URL_A, URL_B])("keeps canonical route hooks on the actual root client with legacy target %s", async workflow => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", URL_A);
    vi.stubEnv("NEXT_PUBLIC_WORKFLOW_CONVEX_URL", workflow ?? "");
    const { FrontendProvider } = await import("../../components/frontend/FrontendProvider");
    const root = new ConvexReactClient(URL_A);
    function Probe() {
      if (useConvex() !== root) throw new Error("Canonical client was shadowed");
      return <span>original-root-client</span>;
    }
    try {
      const html = renderToString(<ConvexAuthProvider client={root}><FrontendProvider><Probe /></FrontendProvider></ConvexAuthProvider>);
      expect(html).toContain("original-root-client");
      if (workflow === URL_B) expect(html).toContain("Discover feed is not configured");
    } finally {
      await root.close();
    }
  });
});
