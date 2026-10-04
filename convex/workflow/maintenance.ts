import { internalMutation } from "../_generated/server";
import { outcomeSchema } from "../../lib/workflow/contracts";
import { localDate } from "../../lib/workflow/workflow";
export const expireDeals = internalMutation({ args: {}, handler: async ctx => {
  const records = await ctx.db.query("workflowDeals").withIndex("by_status_and_createdAt", q => q.eq("status", "published")).order("desc").take(500);
  const now = new Date(); let expired = 0;
  for (const record of records) {
    const outcome = outcomeSchema.parse(JSON.parse(record.dataJson));
    if (outcome.deal.endDate && outcome.deal.endDate < localDate(now, record.timezone)) {
      await ctx.db.patch(record._id, { status: "rejected" }); expired++;
    }
  }
  return { expired };
} });
