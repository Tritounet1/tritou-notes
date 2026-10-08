import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { prisma } from "../config/prismaClient";
import { WORKSPACE_GUIDE } from "../ai/agent";
import { runTool, toolDefinitions, type ToolContext } from "../ai/tools";
import { hashMcpToken } from "../utils/mcpToken";

// The MCP server exposes the assistant's own tools: same validation, services, page history
// and permissions as the in-app assistant. It acts as the user of the personal token it was
// given (Paramètres › MCP); a read-only token only gets the tools that read.

export const MCP_INSTRUCTIONS = ["Tritou Notes : pages Markdown, tableurs, to-do et scraping web planifié.", ...WORKSPACE_GUIDE].join("\n");

/** Tools that change nothing: the only ones a read-only token can list and call. */
export const READ_ONLY_TOOLS = new Set([
  "list_folders", "list_users", "list_pages", "search_pages", "read_page",
  "list_scrapers", "read_scraper", "list_schedulers", "read_scheduler",
  "list_instances", "read_instance", "wait_for_instance",
]);

export interface McpIdentity {
  userId: number;
  readOnly: boolean;
}

/** The identity of a personal token, or null (unknown or revoked token). */
const identityOf = async (token: string): Promise<McpIdentity | null> => {
  if (!token) return null;
  // The token has 256 random bits: looking its hash up directly is safe.
  const found = await prisma.mcpToken.findUnique({ where: { hash: hashMcpToken(token) } });
  if (!found) return null;
  void prisma.mcpToken.update({ where: { id: found.id }, data: { last_used_at: new Date() } }).catch(() => {});
  return { userId: found.userId, readOnly: found.readOnly };
};

/** Checks a bearer header against the personal tokens (fail closed). */
export const authorize = async (header: string | undefined) =>
  identityOf(header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "");

/** For stdio (local process, no header): the token is read from MCP_TOKEN. */
export const stdioIdentity = () => identityOf(process.env.MCP_TOKEN?.trim() ?? "");

/** Role and permissions are read again for every call, like authMiddleware does. */
const toolContext = async (userId: number): Promise<ToolContext> => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("L’utilisateur du jeton MCP n’existe plus.");
  return {
    userId,
    isAdmin: user.role === "ADMIN",
    permissions: await prisma.userPermissions.findUnique({ where: { userId } }),
    changed: new Set<number>(),
  };
};

export const buildServer = ({ userId, readOnly }: McpIdentity) => {
  const server = new Server({ name: "tritou-notes", version: "2.1.0" }, { capabilities: { tools: {} }, instructions: MCP_INSTRUCTIONS });
  const allowed = (name: string) => !readOnly || READ_ONLY_TOOLS.has(name);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions
      .filter(({ function: { name } }) => allowed(name))
      .map(({ function: { name, description, parameters } }) => ({ name, description, inputSchema: parameters as { type: "object" } })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    if (!allowed(params.name)) {
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: "Jeton en lecture seule : cet outil modifie des données." }) }], isError: true };
    }
    const result = await runTool(params.name, JSON.stringify(params.arguments ?? {}), await toolContext(userId));
    return { content: [{ type: "text" as const, text: JSON.stringify(result.output, null, 2) }], isError: !result.ok };
  });

  return server;
};
