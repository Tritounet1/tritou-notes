import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { authorize, buildServer } from "./server";

/** Stateless Streamable HTTP endpoint on /mcp, behind the bearer token. */
export const createMcpApp = () => {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "5mb" }));

  // /mcp/health when the app's domain proxies /mcp to this server.
  app.get(["/health", "/mcp/health"], (_req, res) => {
    res.json({ ok: true });
  });

  app.all("/mcp", async (req, res) => {
    try {
      const userId = await authorize(req.headers.authorization);
      if (userId === null) {
        res.status(401).json({ error: "Unauthorized — generate a token in Tritou Notes › Paramètres › MCP" });
        return;
      }
      const server = buildServer(userId);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP request failed", error);
      if (!res.headersSent) res.status(500).json({ error: "MCP request failed" });
    }
  });

  return app;
};
