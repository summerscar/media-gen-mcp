/**
 * Agnes AI adapter.
 * Images: agnes-image-2.0-flash | 2.1-flash | 2.5-flash — POST /images/generations.
 * Video:  agnes-video-2.5 | agnes-video-2.5-flash — POST /videos, then GET /agnesapi.
 * Docs: https://agnes-ai.com/zh-Hans/docs
 */
import { config, requireKey } from "./config.js";

export const AGNES_RATIOS = ["1:1", "3:4", "4:3", "16:9", "9:16", "2:3", "3:2", "21:9"] as const;
export type AgnesRatio = (typeof AGNES_RATIOS)[number];

export const VIDEO_SIZES = ["720P", "1080P", "1K", "2K"] as const;

/** Defaults only; accepted model ids come from the live /models catalog (see models.ts). */
export const AGNES_IMAGE_DEFAULT = "agnes-image-2.5-flash";
export const AGNES_VIDEO_DEFAULT = "agnes-video-2.5";

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${requireKey("agnes")}`, "Content-Type": "application/json" };
}

async function post(path: string, body: Record<string, unknown>, timeoutMs: number): Promise<Record<string, any>> {
  const res = await fetch(`${config.agnes.baseUrl}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Agnes ${path} HTTP ${res.status}: ${text.slice(0, 500)}`);
  return text ? (JSON.parse(text) as Record<string, any>) : {};
}

async function get(path: string): Promise<Record<string, any>> {
  const res = await fetch(`${config.agnes.baseUrl}${path}`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Agnes ${path} HTTP ${res.status}: ${text.slice(0, 500)}`);
  return text ? (JSON.parse(text) as Record<string, any>) : {};
}

export type AgnesImageOpts = {
  /** Any id from the provider's live /models list; defaults to AGNES_IMAGE_DEFAULT. */
  model?: string;
  prompt: string;
  /** Tier (1K/2K/3K/4K) on 2.1/2.5; exact pixels such as 1024x768 on 2.0. */
  size?: string;
  ratio?: AgnesRatio;
  /** Input images turn the call into an edit; accepted top-level and inside extra_body. */
  images?: string[];
  returnBase64?: boolean;
};

export type AgnesImageResult = { url?: string; b64?: string; taskId?: string; requestSize: string };

export async function generateImage(o: AgnesImageOpts): Promise<AgnesImageResult> {
  const model = o.model ?? AGNES_IMAGE_DEFAULT;
  const legacy = model === "agnes-image-2.0-flash";
  const size = legacy ? o.size ?? "1024x1024" : o.size ?? "2K";

  const extraBody: Record<string, unknown> = { response_format: o.returnBase64 ? "b64_json" : "url" };
  if (o.images?.length) extraBody.image = o.images;

  const body: Record<string, unknown> = {
    model,
    prompt: o.prompt,
    size,
    extra_body: extraBody,
  };
  if (!legacy) body.ratio = o.ratio ?? "1:1";
  if (o.images?.length) body.image = o.images;

  const json = await post("/images/generations", body, 300_000);
  const first = (json.data?.[0] ?? {}) as { url?: string; b64_json?: string };
  return {
    url: typeof first.url === "string" && first.url ? first.url : undefined,
    b64: first.b64_json || undefined,
    taskId: json.task_id,
    requestSize: size,
  };
}

export type AgnesAudioRef = { url: string };
export type AgnesVideoRef = { url: string; startSeconds?: number; requireAudio?: boolean };

export type AgnesVideoOpts = {
  model?: string;
  prompt: string;
  mode: "text" | "keyframe" | "reference";
  /** String, 4-12. Defaults to "5". */
  seconds?: string;
  size?: string;
  aspectRatio?: AgnesRatio;
  seed?: number;
  firstFrame?: string;
  lastFrame?: string;
  images?: string[];
  audios?: string[];
  videos?: AgnesVideoRef[];
};

export const VIDEO_LIMITS = {
  referenceImages: 8,
  flashReferenceImages: 5,
  audios: 3,
  videos: 1,
  totalFiles: 12,
};

