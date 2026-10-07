import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/__tests__/integration/**"],
    // Valid placeholder configuration: entry points check it at startup (config/validateConfig.ts).
    env: { DATABASE_URL: "postgresql://unit-tests", JWT_SECRET: "unit-test-jwt-secret-of-at-least-32-bytes", ENCRYPTION_KEY: "ab".repeat(32) },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**", "src/__tests__/**", "src/types/**"],
      reporter: ["text", "html", "json-summary"],
      thresholds: { lines: 95, statements: 95, functions: 95, branches: 90 },
    },
  },
});
