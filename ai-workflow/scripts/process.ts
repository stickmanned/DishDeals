import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { inputSchema } from "../src/contracts";
import { processDeal, liveDependencies } from "../src/workflow";
import { safeError } from "../src/errors";
try { loadEnvFile(".env.local"); } catch { /* environment variables can be supplied by the shell */ }
const file = process.argv[2];
if (!file) { console.error("Usage: npm run process -- examples/text.json"); process.exit(1); }
try {
  const raw = JSON.parse(await readFile(resolve(file), "utf8"));
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) { console.error("Invalid input:", parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("\n")); process.exit(1); }
  const result = await processDeal(parsed.data, liveDependencies(process.env));
  await mkdir("output", { recursive: true });
  await writeFile("output/result.json", JSON.stringify(result, null, 2));
  console.log(`Saved ${result.outcomes.length} offer(s) to output/result.json`);
} catch (error) { console.error(JSON.stringify(safeError(error))); process.exit(1); }
