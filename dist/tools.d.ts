/**
 * Tool surface: one namespace per provider, so a client can hide either
 * provider wholesale and the model only sees models and knobs that exist.
 */
import type { McpServer } from "@modelcontextprotocol/server";
export declare function registerTools(server: McpServer): void;
