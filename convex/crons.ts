import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Bounded (100 rows) cleanup of expired, unpublished, unreferenced deal-image uploads.
crons.interval("clean expired deal image uploads", { hours: 1 }, internal.dealUploads.cleanupExpired, {});

// Canonical public posts: retain seven full Vancouver calendar days after
// inclusive expiry. Separate from legacy workflow expiry/private reel retention.
crons.interval("clean canonical published deals after retention", { hours: 1 }, internal.deals.sweepExpired, { cursor: null });

// Published teammate cron (same identifier as deployed): expire published workflow offers.
crons.interval("Remove expired deals from realtime maps", { minutes: 15 }, internal.workflow.maintenance.expireDeals);

export default crons;
