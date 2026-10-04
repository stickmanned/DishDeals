import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Bounded (100 rows) cleanup of expired, unpublished, unreferenced deal-image uploads.
crons.interval("clean expired deal image uploads", { hours: 1 }, internal.dealUploads.cleanupExpired, {});

// Published teammate cron (same identifier as deployed): expire published workflow offers.
crons.interval("Remove expired deals from realtime maps", { minutes: 15 }, internal.workflow.maintenance.expireDeals);

export default crons;
