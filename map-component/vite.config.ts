import {defineConfig} from "vite";
import {fileURLToPath} from "node:url";
export default defineConfig({
  root:"dev",
  base:"./",
  worker:{format:"es"},
  build:{outDir:"../dist",emptyOutDir:true,lib:{entry:fileURLToPath(new URL("./src/index.ts",import.meta.url)),formats:["es"],fileName:"index",cssFileName:"map"},rollupOptions:{external:["react","react-dom","react/jsx-runtime"],output:{banner:'"use client";'}}},
});
