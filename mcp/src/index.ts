import "dotenv/config";
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

const allTools = [
  ...documentTools,
  ...scraperTools,
  ...instanceTools,
  ...schedulerTools,
  ...userTools,
];

const documentToolNames = new Set(documentTools.map((t) => t.name));
const scraperToolNames = new Set(scraperTools.map((t) => t.name));
const instanceToolNames = new Set(instanceTools.map((t) => t.name));
const schedulerToolNames = new Set(schedulerTools.map((t) => t.name));
const userToolNames = new Set(userTools.map((t) => t.name));

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

async function startHttp(port: number, authToken: string) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use((req, res, next) => {
    const auth = req.headers.authorization;
    if (!authToken || auth === `Bearer ${authToken}`) {
      next();
      return;
    }
    res.status(401).json({ error: "Unauthorized" });
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
const authToken = process.env.MCP_AUTH_TOKEN ?? "";

if (httpPort) {
  startHttp(httpPort, authToken).catch((err) => {
    process.stderr.write(`Fatal: ${err}\n`);
    process.exit(1);
  });
} else {
  startStdio().catch((err) => {
    process.stderr.write(`Fatal: ${err}\n`);
    process.exit(1);
  });
}
