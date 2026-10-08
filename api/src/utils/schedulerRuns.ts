import { parseCron } from "./cronSchedule";

// Extra data for the dashboard "En direct" panel and the schedulers' 24 h timeline.
export const RECENT_RUNS = 14;
const TIMELINE_HOURS = 24;
const MAX_TIMELINE_RUNS = 200;

type Run = { status: string; at: Date };

/**
 * Last scrape outcomes, oldest first. History rows only hold *previous* results
 * (the worker archives the old response before writing the new one), so the
 * instances' current statuses are merged in to include the latest run.
 */
export const recentRuns = (
  instances: { status: string; last_update: Date }[],
  histories: { status: string; created_at: Date }[],
): Run[] =>
  [
    ...instances.map((i) => ({ status: i.status, at: i.last_update })),
    ...histories.map((h) => ({ status: h.status, at: h.created_at })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, RECENT_RUNS)
    .reverse();

/** Cron occurrences within ±24 h of `now` (in SCHEDULER_TIMEZONE, like the worker and BullMQ). */
export const cronRunsAround = (cron: string | null, now: Date): string[] => {
  if (!cron) return [];
  try {
    const interval = parseCron(cron, {
      currentDate: new Date(now.getTime() - TIMELINE_HOURS * 3_600_000),
      endDate: new Date(now.getTime() + TIMELINE_HOURS * 3_600_000),
    });
    const runs: string[] = [];
    while (runs.length < MAX_TIMELINE_RUNS && interval.hasNext()) {
      runs.push(interval.next().toDate().toISOString());
    }
    return runs;
  } catch {
    return [];
  }
};
