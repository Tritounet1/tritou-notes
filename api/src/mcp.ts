import dotenv from "dotenv";
dotenv.config();

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpApp } from "./mcp/http";
import { buildServer, stdioUser } from "./mcp/server";

// MCP server entry point: HTTP on MCP_HTTP_PORT (production), stdio otherwise (local client).

const start = async () => {
  const port = process.env.MCP_HTTP_PORT ? Number(process.env.MCP_HTTP_PORT) : null;
  if (port) {
    createMcpApp().listen(port, () => process.stderr.write(`Tritou Notes MCP — HTTP on port ${port}\n`));
    return;
  }
  const userId = await stdioUser();
  if (userId === null) throw new Error("No MCP token: generate one in Tritou Notes › Paramètres › MCP (stdio acts as its user).");
  await buildServer(userId).connect(new StdioServerTransport());
  process.stderr.write("Tritou Notes MCP — stdio\n");
};

start().catch((error) => {
  process.stderr.write(`Fatal: ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
