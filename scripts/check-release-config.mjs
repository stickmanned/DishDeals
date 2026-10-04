#!/usr/bin/env node
/**
 * Headless release-URL validator. Takes only explicit public URLs on the command line.
 * No network, no file reads or writes, no env reads, no secrets.
 *
 *   node scripts/check-release-config.mjs --website https://HOST --backend https://NAME.convex.cloud \
 *     --site https://NAME.convex.site [--deployment NAME]
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

/**
 * @param {{website?: string, backend?: string, site?: string, deployment?: string}} input
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
  if (input.backend && host(input.backend) !== `${deployment}.convex.cloud`) {
    problems.push(`backend: host must be ${deployment}.convex.cloud`);
  }
  if (input.site && host(input.site) !== `${deployment}.convex.site`) {
    problems.push(`site: host must be ${deployment}.convex.site`);
  }
  if (input.website && /\.convex\.(cloud|site)$/.test(host(input.website))) {
    problems.push("website: must be the Next host, not a Convex host");
  }
  return { ok: problems.length === 0, problems };
}

const FLAGS = new Set(["website", "backend", "site", "deployment"]);

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
