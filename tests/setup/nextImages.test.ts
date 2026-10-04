// Deal photos live on the Convex storage host. next/image refuses any remote host that next.config does not
// allow (the optimizer answers 400 INVALID_IMAGE_OPTIMIZE_REQUEST), which left deal photos blank in the app.
import { afterEach, describe, expect, it, vi } from "vitest";

const HOST = "proper-marmot-82.ca-central-1.convex.cloud";

async function loadConfig(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, "");
    else vi.stubEnv(key, value);
  }
  return (await import("../../next.config")).default;
}

afterEach(() => vi.unstubAllEnvs());

describe("next.config images", () => {
  it("allows storage images from the configured Convex deployment, and only that host and path", async () => {
    const config = await loadConfig({ NEXT_PUBLIC_CONVEX_URL: `https://${HOST}` });
    expect(config.images?.remotePatterns).toEqual([{ protocol: "https", hostname: HOST, pathname: "/api/storage/**" }]);
  });

  it("never allows a wildcard host that would proxy anyone's storage through the optimizer", async () => {
    const config = await loadConfig({ NEXT_PUBLIC_CONVEX_URL: `https://${HOST}` });
    expect(JSON.stringify(config.images)).not.toContain("*.convex");
    expect(JSON.stringify(config.images)).not.toMatch(/"hostname":"\*+"/);
  });

  it("allows nothing when the Convex URL is missing or not https", async () => {
    expect((await loadConfig({ NEXT_PUBLIC_CONVEX_URL: "" })).images?.remotePatterns ?? []).toEqual([]);
    expect((await loadConfig({ NEXT_PUBLIC_CONVEX_URL: "http://localhost:3210" })).images?.remotePatterns ?? []).toEqual([]);
  });

  it("keeps the service-worker headers untouched", async () => {
    const config = await loadConfig({ NEXT_PUBLIC_CONVEX_URL: `https://${HOST}` });
    const rules = await config.headers?.();
    expect(rules?.map((r) => r.source)).toEqual(["/sw.js"]);
  });
});
