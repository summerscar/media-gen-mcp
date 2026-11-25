# media-gen-mcp

MCP server that exposes **SenseNova** and **Agnes AI** image/video generation as
separate tool namespaces. Standalone: it talks to the provider HTTP APIs
directly, keeps nothing in a database, and needs only an API key per provider.

- MCP TypeScript SDK **v2** (`@modelcontextprotocol/server` 2.4.0) — implements
  the `2026-07-28` specification and still serves `2025-11-25` / `2025-06-18`
  clients from the same factory.
- Two transports from one binary: **Streamable HTTP** (`POST /mcp`, stateless
  per request) and **stdio** (`--stdio`, for `npx` and local hosts).

## Install

The npm package is not published yet; run it straight from this repository:

```bash
npx -y github:summerscar/media-gen-mcp --stdio
```

(or `npm install -g github:summerscar/media-gen-mcp`, then `media-gen-mcp --stdio`)

## Configure

| Variable | Default | Meaning |
|---|---|---|
| `SENSENOVA_API_KEY` | — | Enables the `sensenova_*` tools |
| `SENSENOVA_BASE_URL` | `https://token.sensenova.cn/v1` | Use `token.sensenova.ai` for the international site |
| `SENSENOVA_IMAGE_MODEL` | `sensenova-u1.6-lite` | Image model id |
| `AGNES_API_KEY` | — | Enables the `agnes_*` tools |
| `AGNES_BASE_URL` | `https://apihub.agnes-ai.com/v1` | Agnes API root |
| `MEDIA_DIR` | `./media` | Where generated files are written |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | HTTP listener |
| `MCP_PATH` | `/mcp` | HTTP path |
| `MCP_AUTH_TOKEN` | — | When set, requests need `Authorization: Bearer <token>` |
| `MCP_TRANSPORT` | — | `stdio` to force the stdio transport |
| `MODEL_LIST_TTL_MS` | `3600000` | Refresh interval for each provider's `/models` catalog (minimum 60000) |

Missing keys are not fatal: the server starts, and only the tools of the
provider without a key return an error.

## Run

```bash
# Streamable HTTP on :3000/mcp
SENSENOVA_API_KEY=... AGNES_API_KEY=... MEDIA_DIR=/data/media node dist/index.js

# stdio (Claude Desktop, Inspector, MCPHub npx, ...)
SENSENOVA_API_KEY=... AGNES_API_KEY=... node dist/index.js --stdio
```

Client configuration for the HTTP endpoint:

```json
{
  "mcpServers": {
    "media": {
      "type": "streamable-http",
      "url": "http://192.168.100.134:8086/mcp",
      "headers": { "Authorization": "Bearer <MCP_AUTH_TOKEN>" }
    }
  }
}
```

## Tools

| Tool | Provider | Purpose |
|---|---|---|
| `sensenova_image_generate` | SenseNova | text → image |
| `sensenova_image_edit` | SenseNova | 1–5 images + prompt → image |
| `agnes_image_generate` | Agnes | text → image (2.0 / 2.1 / 2.5 Flash) |
| `agnes_image_edit` | Agnes | images + prompt → image |
| `agnes_video_create` | Agnes | start an async video job, returns `video_id` |
| `agnes_video_status` | Agnes | poll the job and download the finished file |

### Image parameters

SenseNova (`sensenova_image_generate` / `_edit`): `prompt`, `size` (exact
`WxH`, 512–4096, multiples of 32, ratio ≤ 3:1, or `auto` when editing),
`resolution` (`2K`/`4K`), `aspect_ratio` (`1:1`, `16:9`, `9:16`, `2:3`, `3:2`),
`output_format`, `watermark`, `prompt_extend`, `self_correction`.

Agnes (`agnes_image_generate` / `_edit`): `prompt`, `model` (any image model id,
default `agnes-image-2.5-flash`), `size` (tier `1K`/`2K`/`3K`/`4K`, or exact
pixels on 2.0-flash), `ratio`, `return_base64`. Edits add `images` (https URL or
data URI).

No tool accepts a fixed model list: every `model` parameter is a free string,
validated against the provider's live `/models` catalog (see Model catalogs).

### Video parameters

`agnes_video_create`: `prompt`, `model` (any video model id, default
`agnes-video-2.5`), `mode` (`text` | `keyframe` | `reference`),
`seconds` (`"4"`–`"12"`, default `"5"`), `size` (`720P`/`1080P`/`1K`/`2K`;
Flash accepts `720P` only), `aspect_ratio`, `seed`, plus `first_frame` /
`last_frame` for keyframe mode and `images` / `audios` / `videos` for reference
mode (2.5: ≤ 8 images, ≤ 3 audios, ≤ 1 video, ≤ 12 files total; Flash: ≤ 5
images, ≤ 3 audios, no video).

Video jobs are asynchronous, so the tool returns at once and you poll
`agnes_video_status` every 1–2 seconds; once the job completes, the status tool
downloads the MP4 and reports its local path and byte size.

## Model catalogs

Model ids are not hardcoded. Each provider's `/models` endpoint is fetched and
kept in an in-memory cache:

- refreshed lazily on first use, and on a timer every `MODEL_LIST_TTL_MS`
  (default 1 h);
- force-refreshed immediately when a call fails with a model error (unknown /
  deprecated / renamed id), then retried once — a deprecated model is picked up
  on the same request, and if it is still gone the error lists the current
  catalog;
- a requested model id is fail-fast validated against the catalog; the
  configured defaults are always accepted even when the provider does not list
  them (SenseNova's `u1.6-lite` works this way);
- if a provider's `/models` endpoint is unreachable, the stale list is served
  and validation is skipped rather than blocking generation.

The cache is per-process; restarting the container starts from an empty
catalog.

## Output handling

Every generated image is downloaded before the tool returns, because provider
CDN links expire (SenseNova: 24 h). Files land in
`$MEDIA_DIR/<provider>/<YYYY-MM-DD>/<timestamp>-<rand>.<ext>`, but that path is
local to the server: a remote caller cannot read it. The tool result contains:

- an `image` block with the full image as base64 (always inlined, no size cap),
- a text block with the JSON metadata: `provider_url` (the provider CDN link,
  while it lasts), `mime`, `bytes`, real `width`/`height` read from the file
  header, provider, model, mode, elapsed time, token `usage` when the provider
  reports it, and the server-local `path` for stdio callers sharing the volume.

## Notes and known provider quirks

- SenseNova `/images/edits` requires `images: [{ "image_url": ... }]`; a bare
  string array is rejected with `invalid arguments`.
- Agnes accepts input images both at the top level and inside `extra_body`;
  this server sends both, and keeps `response_format` inside `extra_body`.
- `sensenova-u1.6-lite` is callable even though `/v1/models` does not list it
  (the listing shows `sensenova-u1.5-lite`).
- `n` is fixed at 1 on both providers; generate one image per call.
- SenseNova's `/models` lists `sensenova-u1.5-lite` but not the working default
  `sensenova-u1.6-lite` — validation accepts the default even when it is absent.

## Development

```bash
npm install
npm run typecheck
npm run build
node test/smoke.mjs http://127.0.0.1:3000/mcp sensenova_image_generate '{"prompt":"a red apple"}'
```

`test/smoke.mjs` connects with `@modelcontextprotocol/client`, lists tools and
optionally runs one call.

## License

MIT
