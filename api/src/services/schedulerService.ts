import cronParser from "cron-parser";
import { prisma } from "../config/prismaClient";
import { scrapeQueue } from "../config/queue";

// Scheduler changes with queue side effects, shared by the REST controller and the AI tools.

const jobName = (id: number) => `scheduler-${id}`;
const badRequest = (message: string) => Object.assign(new Error(message), { status: 400 });

/** A scheduler keeps its repeatable job unless it is explicitly deactivated (RUNNING and ERROR still run). */
const isScheduled = (status: string | null | undefined) => Boolean(status) && status !== "DESACTIVATE";

export const assertValidCron = (cron: string) => {
  try {
    cronParser.parse(cron);
  } catch {
    throw badRequest(`Expression cron invalide : « ${cron} »`);
  }
};

const schedule = async (id: number, cron: string, startAt: Date | null) => {
  await scrapeQueue.add(jobName(id), { schedulerId: id }, { repeat: { pattern: cron }, jobId: jobName(id) });
  await prisma.scrapingScheduler.update({
    where: { id },
    data: { start_at: startAt || new Date(), next_run_at: cronParser.parse(cron).next().toDate() },
  });
};

const unschedule = async (id: number) => {
  const job = (await scrapeQueue.getRepeatableJobs()).find((repeatable) => repeatable.name === jobName(id));
  if (job) await scrapeQueue.removeRepeatableByKey(job.key);
};

export interface SchedulerChanges {
  title?: string;
  description?: string | null;
  status?: "ACTIVATE" | "DESACTIVATE" | "RUNNING" | "ERROR";
  cron_expression?: string | null;
}

/**
 * Updates a scheduler and keeps its repeatable job in sync: activating schedules it,
 * deactivating removes it, and changing the cron of a scheduled one reschedules it.
 */
export const updateScheduler = async (id: number, userId: number, changes: SchedulerChanges) => {
  const previous = await prisma.scrapingScheduler.findFirst({ where: { id } });
  if (!previous) throw new Error("La Scraping Scheduler n'existe pas");
  const author = await prisma.user.findFirst({ where: { id: userId } });
  if (!author) throw new Error("Utilisateur introuvable");
  if (changes.cron_expression) assertValidCron(changes.cron_expression);

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

  if (wasScheduled && (!nowScheduled || cronChanged)) {
    await unschedule(id);
    if (!nowScheduled || !scheduler.cron_expression) {
      await prisma.scrapingScheduler.update({ where: { id }, data: { next_run_at: null } });
    }
  }
  if (nowScheduled && scheduler.cron_expression && (!wasScheduled || cronChanged)) {
    await schedule(id, scheduler.cron_expression, scheduler.start_at);
  }
  return scheduler;
};

/** Deletes a scheduler and its repeatable job (its URLs stay as standalone instances). */
export const deleteScheduler = async (id: number) => {
  await unschedule(id);
  return prisma.scrapingScheduler.delete({ where: { id } });
};
