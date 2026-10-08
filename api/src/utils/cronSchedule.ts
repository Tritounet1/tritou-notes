import cronParser from "cron-parser";

/**
 * Time zone of scheduler crons ("0 8 * * *" = 8:00 there), shared by BullMQ, the worker and the
 * API so their next runs agree. Defaults to UTC, the containers' zone.
 */
export const SCHEDULER_TIMEZONE = process.env.SCHEDULER_TIMEZONE || "UTC";

export const parseCron = (cron: string, options: { currentDate?: Date; endDate?: Date } = {}) =>
  cronParser.parse(cron, { ...options, tz: SCHEDULER_TIMEZONE });

export const nextCronRun = (cron: string) => parseCron(cron).next().toDate();
