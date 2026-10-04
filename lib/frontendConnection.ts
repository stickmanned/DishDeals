/** Selects provider composition; never send a canonical session to another deployment. */
export type FrontendConnection = "canonical" | "canonical_conflict" | "standalone" | "preview";

function origin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function frontendConnection(canonical: string | undefined, workflow: string | undefined): FrontendConnection {
  if (canonical) {
    if (!workflow) return "canonical";
    const target = origin(canonical);
    return target !== null && target === origin(workflow) ? "canonical" : "canonical_conflict";
  }
  return workflow ? "standalone" : "preview";
}
