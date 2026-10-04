import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { preflight, upload } from "./reelSource";
import { preflight as imagePreflight, upload as imageUpload } from "./dealImage";
import { registerWorkflowRoutes } from "../lib/workflow/http";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({ path: "/reel-source", method: "POST", handler: upload });
http.route({ path: "/reel-source", method: "OPTIONS", handler: preflight });

http.route({ path: "/deal-image", method: "POST", handler: imageUpload });
http.route({ path: "/deal-image", method: "OPTIONS", handler: imagePreflight });

// Published teammate server-integration API (/v1/*); disabled unless WORKFLOW_API_TOKEN is configured.
registerWorkflowRoutes(http);

export default http;
