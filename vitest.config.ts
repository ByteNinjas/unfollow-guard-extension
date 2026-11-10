import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/manifest.ts", "src/types.ts"],
      reporter: ["text", "html"],
      // Baseline guard. Most behavior tests execute the built bundles, so only modules imported
      // directly by tests (shared, i18n, export helpers, batch helpers) are instrumented here.
      // Raise these numbers as more modules gain direct source-import tests.
      thresholds: {
        statements: 2,
        branches: 1,
        functions: 3,
        lines: 3,
      },
    },
  },
});
