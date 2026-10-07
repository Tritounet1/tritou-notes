import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const compose = ["compose", "-f", "../docker-compose.test.yml", "-p", "tritou-notes-backend-tests"];
// Fixed test-only endpoints: never read DATABASE_URL from the developer's .env.
const imageDirectory = mkdtempSync(join(tmpdir(), "tritou-images-integration-"));
const env = {
  ...process.env,
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://backend_test:backend_test@127.0.0.1:55432/backend_test",
  JWT_SECRET: "backend-integration-test-secret-32-bytes-long",
  ENCRYPTION_KEY: "ab".repeat(32),
  REDIS_HOST: "127.0.0.1", REDIS_PORT: "56379", REDIS_USERNAME: "", REDIS_PASSWORD: "",
  FRONTEND_URL: "http://localhost:5173",
  BACKEND_INTEGRATION: "1",
  IMAGE_STORAGE_PATH: imageDirectory,
};
function run(command, args) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
try {
  run("docker", [...compose, "up", "-d", "--wait", "--wait-timeout", "90"]);
  run("npx", ["prisma", "generate"]);
  run("npx", ["prisma", "db", "push"]);
  run("npx", ["vitest", "run", "--config", "vitest.integration.config.mts"]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  // Only this dedicated Compose project is removed; development services are untouched.
  const result = spawnSync("docker", [...compose, "down"], { cwd, env, stdio: "inherit" });
  if (result.status !== 0) process.exitCode = 1;
  rmSync(imageDirectory, { recursive: true, force: true });
}
