import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js", "--stdio"],
  env: { ...process.env },
});
const client = new Client({ name: "stdio-smoke", version: "0.0.0" });
await client.connect(transport);
const { tools } = await client.listTools();
console.log("transport: stdio, tools:", tools.map((t) => t.name).join(", "));
await client.close();
