import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval("Remove expired deals from realtime maps", { minutes: 15 }, internal.maintenance.expireDeals);
export default crons;
