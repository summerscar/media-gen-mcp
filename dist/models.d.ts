export type Provider = "sensenova" | "agnes";
export type ModelKind = "image" | "video";
/** Cached /models ids. Fetches when missing or past the TTL (deduped). */
export declare function models(provider: Provider, force?: boolean): Promise<string[]>;
/** Cached ids usable for a kind; undefined when the catalog has never loaded. */
export declare function knownModels(provider: Provider, kind: ModelKind): string[] | undefined;
export declare function defaultModel(provider: Provider, kind: ModelKind): string;
/** Keep the catalog fresh between calls. unref'd so stdio can still exit. */
export declare function startModelWatch(): void;
/** True when a provider error message suggests the model id is gone or renamed. */
export declare function looksLikeModelError(message: string): boolean;
/** Fail fast when a requested model id is not in the live catalog. */
export declare function validateModel(provider: Provider, requested: string, kind: ModelKind): Promise<void>;
/** Run a provider call; on a model error, refresh the catalog and retry once. */
export declare function withModelRetry<T>(provider: Provider, kind: ModelKind, fn: () => Promise<T>): Promise<T>;
