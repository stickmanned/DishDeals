import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.github.stickmanned.dishdeals",
  appName: "DishDeals",
  webDir: "out",
  backgroundColor: "#fbf7f2",
  loggingBehavior: "debug",
  // Bundle the frontend. No remote website, API keys, or permissive navigation allowlist.
  server: { androidScheme: "https" },
  android: { allowMixedContent: false },
  // Keep system icons legible against the existing light frontend.
  plugins: { SystemBars: { style: "LIGHT", hidden: false } },
};

export default config;
