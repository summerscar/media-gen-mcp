/**
 * Smoke test: connect to a running server over Streamable HTTP, list tools and
 * optionally run one call. Usage:
 *   node test/smoke.mjs http://127.0.0.1:3000/mcp [tool] ['{"prompt":"..."}']
 */
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const url = process.argv[2] ?? "http://127.0.0.1:3000/mcp";
const toolName = process.argv[3];
const args = process.argv[4] ? JSON.parse(process.argv[4]) : undefined;

const client = new Client({ name: "media-mcp-smoke", version: "0.0.0" });
const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: process.env.MCP_AUTH_TOKEN
    ? { headers: { Authorization: `Bearer ${process.env.MCP_AUTH_TOKEN}` } }
    : undefined,
});

await client.connect(transport);
console.log("protocol:", client.getNegotiatedProtocolVersion?.() ?? "(n/a)");

const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));

if (toolName) {
  const started = Date.now();
  const result = await client.callTool({ name: toolName, arguments: args ?? {} });
  const ms = Date.now() - started;
  console.log("isError:", result.isError === true, `in ${ms} ms`);
  for (const block of result.content ?? []) {
    if (block.type === "text") console.log("text:", block.text.slice(0, 1200));
    else console.log(`${block.type} block:`, block.mimeType, `${Math.round((block.data?.length ?? 0) / 1024)} KiB base64`);
  }
}

await client.close();
