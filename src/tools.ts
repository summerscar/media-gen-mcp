/**
 * Tool surface: one namespace per provider, so a client can hide either
 * provider wholesale and the model only sees models and knobs that exist.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { config } from "./config.js";
import { AGNES_IMAGE_MODELS, AGNES_RATIOS, AGNES_VIDEO_MODELS, VIDEO_SIZES, type AgnesVideoRef } from "./agnes.js";
import * as agnes from "./agnes.js";
import * as sensenova from "./sensenova.js";
import { errorResult, saveFromUrl, toolResult } from "./media.js";

const ratioSchema = z.enum(AGNES_RATIOS).describe("Aspect ratio; the provider picks the pixel size from the tier");

const commonImageNotes =
  "The result is returned as an image block (base64) plus JSON metadata: provider CDN url, real pixel size, bytes and elapsed time. A copy is also written to the server's MEDIA_DIR, but that path is local to the server.";

async function finishImage(
  provider: "sensenova" | "agnes",
  result: { url?: string; b64?: string },
  meta: Record<string, unknown>,
  startedAt: number,
) {
  const source = result.url ?? (result.b64 ? `data:image/png;base64,${result.b64}` : undefined);
  if (!source) throw new Error("provider returned neither a url nor base64 data");
  const file = await saveFromUrl(source, provider);
  return toolResult(file, {
    provider,
    ...meta,
    ...(result.url ? { provider_url: result.url, provider_url_expires: "provider CDN links expire; re-generate for a fresh one" } : {}),
    elapsed_ms: Date.now() - startedAt,
  });
}

export function registerTools(server: McpServer): void {
  /* ---------------------------------------------------------------- SenseNova */

  server.registerTool(
    "sensenova_image_generate",
    {
      title: "SenseNova · generate image",
      description: `Text-to-image with SenseNova ${config.sensenova.imageModel}. ${commonImageNotes}`,
      inputSchema: z.object({
        prompt: z.string().min(1).describe("What to draw"),
        size: z
          .string()
          .optional()
          .describe("Exact pixels, e.g. 2048x2048. Width and height 512-4096, multiples of 32, ratio at most 3:1. Overrides resolution/aspect_ratio"),
        resolution: z.enum(["2K", "4K"]).optional().describe("Size tier used when size is omitted (default 2K)"),
        aspect_ratio: z.enum(sensenova.SENSENOVA_RATIOS).optional().describe("Aspect ratio used when size is omitted (default 1:1)"),
        output_format: z.enum(["png", "jpeg", "webp"]).optional(),
        watermark: z.boolean().optional().describe("Default true; false is free during the beta"),
        prompt_extend: z.boolean().optional().describe("Let the provider rewrite the prompt (default true)"),
        self_correction: z.boolean().optional().describe("Let the provider retry a bad composition (default true)"),
      }),
    },
    async (args) => {
      const t0 = Date.now();
      try {
        const result = await sensenova.generateImage({
          prompt: args.prompt,
          size: args.size,
          resolution: args.resolution,
          aspectRatio: args.aspect_ratio,
          outputFormat: args.output_format,
          watermark: args.watermark,
          promptExtend: args.prompt_extend,
          selfCorrection: args.self_correction,
        });
        return await finishImage("sensenova", result, {
          model: config.sensenova.imageModel,
          mode: "text-to-image",
          request_size: result.requestSize,
          usage: result.usage,
        }, t0);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "sensenova_image_edit",
    {
      title: "SenseNova · edit image",
      description: `Edit 1-5 input images with SenseNova ${config.sensenova.imageModel}. ${commonImageNotes}`,
      inputSchema: z.object({
        prompt: z.string().min(1).describe("The edit to apply"),
        images: z
          .array(z.string())
          .min(1)
          .max(5)
          .describe("Input images: public https URL or data URI (base64)"),
        size: z
          .string()
          .optional()
          .describe("Exact output pixels, e.g. 1664x2496, or the literal auto to follow the input image"),
        resolution: z.enum(["2K", "4K"]).optional(),
        aspect_ratio: z.enum(sensenova.SENSENOVA_RATIOS).optional(),
        output_format: z.enum(["png", "jpeg", "webp"]).optional(),
        watermark: z.boolean().optional(),
        prompt_extend: z.boolean().optional(),
        self_correction: z.boolean().optional(),
      }),
    },
    async (args) => {
      const t0 = Date.now();
      try {
        const result = await sensenova.editImage({
          prompt: args.prompt,
          images: args.images,
          size: args.size,
          resolution: args.resolution,
          aspectRatio: args.aspect_ratio,
          outputFormat: args.output_format,
          watermark: args.watermark,
          promptExtend: args.prompt_extend,
          selfCorrection: args.self_correction,
        });
        return await finishImage("sensenova", result, {
          model: config.sensenova.imageModel,
          mode: "image-edit",
          input_images: args.images.length,
          request_size: result.requestSize,
          usage: result.usage,
        }, t0);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  /* -------------------------------------------------------------------- Agnes */

  server.registerTool(
    "agnes_image_generate",
    {
      title: "Agnes · generate image",
      description:
        `Text-to-image with Agnes (${AGNES_IMAGE_MODELS.join(", ")}). ` +
        "2.1/2.5 take a tier plus ratio; 2.0-flash takes exact pixels. " +
        commonImageNotes,
      inputSchema: z.object({
        prompt: z.string().min(1),
        model: z.enum(AGNES_IMAGE_MODELS).optional().describe("Default agnes-image-2.5-flash"),
        size: z
          .string()
          .optional()
          .describe("Tier 1K/2K/3K/4K on 2.1 and 2.5 (default 2K); exact pixels such as 1024x768 on 2.0-flash"),
        ratio: ratioSchema.optional().describe("Ignored by agnes-image-2.0-flash"),
        return_base64: z.boolean().optional().describe("Ask the provider for inline base64 instead of a URL"),
      }),
    },
    async (args) => {
      const t0 = Date.now();
      try {
        const result = await agnes.generateImage({
          prompt: args.prompt,
          model: args.model,
          size: args.size,
          ratio: args.ratio,
          returnBase64: args.return_base64,
        });
        return await finishImage("agnes", result, {
          model: args.model ?? AGNES_IMAGE_MODELS[0],
          mode: "text-to-image",
          request_size: result.requestSize,
          ...(result.taskId ? { task_id: result.taskId } : {}),
        }, t0);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "agnes_image_edit",
    {
      title: "Agnes · edit image",
      description:
        "Image-to-image with Agnes: same endpoint as generation plus input images. " +
        "Editing a 2.0-flash image still needs exact output pixels. " +
        commonImageNotes,
      inputSchema: z.object({
        prompt: z.string().min(1),
        images: z.array(z.string()).min(1).max(9).describe("Input images: https URL or data URI"),
        model: z.enum(AGNES_IMAGE_MODELS).optional().describe("Default agnes-image-2.5-flash"),
        size: z.string().optional().describe("Tier 1K/2K/3K/4K on 2.1 and 2.5; exact pixels on 2.0-flash"),
        ratio: ratioSchema.optional(),
        return_base64: z.boolean().optional(),
      }),
    },
    async (args) => {
      const t0 = Date.now();
      try {
        const result = await agnes.generateImage({
          prompt: args.prompt,
          images: args.images,
          model: args.model,
          size: args.size,
          ratio: args.ratio,
          returnBase64: args.return_base64,
        });
        return await finishImage("agnes", result, {
          model: args.model ?? AGNES_IMAGE_MODELS[0],
          mode: "image-edit",
          input_images: args.images.length,
          request_size: result.requestSize,
          ...(result.taskId ? { task_id: result.taskId } : {}),
        }, t0);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "agnes_video_create",
    {
      title: "Agnes · create video task",
      description:
        "Start an asynchronous Agnes video job and return its video_id immediately. " +
        "Poll agnes_video_status every 1-2 seconds until status is completed, then download the url. " +
        "Text mode takes no media; keyframe mode uses first/last frame; reference mode uses images/audios/videos " +
        "(2.5: up to 8 images, 3 audios, 1 video, 12 files total; 2.5-flash: 720P only, up to 5 images, 3 audios, no video).",
      inputSchema: z.object({
        prompt: z.string().min(1).describe("Use <Picture N>, <Audio N>, <Video N> to reference media, numbered from 1"),
        model: z.enum(AGNES_VIDEO_MODELS).optional().describe("Default agnes-video-2.5"),
        mode: z.enum(["text", "keyframe", "reference"]),
        seconds: z.enum(["4", "5", "6", "7", "8", "9", "10", "11", "12"]).optional().describe("String duration, default 5"),
        size: z.enum(VIDEO_SIZES).optional().describe("Default 720P; 2.5-flash only accepts 720P"),
        aspect_ratio: ratioSchema.optional().describe("Default 16:9"),
        seed: z.number().int().optional(),
        first_frame: z.string().optional().describe("keyframe mode: opening frame URL"),
        last_frame: z.string().optional().describe("keyframe mode: closing frame URL"),
        images: z.array(z.string()).max(8).optional().describe("reference mode: image URLs"),
        audios: z.array(z.string()).max(3).optional().describe("reference mode: audio URLs, 2-12 s each"),
        videos: z
          .array(
            z.object({
              url: z.string(),
              start_seconds: z.number().optional(),
              require_audio: z.boolean().optional(),
            }),
          )
          .max(1)
          .optional()
          .describe("reference mode: one 2-12 s clip; unsupported on 2.5-flash"),
      }),
    },
    async (args) => {
      try {
        const task = await agnes.createVideo({
          prompt: args.prompt,
          model: args.model,
          mode: args.mode,
          seconds: args.seconds,
          size: args.size,
          aspectRatio: args.aspect_ratio,
          seed: args.seed,
          firstFrame: args.first_frame,
          lastFrame: args.last_frame,
          images: args.images,
          audios: args.audios,
          videos: args.videos as AgnesVideoRef[] | undefined,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ...task,
                  next: "call agnes_video_status with this video_id and model; poll every 1-2 s",
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "agnes_video_status",
    {
      title: "Agnes · video status",
      description:
        "Check an Agnes video job. Returns status/progress, and once completed it downloads the file and returns " +
        "it with its local path, byte size and pixel size.",
      inputSchema: z.object({
        video_id: z.string().min(1).describe("video_id from agnes_video_create"),
        model: z.enum(AGNES_VIDEO_MODELS).optional().describe("Must match the model used to create the job"),
        download: z.boolean().optional().describe("Download the finished video (default true)"),
      }),
    },
    async (args) => {
      try {
        const status = await agnes.getVideo(args.video_id, args.model);
        if (!status.url || args.download === false) {
          return { content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }] };
        }
        const file = await saveFromUrl(status.url, "agnes");
        const { previewBase64: _ignored, ...rest } = file;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ...status, file: rest }, null, 2),
            },
          ],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
