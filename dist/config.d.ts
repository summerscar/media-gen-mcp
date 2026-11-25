/**
 * Runtime configuration. Everything comes from environment variables so the
 * package stays standalone: no gateway, no database, no vendor SDK.
 */
export declare const config: {
    readonly sensenova: {
        readonly apiKey: string;
        readonly baseUrl: string;
        readonly imageModel: string;
    };
    readonly agnes: {
        readonly apiKey: string;
        readonly baseUrl: string;
    };
    readonly mediaDir: string;
    /** Inline previews larger than this stay on disk only. */
    readonly previewMaxBytes: number;
    readonly http: {
        readonly port: number;
        readonly host: string;
        readonly path: string;
        /** When set, every MCP request must send `Authorization: Bearer <token>`. */
        readonly token: string;
    };
    readonly version: "0.1.0";
};
export declare function requireKey(provider: "sensenova" | "agnes"): string;
