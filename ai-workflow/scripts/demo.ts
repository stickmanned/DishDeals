import { mkdir, readFile, writeFile } from "node:fs/promises";
import { processDeal } from "../src/workflow";
import { deal, place } from "../tests/fixtures";
const input = JSON.parse(await readFile("examples/text.json", "utf8"));
const result = await processDeal(input, {
  extract: async () => ({ deals: [deal], rejectionReason: null }), locate: async () => [place],
  now: () => new Date("2026-10-03T20:00:00Z"),
});
await mkdir("output", { recursive: true });
await writeFile("output/demo-result.json", JSON.stringify(result, null, 2));
console.log("OFFLINE DEMO — synthetic restaurant and mocked provider responses; no API calls or database writes.");
console.log(JSON.stringify(result, null, 2));
