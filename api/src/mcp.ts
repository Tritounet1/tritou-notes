import dotenv from "dotenv";
dotenv.config();

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, stdioIdentity } from "./mcp/server";
import { assertConfig } from "./config/validateConfig";

assertConfig("mcp", {});

// MCP server over stdio, for a local client. Over HTTP it is served by the API on /mcp.

const start = async () => {
  const identity = await stdioIdentity();
  if (identity === null) throw new Error("Set MCP_TOKEN to a personal token from Tritou Notes › Paramètres › MCP (stdio acts as its user).");
  await buildServer(identity).connect(new StdioServerTransport());
  process.stderr.write("Tritou Notes MCP — stdio\n");
};

start().catch((error) => {
  process.stderr.write(`Fatal: ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
