import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { prisma } from "../prisma";

export const scraperTools: Tool[] = [
  {
    name: "list_scrapers",
    description: "List all scrapers with their status, base URLs, and metadata.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_scraper",
    description: "Get a scraper by ID with its full code and display template.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Scraper ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_scraper",
    description: "Create a new scraper (starts with empty code, DISABLE status).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Scraper name" },
        description: { type: "string", description: "Optional description" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_scraper",
    description: "Update a scraper's name, description, code, browser mode, base URLs, status, or display template.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Scraper ID" },
        name: { type: "string", description: "New name" },
        description: { type: "string", description: "New description" },
        code: { type: "string", description: "JavaScript scraper code executed in a VM context" },
        browser: { type: "boolean", description: "Use Puppeteer browser (true) or Cheerio HTTP (false)" },
        base_url: {
          type: "array",
          items: { type: "string" },
          description: "Allowed base URLs for this scraper",
        },
        status: {
          type: "string",
          enum: ["ACTIVE", "DISABLE"],
          description: "Scraper status",
        },
        display_template: {
          type: "object",
          description: "JSON template for rendering scraped data in the UI",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_scraper",
    description: "Delete a scraper by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Scraper ID" },
      },
      required: ["id"],
    },
  },
];

type Args = Record<string, unknown>;

export async function handleScraperTool(name: string, args: Args): Promise<unknown> {
  switch (name) {
    case "list_scrapers": {
      return prisma.scraper.findMany({
        select: {
          id: true,
          name: true,
          description: true,
          browser: true,
          base_url: true,
          status: true,
          created_at: true,
          last_update: true,
        },
        orderBy: { last_update: "desc" },
      });
    }

    case "get_scraper": {
      const id = Number(args.id);
      const scraper = await prisma.scraper.findUnique({ where: { id } });
      if (!scraper) throw new Error(`Scraper ${id} not found`);
      return scraper;
    }

    case "create_scraper": {
      const { name, description } = args as { name: string; description?: string };
      return prisma.scraper.create({
        data: { name, description: description ?? "" },
      });
    }

    case "update_scraper": {
      const { id, name, description, code, browser, base_url, status, display_template } = args as {
        id: number;
        name?: string;
        description?: string;
        code?: string;
        browser?: boolean;
        base_url?: string[];
        status?: "ACTIVE" | "DISABLE";
        display_template?: unknown;
      };
      return prisma.scraper.update({
        where: { id: Number(id) },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(code !== undefined && { code }),
          ...(browser !== undefined && { browser }),
          ...(base_url !== undefined && { base_url }),
          ...(status !== undefined && { status }),
          ...(display_template !== undefined && { display_template: display_template as object }),
          last_update: new Date(),
        },
      });
    }

    case "delete_scraper": {
      const id = Number(args.id);
      await prisma.scraper.delete({ where: { id } });
      return { success: true, deleted_id: id };
    }

    default:
      throw new Error(`Unknown scraper tool: ${name}`);
  }
}
