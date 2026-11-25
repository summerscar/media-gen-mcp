#!/usr/bin/env node
/**
 * Entry point. `--stdio` serves the same tools over stdio (local clients, npx);
 * otherwise it serves Streamable HTTP at POST /mcp.
 */
import { createServer } from "node:http";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { config } from "./config.js";
import { startModelWatch } from "./models.js";
import { registerTools } from "./tools.js";

startModelWatch();

function factory() {
  const server = new McpServer({ name: "media-gen-mcp", version: config.version });
  registerTools(server);
  return server;
}

const stdioMode = process.argv.includes("--stdio") || process.env.MCP_TRANSPORT === "stdio";

if (stdioMode) {
  const handle = serveStdio(factory);
  console.error("media-gen-mcp listening on stdio");
  const shutdown = () => void handle.close().finally(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} else {
  const handler = createMcpHandler(factory);
  const nodeHandler = toNodeHandler(handler);
  const { port, host, path, token } = config.http;

  const httpServer = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          version: config.version,
          providers: {
            sensenova: Boolean(config.sensenova.apiKey),
            agnes: Boolean(config.agnes.apiKey),
          },
        }),
      );
      return;
    }

    if (url.pathname !== path && url.pathname !== `${path}/`) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found", mcp: path }));
      return;
    }

    if (token) {
      const header = req.headers.authorization ?? "";
      const expected = `Bearer ${token}`;
      if (header.length !== expected.length || !timingSafeEqual(header, expected)) {
        res.writeHead(401, { "content-type": "application/json", "www-authenticate": "Bearer" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
    }

    void nodeHandler(req, res);
  });

  httpServer.listen(port, host, () => {
    console.error(`media-gen-mcp listening on http://${host}:${port}${path}`);
  });

  const shutdown = () => {
    httpServer.close();
    void handler.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function timingSafeEqual(a, b) {
  // Constant-time compare without pulling in crypto for a length-checked string.
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
