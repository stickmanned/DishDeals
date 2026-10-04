#!/usr/bin/env node
/**
 * Headless release-URL validator. Takes only explicit public URLs on the command line.
 * No network, no file reads or writes, no env reads, no secrets.
 *
 *   node scripts/check-release-config.mjs --website https://HOST --backend https://NAME[.REGION].convex.cloud \
 *     --site https://NAME[.REGION].convex.site [--deployment NAME] [--region REGION]
 *
 * The iOS app builds `WebsiteURL + route` and `BackendURL + "/api/mutation"`, so values must be bare
 * origins with no path, trailing slash, query, fragment, credentials or port.
 */
export const DEFAULT_DEPLOYMENT = "proper-marmot-82";

const PLACEHOLDER = /(replace|placeholder|example|your-|changeme|todo|\.test$|\.invalid$|\.local$|\.localhost$|^localhost$)/i;
const DEPLOYMENT_NAME = /^[a-z]+-[a-z]+-\d+$/;

/** Returns a list of problem strings for one URL; empty means acceptable. */
function checkOrigin(label, raw) {
  const problems = [];
  if (typeof raw !== "string" || raw.length === 0) return [`${label}: missing`];
  if (raw !== raw.trim() || /\s/.test(raw)) return [`${label}: contains whitespace`];
  let url;
  try {
    url = new URL(raw);
  } catch {
    return [`${label}: not a valid absolute URL`];
  }
  if (url.protocol !== "https:") problems.push(`${label}: must use https`);
  if (url.username || url.password || raw.includes("@")) problems.push(`${label}: credentials not allowed`);
  if (url.search || raw.includes("?")) problems.push(`${label}: query not allowed`);
  if (url.hash || raw.includes("#")) problems.push(`${label}: fragment not allowed`);
  if (url.port || /^https:\/\/[^/]*:\d*(\/|$)/i.test(raw)) problems.push(`${label}: explicit port not allowed`);
  if (url.pathname !== "/" || raw.endsWith("/")) problems.push(`${label}: must be a bare origin without path or trailing slash`);
  const host = url.hostname.toLowerCase();
  if (PLACEHOLDER.test(host)) problems.push(`${label}: placeholder or local hostname`);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[")) {
    problems.push(`${label}: IP literal not allowed`);
  }
  if (!host.includes(".")) problems.push(`${label}: hostname must be a fully qualified domain`);
  return problems;
}

export const SUPPORTED_REGIONS = ["us", "eu-west-1", "ca-central-1", "ap-southeast-2"];
export const REGIONAL_SUBDOMAINS = new Set(["eu-west-1", "ca-central-1", "ap-southeast-2"]);

export function normalizeRegion(raw) {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "us" || trimmed === "aws-us-east-1") return "us";
  if (trimmed === "eu" || trimmed === "eu-west-1" || trimmed === "aws-eu-west-1") return "eu-west-1";
  if (trimmed === "ca-central-1" || trimmed === "aws-ca-central-1") return "ca-central-1";
  if (trimmed === "ap-southeast-2" || trimmed === "aws-ap-southeast-2") return "ap-southeast-2";
  return trimmed;
}

function parseConvexHost(h, expectedSuffix) {
  if (!h || !h.endsWith(`.${expectedSuffix}`)) {
    return { ok: false, reason: "domain" };
  }
  const prefix = h.slice(0, -(expectedSuffix.length + 1));
  const parts = prefix.split(".");
  if (parts.length === 1) {
    return { ok: true, deployment: parts[0], region: "us", isRegional: false };
  }
  if (parts.length === 2) {
    const region = parts[1];
    if (!REGIONAL_SUBDOMAINS.has(region)) {
      return { ok: false, reason: "unsupported-region", region, deployment: parts[0] };
    }
    return { ok: true, deployment: parts[0], region, isRegional: true };
  }
  return { ok: false, reason: "malformed" };
}

/**
 * @param {{website?: string, backend?: string, site?: string, deployment?: string, region?: string}} input
 * @returns {{ok: boolean, problems: string[]}}
 */
