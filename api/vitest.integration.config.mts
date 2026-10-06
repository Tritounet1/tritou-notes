import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/__tests__/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
