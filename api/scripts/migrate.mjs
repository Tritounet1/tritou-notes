// Applies pending Prisma migrations (run at API startup).
// A database created with `prisma db push`, before migrations existed, has tables but no
// migration history: `migrate deploy` refuses it (P3005). It is then baselined once on
// 0_init, the schema it was pushed with, and the later migrations are applied.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const prisma = (...args) => {
  const result = spawnSync("node_modules/.bin/prisma", args, { cwd, encoding: "utf8" });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.error) throw result.error;
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}` };
};

let deploy = prisma("migrate", "deploy");
if (!deploy.ok && deploy.output.includes("P3005")) {
  console.log("Existing database without migration history: marking 0_init as already applied.");
  if (!prisma("migrate", "resolve", "--applied", "0_init").ok) process.exit(1);
  deploy = prisma("migrate", "deploy");
}
process.exit(deploy.ok ? 0 : 1);
