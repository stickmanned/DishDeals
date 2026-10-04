import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Bounded (100 rows) cleanup of expired, unpublished, unreferenced deal-image uploads.
crons.interval("clean expired deal image uploads", { hours: 1 }, internal.dealUploads.cleanupExpired, {});

export default crons;
