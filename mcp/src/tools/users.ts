import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { prisma } from "../prisma";

export const userTools: Tool[] = [
  {
    name: "list_users",
    description: "List all users (id, username, email, role). Passwords are never returned.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_user",
    description: "Get a user by ID with their permissions. Passwords are never returned.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "User ID" },
      },
      required: ["id"],
    },
  },
];

type Args = Record<string, unknown>;

export async function handleUserTool(name: string, args: Args): Promise<unknown> {
  switch (name) {
    case "list_users": {
      return prisma.user.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
        },
        orderBy: { id: "asc" },
      });
    }

    case "get_user": {
      const id = Number(args.id);
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          userPermissions: {
            select: {
              modifyScraper: true,
              useScraper: true,
              modifyScraperStatus: true,
              deleteScraper: true,
              createDocument: true,
              deleteDocument: true,
              modifyDocument: true,
              useAiChatBot: true,
              accessScrapersPage: true,
              accessInstancesScrapersPage: true,
            },
          },
        },
      });
      if (!user) throw new Error(`User ${id} not found`);
      return user;
    }

    default:
      throw new Error(`Unknown user tool: ${name}`);
  }
}
