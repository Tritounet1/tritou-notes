import cronParser from "cron-parser";
import { prisma } from "../config/prismaClient";
import { scrapeQueue } from "../config/queue";
import { httpError, notFound } from "../utils/httpError";

// Scheduler changes with queue side effects, shared by the REST controller and the AI tools.

const jobName = (id: number) => `scheduler-${id}`;

/** A scheduler keeps its repeatable job unless it is explicitly deactivated (RUNNING and ERROR still run). */
const isScheduled = (status: string | null | undefined) => Boolean(status) && status !== "DESACTIVATE";

export const assertValidCron = (cron: string) => {
  try {
    cronParser.parse(cron);
  } catch {
    throw httpError(`Expression cron invalide : « ${cron} »`);
  }
};

const schedule = async (id: number, cron: string, startAt: Date | null) => {
  // One BullMQ job scheduler per scheduler, keyed by its job name. A start date in the future
  // delays the first run (BullMQ ignores past ones).
  await scrapeQueue.upsertJobScheduler(jobName(id), { pattern: cron, ...(startAt && { startDate: startAt }) }, { name: jobName(id), data: { schedulerId: id } });
  await prisma.scrapingScheduler.update({
    where: { id },
    data: { start_at: startAt || new Date(), next_run_at: cronParser.parse(cron).next().toDate() },
  });
};

const unschedule = async (id: number) => {
  await scrapeQueue.removeJobScheduler(jobName(id));
};

/**
 * Converts repeatable jobs created with the former `add(name, data, { repeat })` API (keyed by
 * a hash, not by their name) into job schedulers. Run at API startup; returns how many moved.
 * Without it, a scheduler changed after the upgrade would run twice.
 */
export const migrateLegacySchedulerJobs = async () => {
  const legacy = (await scrapeQueue.getJobSchedulers()).filter((job) => job.name.startsWith("scheduler-") && job.key !== job.name);
  for (const job of legacy) {
    await scrapeQueue.removeJobScheduler(job.key);
    const id = Number(job.name.slice("scheduler-".length));
    const scheduler = await prisma.scrapingScheduler.findUnique({ where: { id } });
    if (scheduler && isScheduled(scheduler.status) && scheduler.cron_expression) await schedule(id, scheduler.cron_expression, scheduler.start_at);
  }
  return legacy.length;
};

export interface SchedulerChanges {
  title?: string;
  description?: string | null;
  /** Configuration only: RUNNING and ERROR are run states set by the worker. */
  status?: "ACTIVATE" | "DESACTIVATE";
  cron_expression?: string | null;
}

/**
 * Updates a scheduler and keeps its repeatable job in sync: activating schedules it,
 * deactivating removes it, and changing the cron of a scheduled one reschedules it.
 */
export const updateScheduler = async (id: number, userId: number, changes: SchedulerChanges) => {
  const previous = await prisma.scrapingScheduler.findFirst({ where: { id } });
  if (!previous) throw notFound("Le planificateur n'existe pas");
  const author = await prisma.user.findFirst({ where: { id: userId } });
  if (!author) throw new Error("Utilisateur introuvable");
  if (changes.status !== undefined && changes.status !== "ACTIVATE" && changes.status !== "DESACTIVATE") {
    throw httpError("`status` doit valoir ACTIVATE ou DESACTIVATE (RUNNING et ERROR sont gérés par le worker).");
  }
  if (changes.cron_expression) assertValidCron(changes.cron_expression);
  const nextStatus = changes.status ?? previous.status;
  const nextCron = changes.cron_expression === undefined ? previous.cron_expression : changes.cron_expression;
  if (isScheduled(nextStatus) && !nextCron) throw httpError("Un cron est nécessaire pour activer le planificateur.");

  const scheduler = await prisma.scrapingScheduler.update({
    where: { id },
    data: {
      title: changes.title,
      description: changes.description,
      status: changes.status,
      cron_expression: changes.cron_expression,
    },
  });

  const wasScheduled = isScheduled(previous.status);
  const nowScheduled = isScheduled(scheduler.status);
  const cronChanged = changes.cron_expression !== undefined && changes.cron_expression !== previous.cron_expression;

  try {
    if (wasScheduled && (!nowScheduled || cronChanged)) {
      await unschedule(id);
      if (!nowScheduled || !scheduler.cron_expression) {
        await prisma.scrapingScheduler.update({ where: { id }, data: { next_run_at: null } });
      }
    }
    if (nowScheduled && scheduler.cron_expression && (!wasScheduled || cronChanged)) {
      await schedule(id, scheduler.cron_expression, scheduler.start_at);
    }
  } catch (error) {
    // The queue refused the change: restore the previous configuration so the database
    // never shows a scheduler as active without its job (or the reverse).
    await prisma.scrapingScheduler
      .update({ where: { id }, data: { status: previous.status, cron_expression: previous.cron_expression, next_run_at: previous.next_run_at } })
      .catch(() => {});
    if (wasScheduled && previous.cron_expression) await schedule(id, previous.cron_expression, previous.start_at).catch(() => {});
    throw error;
  }
  return scheduler;
};

/** Deletes a scheduler and its repeatable job (its URLs stay as standalone instances). */
export const deleteScheduler = async (id: number) => {
  await unschedule(id);
  return prisma.scrapingScheduler.delete({ where: { id } });
};
