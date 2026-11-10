import { build } from "vite";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "dist/test");
rmSync(outDir, { recursive: true, force: true }); // no stale bundles from an older entry list

async function bundle(entry, fileName) {
  await build({
    configFile: false,
    root,
    publicDir: false,
    build: {
      outDir,
      emptyOutDir: false,
      target: "es2022",
      sourcemap: true,
      minify: false,
      lib: {
        entry: resolve(root, entry),
        formats: ["iife"],
        name: fileName.replace(/\W/g, "_"),
        fileName: () => fileName,
      },
    },
  });
}

await bundle("src/content/index.ts", "content.js");
await bundle("src/hook.iife.ts", "hook.iife.js");
await bundle("src/background.ts", "background.js");
await bundle("src/popup/main.ts", "popup.js");
await bundle("src/shared.ts", "shared.js");
await bundle("src/i18n.ts", "i18n.js");
await bundle("tests/fixtures/example-entry.ts", "example-content.js");
await bundle("tests/fixtures/adapters-entry.ts", "adapters.js");
console.log("Built dist/test bundles (content, hook, background, popup, shared, i18n, example-content, adapters)");
