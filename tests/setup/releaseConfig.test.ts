import { describe, expect, it } from "vitest";
import { parseArgs, validateReleaseUrls } from "../../scripts/check-release-config.mjs";

const good = {
  website: "https://dishdeals-preview.myhost.dev",
  backend: "https://proper-marmot-82.convex.cloud",
  site: "https://proper-marmot-82.convex.site",
};

const problemsFor = (patch: Record<string, string | undefined>) =>
  validateReleaseUrls({ ...good, ...patch }).problems.join("\n");

describe("release URL validator (synthetic, no network)", () => {
  it("accepts matching bare https origins", () => {
    expect(validateReleaseUrls(good)).toEqual({ ok: true, problems: [] });
  });

  it.each([
    ["http scheme", { website: "http://app.host.dev" }, "must use https"],
    ["credentials", { website: "https://user:pw@app.host.dev" }, "credentials"],
    ["query", { website: "https://app.host.dev?x=1" }, "query"],
    ["fragment", { website: "https://app.host.dev#x" }, "fragment"],
    ["port", { website: "https://app.host.dev:8443" }, "port"],
    ["path", { website: "https://app.host.dev/app" }, "bare origin"],
    ["trailing slash", { backend: "https://proper-marmot-82.convex.cloud/" }, "bare origin"],
    ["placeholder", { website: "https://replace-with-your-web-host.example" }, "placeholder"],
    ["localhost", { website: "https://localhost" }, "placeholder"],
    ["ip literal", { website: "https://192.168.1.4" }, "IP literal"],
    ["wrong backend deployment", { backend: "https://other-fox-11.convex.cloud" }, "proper-marmot-82.convex.cloud"],
    ["backend on site host", { backend: "https://proper-marmot-82.convex.site" }, "convex.cloud"],
    ["wrong site deployment", { site: "https://other-fox-11.convex.site" }, "proper-marmot-82.convex.site"],
    ["website on convex host", { website: "https://proper-marmot-82.convex.cloud" }, "Next host"],
    ["missing website", { website: undefined }, "website: missing"],
    ["not a URL", { website: "not a url" }, "whitespace"],
  ])("rejects %s", (_name, patch, expected) => {
    const result = validateReleaseUrls({ ...good, ...patch });
    expect(result.ok).toBe(false);
    expect(problemsFor(patch)).toContain(expected);
  });

  it("honours an explicit deployment name and rejects a malformed one", () => {
    expect(
      validateReleaseUrls({
        ...good,
        deployment: "other-fox-11",
        backend: "https://other-fox-11.convex.cloud",
        site: "https://other-fox-11.convex.site",
      }).ok,
    ).toBe(true);
    expect(validateReleaseUrls({ ...good, deployment: "Bad Name" }).ok).toBe(false);
  });

  it("parses flags strictly", () => {
    expect(parseArgs(["--website", "https://a.dev"]).input).toEqual({ website: "https://a.dev" });
    expect(parseArgs(["--secret", "x"]).errors[0]).toContain("unknown argument");
    expect(parseArgs(["--website"]).errors[0]).toContain("value required");
    expect(parseArgs(["--site", "https://a.dev", "--site", "https://b.dev"]).errors.join()).toContain("given twice");
  });
});
