import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { preflight, upload } from "./reelSource";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({ path: "/reel-source", method: "POST", handler: upload });
http.route({ path: "/reel-source", method: "OPTIONS", handler: preflight });

export default http;
