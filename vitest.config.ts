import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "edge-runtime", exclude: ["scripts/**", "node_modules/**", ".next/**", "map-component/**"] } });
