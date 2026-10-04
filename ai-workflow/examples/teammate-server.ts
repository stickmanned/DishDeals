// Call from your team's backend route, never from a browser with the private token.
import type { WorkflowInput, Outcome, WorkflowResult } from "../src/contracts";
import type { SearchInput, SearchResult } from "../src/search-contracts";
export type Job = {
  jobId: string; status: "queued" | "processing" | "completed" | "failed";
  result: WorkflowResult | null;
  error: { code: string; message: string; retryable: boolean } | null;
  deals: (Omit<Outcome, "status"> & { dealId: string; status: "published" | "needs_review" | "rejected" })[];
};
export class DealWorkflowClient {
  constructor(private siteUrl: string, private token: string) {
    const url = new URL(siteUrl);
    if (url.protocol !== "https:") throw new Error("Use your HTTPS Convex site URL");
  }
  private async request<T>(path: string, method = "GET", body?: unknown, timeoutMs = 15000): Promise<T> {
    const response = await fetch(new URL(path, this.siteUrl), {
      method, headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`Deal workflow HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }
  submit(input: WorkflowInput) { return this.request<{ jobId: string; duplicate: boolean }>("/v1/jobs", "POST", input); }
  search(input: SearchInput) { return this.request<SearchResult>("/v1/search", "POST", input, 90000); }
  pitch(input: SearchInput & { focusDealId: string }) { return this.request<SearchResult>("/v1/deals/pitch", "POST", { ...input, limit: 1 }, 90000); }
  get(jobId: string) { return this.request<Job>(`/v1/jobs?id=${encodeURIComponent(jobId)}`); }
  retry(jobId: string) { return this.request<{ jobId: string }>("/v1/jobs/retry", "POST", { jobId }); }
  review(dealId: string, decision: "approve" | "reject", placeId?: string) {
    return this.request<{ dealId: string; status: "published" | "rejected" }>("/v1/deals/review", "POST", { dealId, decision, placeId });
  }
}
