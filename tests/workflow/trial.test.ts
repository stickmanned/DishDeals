/// <reference types="vite/client" />
import { it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";
import { inputSchema } from "../../lib/workflow/contracts";
const modules = import.meta.glob("../../convex/**/*.*s");

it("keeps jobs across authenticated sessions while excluding other users and input contents", async () => {
  const t = convexTest(schema, modules);
  const jobId = await t.run(ctx => ctx.db.insert("workflowJobs", {
    owner: "alice", fingerprint: "fixture", inputJson: "private source", status: "failed",
    createdAt: 1, updatedAt: 1, attempt: 1,
  }));
  const first = t.withIdentity({ subject: "alice|first-session" });
  const second = t.withIdentity({ subject: "alice|second-session" });
  expect(await second.query(api.workflow.jobs.listMine, {})).toEqual(await first.query(api.workflow.jobs.listMine, {}));
  expect((await second.query(api.workflow.jobs.listMine, {}))[0]).toEqual({ jobId, status: "failed", createdAt: 1 });
  expect(await t.withIdentity({ subject: "bob|third-session" }).query(api.workflow.jobs.listMine, {})).toEqual([]);
  await expect(t.query(api.workflow.jobs.listMine, {})).rejects.toThrow("Sign in");
});
it("rejects Instagram fetching while allowing supplied captions with Instagram attribution", () => {
  for (const url of ["https://instagram.com/p/example", "https://www.instagram.com/p/example", "https://instagr.am/p/example"])
    expect(inputSchema.safeParse({ source: { type: "url", url } }).success).toBe(false);
  expect(inputSchema.safeParse({ source: { type: "text", text: "A pasted restaurant caption", sourceUrl: "https://www.instagram.com/p/example" } }).success).toBe(true);
});
