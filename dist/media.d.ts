import type { CallToolResult } from "@modelcontextprotocol/server";
/** Width/height from PNG, JPEG and WebP headers. Undefined for anything else. */
export declare function dimensions(buf: Buffer, mime?: string): {
    width: number;
    height: number;
} | undefined;
export type SavedFile = {
    path: string;
    mime: string;
    bytes: number;
    width?: number;
    height?: number;
    /** Inline base64 for image files (always, no size cap); absent for video/audio. */
    previewBase64?: string;
};
export declare function saveBuffer(buf: Buffer, provider: string, fallbackMime?: string): Promise<SavedFile>;
/** Download a provider URL (or decode a data URI) into the local media directory. */
export declare function saveFromUrl(url: string, provider: string): Promise<SavedFile>;
/** Turn one saved file plus provider metadata into an MCP tool result. */
export declare function toolResult(file: SavedFile, meta: Record<string, unknown>, opts?: {
    inlineImage?: boolean;
}): CallToolResult;
export declare function errorResult(error: unknown): CallToolResult;
