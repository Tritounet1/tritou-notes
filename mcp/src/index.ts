import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("Tritou Notes MCP server running\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
