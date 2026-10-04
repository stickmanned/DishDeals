/// <reference types="vite/client" />
import { it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { workflowApi, jobSchema } from "../../lib/frontend/workflow";
import { parseWorkflowDeals } from "../../lib/frontend/deals";
import { deal, place } from "./fixtures";
const modules = import.meta.glob("../../convex/**/*.*s");

it("renders the deployed workflow contract in the new frontend without sample data or currency inference", async () => {
  const t = convexTest(schema, modules);
  const jobId = await t.run(async ctx => {
    const jobId = await ctx.db.insert("workflowJobs", { owner: "alice", fingerprint: "integration", inputJson: "private", status: "completed", createdAt: 1, updatedAt: 1, attempt: 1 });
    const restaurantId = await ctx.db.insert("workflowRestaurants", { placeId: place.placeId, dataJson: JSON.stringify(place) });
    await ctx.db.insert("workflowDeals", { jobId, restaurantId, status: "published", timezone: "America/Vancouver", sourceUrl: "https://example.com/offer", createdAt: 1,
      dataJson: JSON.stringify({ deal: { ...deal, price: 5, currency: null }, restaurant: place, candidates: [place], reviewReasons: [], status: "ready" }) });
    return jobId;
  });
  const views = parseWorkflowDeals(await t.query(workflowApi.list, { limit: 100, now: Date.parse("2026-10-03T20:00:00Z") }));
  expect(views).toHaveLength(1);
  expect(views[0]).toMatchObject({ restaurant: place.name, isDemo: false, lat: place.latitude });
  expect(views[0].priceCad).toBeUndefined();
  expect(views[0].imageUrl).toBeUndefined();
  const owner = t.withIdentity({ subject: "alice|session" });
  expect(jobSchema.parse(await owner.query(workflowApi.get, { jobId })).deals).toHaveLength(1);
  expect(await t.withIdentity({ subject: "bob|session" }).query(workflowApi.get, { jobId })).toBeNull();
});
