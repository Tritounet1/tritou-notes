import crypto from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { prisma } from "../config/prismaClient";
import { WORKSPACE_GUIDE } from "../ai/agent";
import { runTool, toolDefinitions, type ToolContext } from "../ai/tools";
import { hashMcpToken } from "../utils/mcpToken";

// The MCP server exposes the assistant's own tools: same validation, services, page history
// and permissions as the in-app assistant. It acts as the admin who generated the token.

export const MCP_INSTRUCTIONS = ["Tritou Notes : pages Markdown, tableurs, to-do et scraping web planifié.", ...WORKSPACE_GUIDE].join("\n");

const sameDigest = (a: Buffer, b: Buffer) => a.length === b.length && crypto.timingSafeEqual(a, b);

/** The user the token acts as, or null when no token is configured or its user is gone. */
const tokenUser = async () => {
  const settings = await prisma.settings.findFirst({ select: { mcpTokenHash: true, mcpTokenUserId: true } });
  if (!settings?.mcpTokenHash || !settings.mcpTokenUserId) return null;
  const user = await prisma.user.findUnique({ where: { id: settings.mcpTokenUserId } });
  return user ? { user, hash: settings.mcpTokenHash } : null;
};

/** Checks a bearer header against the token generated in Settings › MCP (fail closed). */
export const authorize = async (header: string | undefined): Promise<number | null> => {
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) return null;
  const owner = await tokenUser();
  if (!owner) return null;
  return sameDigest(Buffer.from(hashMcpToken(token), "hex"), Buffer.from(owner.hash, "hex")) ? owner.user.id : null;
};

/** For stdio (local process, no header): acts as the token's user, if a token exists. */
export const stdioUser = async () => (await tokenUser())?.user.id ?? null;

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

export const buildServer = (userId: number) => {
  const server = new Server({ name: "tritou-notes", version: "2.0.0" }, { capabilities: { tools: {} }, instructions: MCP_INSTRUCTIONS });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions.map(({ function: { name, description, parameters } }) => ({ name, description, inputSchema: parameters as { type: "object" } })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    const result = await runTool(params.name, JSON.stringify(params.arguments ?? {}), await toolContext(userId));
    return { content: [{ type: "text" as const, text: JSON.stringify(result.output, null, 2) }], isError: !result.ok };
  });

  return server;
};
