import { WorkflowError } from "./errors";
export type Fetch = typeof fetch;
export async function fetchJson(url: string, init: RequestInit, provider: string, fetcher: Fetch = fetch,
  options: { deadline?: number; timeoutMs?: number } = {}): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const remaining = (options.deadline ?? Infinity) - Date.now();
    if (remaining < 1000) throw new WorkflowError("WORKFLOW_TIMEOUT", "Processing time limit reached. Retry with a smaller source.", true);
    let response: Response;
    try {
      response = await fetcher(url, { ...init, signal: AbortSignal.timeout(Math.floor(Math.min(options.timeoutMs ?? 30000, remaining))) });
    } catch {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 300 * 2 ** attempt)); continue; }
      throw new WorkflowError("PROVIDER_UNAVAILABLE", `${provider} connection timed out or failed.`, true);
    }
    if (response.ok) {
      try { return await response.json(); } catch {
        throw new WorkflowError("INVALID_PROVIDER_RESPONSE", `${provider} returned invalid JSON.`, true);
      }
    }
    // Provider response bodies and URLs can contain keys or submitted source data: never expose them.
    if ([429, 500, 502, 503, 504].includes(response.status)) {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 300 * 2 ** attempt)); continue; }
      throw new WorkflowError("PROVIDER_BUSY", `${provider} is rate limited or unavailable. Try again later.`, true);
    }
    if ([401, 403].includes(response.status)) throw new WorkflowError("PROVIDER_AUTH", `Check the server-side ${provider} API key and permissions.`);
    throw new WorkflowError("PROVIDER_REQUEST", `${provider} rejected the request (HTTP ${response.status}). Check model and input support.`);
  }
  throw new WorkflowError("PROVIDER_UNAVAILABLE", `${provider} unavailable.`, true);
}
