/**
 * SenseNova image adapter.
 * Model: sensenova-u1.6-lite — POST /images/generations and POST /images/edits.
 * Docs: https://platform.sensenova.cn/docs
 */
import { config, requireKey } from "./config.js";

export const SENSENOVA_RATIOS = ["1:1", "16:9", "9:16", "2:3", "3:2"];

/** 2K sizes as documented; 4K scales the same ratio and snaps to a multiple of 32. */
const SIZE_2K = {
  "1:1": [2048, 2048],
  "16:9": [2720, 1536],
  "9:16": [1536, 2720],
  "2:3": [1664, 2496],
  "3:2": [2496, 1664],
};

function snap(n) {
  return Math.max(512, Math.min(4096, Math.round(n / 32) * 32));
}

/**
 * Resolve the `size` field the API wants: an exact `WxH` between 512 and 4096,
 * a multiple of 32, ratio no wider than 3:1.
 */
export function resolveSize({ size, resolution, aspectRatio } = {}) {
  if (size && /^\d{2,5}x\d{2,5}$/.test(size)) return size;
  const ratio = aspectRatio && SIZE_2K[aspectRatio] ? aspectRatio : "1:1";
  const [w, h] = SIZE_2K[ratio];
  if (resolution === "4K") {
    const scale = 4096 / Math.max(w, h);
    return `${snap(w * scale)}x${snap(h * scale)}`;
  }
  return `${w}x${h}`;
}

/**
 * Result shape: { url?, b64?, size?, outputFormat?, usage?, requestSize }
 * url is the provider CDN link (24 h); b64 is present when response_format is b64_json.
 */
async function call(path, body) {
  const key = requireKey("sensenova");
  const res = await fetch(`${config.sensenova.baseUrl}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SenseNova ${path} HTTP ${res.status}: ${text.slice(0, 500)}`);
  const json = JSON.parse(text);
  const first = json.data?.[0] ?? {};
  return {
    url: first.url,
    b64: first.b64_json || undefined,
    size: json.size,
    outputFormat: json.output_format,
    usage: json.usage,
  };
}

function baseBody(o, size) {
  return {
    model: o.model ?? config.sensenova.imageModel,
    n: 1,
    size,
    output_format: o.outputFormat ?? "png",
    response_format: "url",
    watermark: o.watermark ?? true,
    prompt_extend: o.promptExtend ?? true,
    self_correction: o.selfCorrection ?? true,
  };
}

export async function generateImage(o) {
  const size = resolveSize({ size: o.size, resolution: o.resolution, aspectRatio: o.aspectRatio });
  const result = await call("/images/generations", { ...baseBody(o, size), prompt: o.prompt });
  return { ...result, requestSize: size };
}

/** Editing accepts 1-5 images, each as `{ image_url }` — a bare string array is rejected. */
export async function editImage(o) {
  if (!o.images?.length) throw new Error("editing needs at least one input image");
  const exact = o.size && /^\d{2,5}x\d{2,5}$/.test(o.size);
  const mode = o.size === "auto" ? "auto" : exact ? o.size : undefined;
  const size = mode ?? resolveSize({ resolution: o.resolution, aspectRatio: o.aspectRatio });
  const result = await call("/images/edits", {
    ...baseBody(o, size),
    prompt: o.prompt,
    images: o.images.slice(0, 5).map((url) => ({ image_url: url })),
  });
  return { ...result, requestSize: size };
}
