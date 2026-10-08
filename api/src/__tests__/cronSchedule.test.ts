import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

const load = async () => {
  vi.resetModules();
  return import("../utils/cronSchedule");
};

it("reads crons in UTC by default", async () => {
  vi.stubEnv("SCHEDULER_TIMEZONE", "");
  const { nextCronRun, SCHEDULER_TIMEZONE } = await load();
  expect(SCHEDULER_TIMEZONE).toBe("UTC");
  expect(nextCronRun("0 8 * * *").getUTCHours()).toBe(8);
});

it("reads crons in SCHEDULER_TIMEZONE when set", async () => {
  vi.stubEnv("SCHEDULER_TIMEZONE", "Asia/Tokyo"); // UTC+9, no daylight saving
  const { nextCronRun, parseCron } = await load();
  expect(nextCronRun("0 8 * * *").getUTCHours()).toBe(23);
  const runs = parseCron("0 0 * * *", { currentDate: new Date("2026-10-08T00:00:00Z"), endDate: new Date("2026-10-10T00:00:00Z") });
  expect(runs.next().toDate().toISOString()).toBe("2026-10-08T15:00:00.000Z");
});
