import { comparisonInputSchema, type ComparisonResult } from "../src/compare-contracts";

/** Call from your teammate's server route after checking the app user's permissions.
 * Keep WORKFLOW_API_TOKEN on the server. Do not import this module into the browser.
 */
export async function compareSelectedRestaurants(raw: unknown): Promise<ComparisonResult> {
  const input = comparisonInputSchema.parse(raw);
  const siteUrl = process.env.DEAL_WORKFLOW_SITE_URL;
  const token = process.env.DEAL_WORKFLOW_TOKEN;
  if (!siteUrl || !token) throw new Error("Configure the workflow site URL and server integration token.");
  const response = await fetch(new URL("/v1/deals/compare", siteUrl), {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input), signal: AbortSignal.timeout(75000), cache: "no-store",
  });
  if (!response.ok) throw new Error(`Restaurant comparison failed (${response.status}).`);
  return response.json() as Promise<ComparisonResult>;
}
