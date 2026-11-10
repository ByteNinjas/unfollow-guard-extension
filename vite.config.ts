import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";
import manifest from "./src/manifest";

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: "dist/chromium",
    emptyOutDir: true,
    target: "chrome111",
    sourcemap: false,
    minify: "oxc",
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