function buildVideoBody(o: AgnesVideoOpts) {
  const model = o.model ?? AGNES_VIDEO_DEFAULT;
  const flash = model === "agnes-video-2.5-flash";

  if (flash && o.size && o.size.toUpperCase() !== "720P") {
    throw new Error("agnes-video-2.5-flash only supports size 720P");
  }
  if (o.mode === "text" && (o.images?.length || o.audios?.length || o.videos?.length || o.firstFrame || o.lastFrame)) {
    throw new Error("text mode accepts no media fields");
  }
  if (o.mode === "keyframe") {
    if (!o.firstFrame && !o.lastFrame) throw new Error("keyframe mode needs first_frame and/or last_frame");
    if (o.images?.length || o.audios?.length || o.videos?.length) {
      throw new Error("keyframe mode cannot be combined with images, audios or videos");
    }
  }
  if (o.mode === "reference") {
    if (o.firstFrame || o.lastFrame) throw new Error("reference mode cannot be combined with first_frame or last_frame");
    if (flash && o.videos?.length) throw new Error("agnes-video-2.5-flash does not support reference videos");
    if (!o.images?.length && !o.audios?.length && !o.videos?.length) {
      throw new Error("reference mode needs images, audios or videos");
    }
  }

  const body: Record<string, unknown> = {
    model,
    prompt: o.prompt,
    mode: o.mode,
    seconds: o.seconds ?? "5",
    size: flash ? "720P" : o.size ?? "720P",
    aspect_ratio: o.aspectRatio ?? "16:9",
    n: 1,
  };
  if (o.seed !== undefined) body.seed = o.seed;
  if (o.firstFrame) body.first_frame = o.firstFrame;
  if (o.lastFrame) body.last_frame = o.lastFrame;
  if (o.images?.length) body.images = o.images.slice(0, flash ? VIDEO_LIMITS.flashReferenceImages : VIDEO_LIMITS.referenceImages);
  if (o.audios?.length) body.audios = o.audios.slice(0, VIDEO_LIMITS.audios).map((url) => (typeof url === "string" ? { url } : url));
  if (o.videos?.length) {
    body.videos = o.videos.slice(0, VIDEO_LIMITS.videos).map((v) => ({
      url: v.url,
      ...(v.startSeconds !== undefined ? { start_seconds: v.startSeconds } : {}),
      ...(v.requireAudio !== undefined ? { require_audio: v.requireAudio } : {}),
    }));
  }
  return { model, body };
}

export type AgnesVideoTask = {
  videoId: string;
  model: string;
  status?: string;
  seconds?: string;
  size?: string;
};

export async function createVideo(o: AgnesVideoOpts): Promise<AgnesVideoTask> {
  const { model, body } = buildVideoBody(o);
  const json = await post("/videos", body, 120_000);
  const videoId = json.video_id ?? json.id ?? json.data?.video_id;
  if (!videoId) throw new Error(`Agnes /videos returned no video_id: ${JSON.stringify(json).slice(0, 300)}`);
  return { videoId: String(videoId), model, status: json.status, seconds: json.seconds, size: json.size };
}

export type AgnesVideoStatus = {
  videoId: string;
  model: string;
  status?: string;
  progress?: number;
  url?: string;
  seconds?: string;
  size?: string;
  error?: unknown;
};

export async function getVideo(videoId: string, model?: string): Promise<AgnesVideoStatus> {
  const m = model ?? AGNES_VIDEO_DEFAULT;
  const json = await get(`/agnesapi?video_id=${encodeURIComponent(videoId)}&model_name=${encodeURIComponent(m)}`);
  const data = (json.data ?? json) as Record<string, any>;
  const status = data.status ?? json.status;
  const done = status === "completed" || status === "succeeded" || status === "success";
  return {
    videoId,
    model: m,
    status,
    progress: data.progress ?? json.progress,
    url: done ? (data.url ?? json.url ?? data.video_url) : undefined,
    seconds: data.seconds ?? json.seconds,
    size: data.size ?? json.size,
    error: data.error ?? json.error ?? json.message,
  };
}
