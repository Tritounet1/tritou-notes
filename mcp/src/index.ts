import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import { IncomingMessage, ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { documentTools, handleDocumentTool } from "./tools/documents";
import { scraperTools, handleScraperTool } from "./tools/scrapers";
import { instanceTools, handleInstanceTool } from "./tools/instances";
import { schedulerTools, handleSchedulerTool } from "./tools/schedulers";
import { userTools, handleUserTool } from "./tools/users";
import { commandTools, handleCommandTool } from "./tools/commands";
import { prisma } from "./prisma";

const allTools = [
  ...documentTools,
  ...scraperTools,
  ...instanceTools,
  ...schedulerTools,
  ...userTools,
  ...commandTools,
];

const documentToolNames = new Set(documentTools.map((t) => t.name));
const scraperToolNames = new Set(scraperTools.map((t) => t.name));
const instanceToolNames = new Set(instanceTools.map((t) => t.name));
const schedulerToolNames = new Set(schedulerTools.map((t) => t.name));
const userToolNames = new Set(userTools.map((t) => t.name));
const commandToolNames = new Set(commandTools.map((t) => t.name));

function buildServer(): Server {
  const server = new Server(
    { name: "tritou-notes", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    try {
      let result: unknown;
      if (documentToolNames.has(name)) {
        result = await handleDocumentTool(name, args as Record<string, unknown>);
      } else if (scraperToolNames.has(name)) {
        result = await handleScraperTool(name, args as Record<string, unknown>);
      } else if (instanceToolNames.has(name)) {
        result = await handleInstanceTool(name, args as Record<string, unknown>);
      } else if (schedulerToolNames.has(name)) {
        result = await handleSchedulerTool(name, args as Record<string, unknown>);
      } else if (userToolNames.has(name)) {
        result = await handleUserTool(name, args as Record<string, unknown>);
      } else if (commandToolNames.has(name)) {
        result = await handleCommandTool(name);
      } else {
        throw new Error(`Unknown tool: ${name}`);
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  });

  return server;
}

async function startStdio() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("Tritou Notes MCP — mode stdio\n");
}

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest();
const sameDigest = (a: Buffer, b: Buffer) => a.length === b.length && crypto.timingSafeEqual(a, b);

/**
 * Checks the bearer token against the one generated in the app (Paramètres › MCP).
 * Only its SHA-256 is stored, in Settings.mcpTokenHash; no token generated = no access.
 */
async function isAuthorized(header: string | undefined): Promise<boolean> {
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) return false;
  const digest = sha256(token);
  const settings = await prisma.settings.findFirst({ select: { mcpTokenHash: true } });
  return Boolean(settings?.mcpTokenHash) && sameDigest(digest, Buffer.from(settings!.mcpTokenHash!, "hex"));
}

async function startHttp(port: number) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Fail closed: with no token configured at all, every request is rejected.
  app.use(async (req, res, next) => {
    try {
      if (await isAuthorized(req.headers.authorization)) {
        next();
        return;
      }
      res.status(401).json({ error: "Unauthorized — generate a token in Tritou Notes › Paramètres › MCP" });
    } catch (err) {
      process.stderr.write(`Auth check failed: ${err}\n`);
      res.status(500).json({ error: "Auth check failed" });
    }
  });

  app.all("/mcp", async (req: IncomingMessage, res: ServerResponse) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const server = buildServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, (req as express.Request).body);
    res.on("finish", async () => {
      await transport.close();
      await server.close();
    });
  });

  app.listen(port, () => {
    process.stderr.write(`Tritou Notes MCP — mode HTTP sur le port ${port}\n`);
  });
}

const httpPort = process.env.MCP_HTTP_PORT ? parseInt(process.env.MCP_HTTP_PORT) : null;

if (httpPort) {
  startHttp(httpPort).catch((err) => {
    process.stderr.write(`Fatal: ${err}\n`);
    process.exit(1);
  });
} else {
  startStdio().catch((err) => {
    process.stderr.write(`Fatal: ${err}\n`);
    process.exit(1);
  });
}
