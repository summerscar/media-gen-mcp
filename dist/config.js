/**
 * Runtime configuration. Everything comes from environment variables so the
 * package stays standalone: no gateway, no database, no vendor SDK.
 */
function env(name) {
    const value = process.env[name];
    return value && value.trim() ? value.trim() : undefined;
}
function trimSlash(url) {
    return url.replace(/\/+$/, "");
}
export const config = {
    sensenova: {
        apiKey: env("SENSENOVA_API_KEY") ?? "",
        baseUrl: trimSlash(env("SENSENOVA_BASE_URL") ?? "https://token.sensenova.cn/v1"),
        imageModel: env("SENSENOVA_IMAGE_MODEL") ?? "sensenova-u1.6-lite",
    },
    agnes: {
        apiKey: env("AGNES_API_KEY") ?? "",
        baseUrl: trimSlash(env("AGNES_BASE_URL") ?? "https://apihub.agnes-ai.com/v1"),
    },
    mediaDir: env("MEDIA_DIR") ?? "./media",
    /** Inline previews larger than this stay on disk only. */
    previewMaxBytes: Number(env("MEDIA_PREVIEW_MAX_BYTES") ?? 4 * 1024 * 1024),
    http: {
        port: Number(env("PORT") ?? 3000),
        host: env("HOST") ?? "0.0.0.0",
        path: env("MCP_PATH") ?? "/mcp",
        /** When set, every MCP request must send `Authorization: Bearer <token>`. */
        token: env("MCP_AUTH_TOKEN") ?? "",
    },
    version: "0.1.0",
};
export function requireKey(provider) {
    const key = config[provider].apiKey;
    if (!key) {
        throw new Error(`${provider === "sensenova" ? "SENSENOVA_API_KEY" : "AGNES_API_KEY"} is not set on the server`);
    }
    return key;
}
