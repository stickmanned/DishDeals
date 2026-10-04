import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(root);
const deployment = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!deployment || !/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.convex\.cloud\/?$/.test(deployment)) {
  throw new Error("Set NEXT_PUBLIC_CONVEX_URL to your public HTTPS Convex deployment URL.");
}
const env = { ...process.env, NEXT_PUBLIC_BASE_PATH: "" };
execFileSync(process.execPath, [require.resolve("next/dist/bin/next"), "build"], { stdio: "inherit", env });
execFileSync(process.execPath, [require.resolve("@capacitor/cli/bin/capacitor"), "sync", "android"], { stdio: "inherit", env });
if (!process.argv.includes("--assets-only")) {
  const android = resolve(root, "android");
  if (process.platform === "win32") {
    // Windows batch files require cmd.exe; all arguments here are fixed, never user text.
    execFileSync("cmd.exe", ["/d", "/c", "gradlew.bat", "assembleDebug", "lintDebug", "--no-daemon"], { cwd: android, stdio: "inherit", env });
  } else {
    execFileSync("sh", ["./gradlew", "assembleDebug", "lintDebug", "--no-daemon"], { cwd: android, stdio: "inherit", env });
  }
  const apk = resolve(android, "app/build/outputs/apk/debug/app-debug.apk");
  if (!existsSync(apk)) throw new Error("Android build did not produce an APK.");
  console.log(`Installable trial APK: ${apk}`);
}
