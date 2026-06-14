import cronParser from "cron-parser";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { prisma } from "../prisma";
import { scrapeQueue } from "../queue";

export const schedulerTools: Tool[] = [
  {
    name: "list_schedulers",
    description: "List all scraping schedulers with their cron expression, status, and next run time.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_scheduler",
    description: "Get a scheduler by ID with its associated scrape instances (newest first).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Scheduler ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_scheduler",
    description: "Create a new scraping scheduler (starts DESACTIVATE, no cron expression yet).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Scheduler title" },
        description: { type: "string", description: "Optional description" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_scheduler",
    description: "Update a scheduler. Setting status to ACTIVATE with a cron_expression starts the recurring job. Setting status to DESACTIVATE stops it.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Scheduler ID" },
        title: { type: "string", description: "New title" },
        description: { type: "string", description: "New description" },
        status: {
          type: "string",
          enum: ["DESACTIVATE", "RUNNING", "ERROR", "ACTIVATE"],
          description: "New status",
        },
        cron_expression: {
          type: "string",
          description: "Cron expression (e.g. '0 0 */2 * *' = every 2 days at midnight)",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_scheduler",
    description: "Delete a scheduler by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Scheduler ID" },
      },
      required: ["id"],
    },
  },
];

type Args = Record<string, unknown>;

export async function handleSchedulerTool(name: string, args: Args): Promise<unknown> {
  switch (name) {
    case "list_schedulers": {
      return prisma.scrapingScheduler.findMany({
        orderBy: { created_at: "desc" },
      });
    }

    case "get_scheduler": {
      const id = Number(args.id);
      const scheduler = await prisma.scrapingScheduler.findUnique({
        where: { id },
        include: {
          InstanceScrapes: {
            orderBy: { created_at: "desc" },
          },
        },
      });
      if (!scheduler) throw new Error(`Scheduler ${id} not found`);
      return scheduler;
    }

    case "create_scheduler": {
      const { title, description } = args as { title: string; description?: string };
      return prisma.scrapingScheduler.create({
        data: { title, description },
      });
    }

    case "update_scheduler": {
      const { id, title, description, status, cron_expression } = args as {
        id: number;
        title?: string;
        description?: string;
        status?: "DESACTIVATE" | "RUNNING" | "ERROR" | "ACTIVATE";
        cron_expression?: string;
      };

      const previous = await prisma.scrapingScheduler.findFirst({ where: { id: Number(id) } });
      if (!previous) throw new Error(`Scheduler ${id} not found`);

      const updated = await prisma.scrapingScheduler.update({
        where: { id: Number(id) },
        data: {
          ...(title !== undefined && { title }),
          ...(description !== undefined && { description }),
          ...(status !== undefined && { status }),
          ...(cron_expression !== undefined && { cron_expression }),
        },
      });

      const jobName = `scheduler-${id}`;

      if (previous.status !== "ACTIVATE" && updated.status === "ACTIVATE") {
        if (updated.cron_expression) {
          await scrapeQueue.add(
            jobName,
            { schedulerId: Number(id) },
            { repeat: { pattern: updated.cron_expression }, jobId: jobName },
          );
          const interval = cronParser.parse(updated.cron_expression);
          const nextRun = interval.next().toDate();
          await prisma.scrapingScheduler.update({
            where: { id: Number(id) },
            data: {
              start_at: updated.start_at ?? new Date(),
              next_run_at: nextRun,
            },
          });
        }
      }

      if (previous.status === "ACTIVATE" && updated.status !== "ACTIVATE") {
        const repeatableJobs = await scrapeQueue.getRepeatableJobs();
        const job = repeatableJobs.find((j) => j.name === jobName);
        if (job) await scrapeQueue.removeRepeatableByKey(job.key);
        await prisma.scrapingScheduler.update({
          where: { id: Number(id) },
          data: { next_run_at: null },
        });
      }

      return updated;
    }

    case "delete_scheduler": {
      const id = Number(args.id);
      await prisma.scrapingScheduler.delete({ where: { id } });
      return { success: true, deleted_id: id };
    }

    default:
      throw new Error(`Unknown scheduler tool: ${name}`);
  }
}
