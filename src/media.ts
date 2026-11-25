import { mkdir, writeFile } from "node:fs/promises";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

const EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
};

function sniffMime(buf: Buffer): string | undefined {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length > 12 && buf.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
  return undefined;
}

/** Width/height from PNG, JPEG and WebP headers. Undefined for anything else. */
export function dimensions(buf: Buffer, mime?: string): { width: number; height: number } | undefined {
  try {
    if (mime === "image/png" || (buf[0] === 0x89 && buf[1] === 0x50)) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (mime === "image/jpeg" || (buf[0] === 0xff && buf[1] === 0xd8)) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
        }
        i += 2 + len;
      }
      return undefined;
    }
    if (mime === "image/webp" || (buf.length > 16 && buf.toString("ascii", 8, 12) === "WEBP")) {
      const chunk = buf.toString("ascii", 12, 16);
      if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (chunk === "VP8L") {
        const bits = buf.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (chunk === "VP8X") return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
    }
  } catch {
    /* ignore malformed headers */
  }
  return undefined;
}

export type SavedFile = {
  path: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  /** Inline base64 for image files (always, no size cap); absent for video/audio. */
  previewBase64?: string;
};

export async function saveBuffer(buf: Buffer, provider: string, fallbackMime?: string): Promise<SavedFile> {
  const mime = sniffMime(buf) || fallbackMime || "application/octet-stream";
  const day = new Date().toISOString().slice(0, 10);
  const dir = join(config.mediaDir, provider, day);
  await mkdir(dir, { recursive: true });
  const ext = EXT[mime] ?? (extname(mime) || ".bin");
  const path = join(dir, `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`);
  await writeFile(path, buf);
  const dim = dimensions(buf, mime);
  /** Images are always inlined: callers may not share this filesystem, so a path alone is useless to them. */
  const preview = mime.startsWith("image/") ? buf.toString("base64") : undefined;
  return { path, mime, bytes: buf.length, ...(dim ?? {}), ...(preview ? { previewBase64: preview } : {}) };
}

/** Download a provider URL (or decode a data URI) into the local media directory. */
export async function saveFromUrl(url: string, provider: string): Promise<SavedFile> {
  if (url.startsWith("data:")) {
    const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url);
    if (!match) throw new Error("unsupported data URI");
    const buf = match[2] ? Buffer.from(match[3], "base64") : Buffer.from(decodeURIComponent(match[3]), "utf8");
    return saveBuffer(buf, provider, match[1]);
  }
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type")?.split(";")[0]?.trim();
  return saveBuffer(buf, provider, mime);
}

/** Turn one saved file plus provider metadata into an MCP tool result. */
export function toolResult(
  file: SavedFile,
  meta: Record<string, unknown>,
  opts: { inlineImage?: boolean } = {},
): CallToolResult {
  const { previewBase64, ...rest } = file;
  const payload = { ...rest, ...meta };
  const content: CallToolResult["content"] = [];
  if (opts.inlineImage !== false && previewBase64) {
    content.push({ type: "image", data: previewBase64, mimeType: file.mime });
  }
  content.push({ type: "text", text: JSON.stringify(payload, null, 2) });
  return { content };
}

export function errorResult(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}
