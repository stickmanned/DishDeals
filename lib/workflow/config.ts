// Explicit, pure provider configuration for the preserved workflow (N-REMOTE-B). Convex entry points read the
// typed `env` from `convex/_generated/server`, pick these names, and pass the result in; nothing here reads a
// global, and nothing in `lib/` is imported by the browser. A model is never assumed: a feature without an
// explicitly configured model is unavailable and makes no paid request.
import { providerUsageAuthorized } from "./workflow";

export const WORKFLOW_ENV_NAMES = [
  "GEMINI_API_KEY", "GEOAPIFY_API_KEY", "GEMINI_MODEL", "GEMINI_FALLBACK_MODEL", "GEMINI_SEARCH_MODEL",
  "GEMINI_WEB_SEARCH_MODEL", "GEMINI_COMPARISON_MODEL", "WORKFLOW_PROVIDER_USAGE_AUTHORIZED",
] as const;
export type WorkflowEnv = Partial<Record<typeof WORKFLOW_ENV_NAMES[number], string | undefined>>;

/** Copy only the workflow names from a typed env object, so a caller can never leak other variables. */
export function pickWorkflowEnv(env: Record<string, string | undefined>): WorkflowEnv {
  return Object.fromEntries(WORKFLOW_ENV_NAMES.map(name => [name, env[name]]));
}
const named = (value: string | undefined) => value?.trim() || undefined;
// Provider spend needs both the separate workflow gate and a key; a model is checked per feature.
function gatedKey(env: WorkflowEnv) { const key = named(env.GEMINI_API_KEY); return providerUsageAuthorized(env) && key ? key : null; }
export type ModelConfig = { apiKey: string; model: string };

/** Stored-offer understanding/recommendation (`GEMINI_SEARCH_MODEL`) and Google Search grounding (`GEMINI_WEB_SEARCH_MODEL`) are configured separately. */
export function searchProviders(env: WorkflowEnv): { understand: ModelConfig | null; web: ModelConfig | null } {
  const apiKey = gatedKey(env), search = named(env.GEMINI_SEARCH_MODEL), web = named(env.GEMINI_WEB_SEARCH_MODEL);
  return { understand: apiKey && search ? { apiKey, model: search } : null, web: apiKey && web ? { apiKey, model: web } : null };
}
export function comparisonProvider(env: WorkflowEnv): ModelConfig | null {
  const apiKey = gatedKey(env), model = named(env.GEMINI_COMPARISON_MODEL);
  return apiKey && model ? { apiKey, model } : null;
}
