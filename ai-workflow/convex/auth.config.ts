// Optional direct browser integration. HTTP server integrations use WORKFLOW_API_TOKEN instead.
import type { AuthConfig } from "convex/server";
const domain = process.env.AUTH_JWT_ISSUER;
const applicationID = process.env.AUTH_JWT_AUDIENCE;
export default { providers: domain && applicationID ? [{ domain, applicationID }] : [] } satisfies AuthConfig;
