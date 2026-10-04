import {defineConfig, type Plugin} from "vite";
import {fileURLToPath} from "node:url";

const sanitizeTurbopackDynamicUrl: Plugin = {
  name: "sanitize-turbopack-dynamic-url",
  renderChunk(code: string) {
    // Replace dynamic new URL(identifier, import.meta.url) in bundled dependencies (e.g. MapLibre)
    // with runtime baseURI resolution so Next.js Turbopack does not fail on static asset analysis.
    const replaced = code.replace(
      /new URL\(([a-zA-Z_$][a-zA-Z0-9_$]*),\s*import\.meta\.url\)/g,
      "new URL($1, typeof document !== 'undefined' ? document.baseURI : typeof location !== 'undefined' ? location.href : 'http://localhost/')"
    );
    return { code: replaced, map: null };
  },
};

export default defineConfig({
  root: "dev",
  base: "./",
  worker: { format: "es" },
  plugins: [sanitizeTurbopackDynamicUrl],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      formats: ["es"],
      fileName: "index",
      cssFileName: "map",
    },
    rollupOptions: {
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: {
        banner: '"use client";',
      },
    },
  },
});
