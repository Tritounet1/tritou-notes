import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/__tests__/integration/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**", "src/__tests__/**", "src/types/**"],
      reporter: ["text", "html", "json-summary"],
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 },
    },
  },
});
