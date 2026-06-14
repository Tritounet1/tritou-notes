import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { prisma } from "../prisma";
import { scrapeQueue } from "../queue";

export const instanceTools: Tool[] = [
  {
    name: "list_instances",
    description: "List all scrape instances with their status, URL, and associated scraper.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_instance",
    description: "Get a scrape instance by ID with its full response data and history.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Instance ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "run_scrape",
    description: "Create a new scrape instance and immediately queue it for execution. Use this to test a scraper against a URL.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to scrape" },
        scraperId: { type: "number", description: "ID of the scraper to use" },
      },
      required: ["url", "scraperId"],
    },
  },
  {
    name: "delete_instance",
    description: "Delete a scrape instance by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Instance ID" },
      },
      required: ["id"],
    },
  },
];

type Args = Record<string, unknown>;

export async function handleInstanceTool(name: string, args: Args): Promise<unknown> {
  switch (name) {
    case "list_instances": {
      return prisma.instanceScrape.findMany({
        include: {
          scraper: { select: { id: true, name: true, display_template: true } },
        },
        orderBy: { created_at: "desc" },
      });
    }

    case "get_instance": {
      const id = Number(args.id);
      const instance = await prisma.instanceScrape.findUnique({
        where: { id },
        include: {
          scraper: { select: { id: true, name: true, display_template: true } },
          instanceScrapeHistories: {
            orderBy: { created_at: "desc" },
            take: 10,
          },
        },
      });
      if (!instance) throw new Error(`Instance ${id} not found`);
      return instance;
    }

    case "run_scrape": {
      const { url, scraperId } = args as { url: string; scraperId: number };
      const instance = await prisma.instanceScrape.create({
        data: {
          url,
          scraperId: Number(scraperId),
        },
      });
      await scrapeQueue.add("scrape-url", { id: instance.id });
      return { ...instance, queued: true };
    }

    case "delete_instance": {
      const id = Number(args.id);
      await prisma.instanceScrape.delete({ where: { id } });
      return { success: true, deleted_id: id };
    }

    default:
      throw new Error(`Unknown instance tool: ${name}`);
  }
}
