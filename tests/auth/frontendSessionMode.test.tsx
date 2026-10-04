// @vitest-environment node
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";

// Only the session hook is controlled; every other Convex export is the real one.
const session = vi.hoisted(() => ({ isAuthenticated: false, isLoading: false }));
vi.mock("convex/react", async importActual => ({
  ...(await importActual<typeof import("convex/react")>()),
  useConvexAuth: () => session,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/frontend/deals", async () => import("../../lib/frontend/deals"));
vi.mock("@/lib/frontend/demoDeals", async () => import("../../lib/frontend/demoDeals"));
vi.mock("@/lib/frontend/workflow", async () => import("../../lib/frontend/workflow"));
vi.mock("@/lib/frontend/draft", async () => import("../../lib/frontend/draft"));
vi.mock("@/convex/_generated/api", async () => import("../../convex/_generated/api"));
vi.mock("@/lib/frontendConnection", async () => import("../../lib/frontendConnection"));

const URL_A = "https://first-app.convex.cloud";
afterEach(() => {
  vi.unstubAllEnvs();
  session.isAuthenticated = false;
});

async function render(): Promise<string> {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", URL_A);
  vi.stubEnv("NEXT_PUBLIC_WORKFLOW_CONVEX_URL", "");
  const { FrontendProvider, useFrontend } = await import("../../components/frontend/FrontendProvider");
  function Probe() {
    const app = useFrontend();
    return <span>{`mode=${app.mode};authenticated=${app.authenticated}`}</span>;
  }
  const root = new ConvexReactClient(URL_A);
  try {
    return renderToString(<ConvexAuthProvider client={root}><FrontendProvider><Probe /></FrontendProvider></ConvexAuthProvider>);
  } finally {
    await root.close();
  }
}

describe("canonical-only frontend session", () => {
  it("opens Discover on the example deals and is signed out without a real session", async () => {
    expect(await render()).toContain("mode=preview;authenticated=false");
  });

  it("follows the real signed-in session even though Discover shows the example deals", async () => {
    session.isAuthenticated = true;
    expect(await render()).toContain("mode=preview;authenticated=true");
  });
});