export function validateReleaseUrls(input) {
  const deployment = input.deployment ?? DEFAULT_DEPLOYMENT;
  const problems = [];
  if (!DEPLOYMENT_NAME.test(deployment)) problems.push(`deployment: "${deployment}" is not a Convex deployment name`);
  problems.push(...checkOrigin("website", input.website));
  problems.push(...checkOrigin("backend", input.backend));
  problems.push(...checkOrigin("site", input.site));
  const host = (value) => {
    try {
      return new URL(value).hostname.toLowerCase();
    } catch {
      return "";
    }
  };

  let explicitRegion;
  if (input.region !== undefined) {
    explicitRegion = normalizeRegion(input.region);
    if (!SUPPORTED_REGIONS.includes(explicitRegion)) {
      problems.push(`region: "${input.region}" is not a supported Convex region (supported: US, eu-west-1, ca-central-1, ap-southeast-2)`);
      explicitRegion = null;
    }
  }

  const backendHost = input.backend ? host(input.backend) : "";
  const siteHost = input.site ? host(input.site) : "";

  if (explicitRegion !== undefined) {
    if (explicitRegion !== null) {
      const expectedBackendHost = explicitRegion === "us" ? `${deployment}.convex.cloud` : `${deployment}.${explicitRegion}.convex.cloud`;
      const expectedSiteHost = explicitRegion === "us" ? `${deployment}.convex.site` : `${deployment}.${explicitRegion}.convex.site`;
      if (backendHost && backendHost !== expectedBackendHost) {
        problems.push(`backend: host must be ${expectedBackendHost}`);
      }
      if (siteHost && siteHost !== expectedSiteHost) {
        problems.push(`site: host must be ${expectedSiteHost}`);
      }
    }
  } else {
    const bParsed = backendHost ? parseConvexHost(backendHost, "convex.cloud") : null;
    const sParsed = siteHost ? parseConvexHost(siteHost, "convex.site") : null;

    if (backendHost) {
      if (!bParsed.ok) {
        if (bParsed.reason === "unsupported-region") {
          problems.push(`backend: host has unsupported Convex region "${bParsed.region}" (supported: US, eu-west-1, ca-central-1, ap-southeast-2)`);
        } else {
          const expected = sParsed?.ok && sParsed.region !== "us"
            ? `${deployment}.${sParsed.region}.convex.cloud`
            : `${deployment}.convex.cloud`;
          problems.push(`backend: host must be ${expected}`);
        }
      } else if (bParsed.deployment !== deployment) {
        const expected = bParsed.region !== "us"
          ? `${deployment}.${bParsed.region}.convex.cloud`
          : `${deployment}.convex.cloud`;
        problems.push(`backend: host must be ${expected}`);
      }
    }

    if (siteHost) {
      if (!sParsed.ok) {
        if (sParsed.reason === "unsupported-region") {
          problems.push(`site: host has unsupported Convex region "${sParsed.region}" (supported: US, eu-west-1, ca-central-1, ap-southeast-2)`);
        } else {
          const expected = bParsed?.ok && bParsed.region !== "us"
            ? `${deployment}.${bParsed.region}.convex.site`
            : `${deployment}.convex.site`;
          problems.push(`site: host must be ${expected}`);
        }
      } else if (sParsed.deployment !== deployment) {
        const expected = sParsed.region !== "us"
          ? `${deployment}.${sParsed.region}.convex.site`
          : `${deployment}.convex.site`;
        problems.push(`site: host must be ${expected}`);
      }
    }

    if (bParsed?.ok && sParsed?.ok) {
      if (bParsed.region !== sParsed.region) {
        problems.push(`site: region "${sParsed.region}" does not match backend region "${bParsed.region}"`);
      }
    }
  }

  if (input.website && /\.convex\.(cloud|site)$/.test(host(input.website))) {
    problems.push("website: must be the Next host, not a Convex host");
  }
  return { ok: problems.length === 0, problems };
}

const FLAGS = new Set(["website", "backend", "site", "deployment", "region"]);

/** Parses `--name value` pairs; unknown or repeated flags are errors. */
export function parseArgs(argv) {
  const out = {};
  const errors = [];
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!flag?.startsWith("--") || !FLAGS.has(flag.slice(2))) {
      errors.push(`unknown argument: ${flag}`);
      i -= 1;
      continue;
    }
    if (value === undefined || value.startsWith("--")) {
      errors.push(`${flag}: value required`);
      i -= 1;
      continue;
    }
    if (out[flag.slice(2)] !== undefined) errors.push(`${flag}: given twice`);
    out[flag.slice(2)] = value;
  }
  return { input: out, errors };
}

const invokedDirectly = typeof process !== "undefined" && process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  const { input, errors } = parseArgs(process.argv.slice(2));
  const result = validateReleaseUrls(input);
  const problems = [...errors, ...result.problems];
  if (problems.length > 0) {
    for (const problem of problems) console.error(`FAIL ${problem}`);
    process.exit(1);
  }
  console.log("OK release URLs are well formed. Syntax only: reachability, ownership and TLS are not checked.");
}
