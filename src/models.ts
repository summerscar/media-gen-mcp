/**
 * Live model catalogs. Model ids are not hardcoded: they come from each
 * provider's /models endpoint, are cached with a TTL, refreshed on a timer,
 * and force-refreshed when a request fails with a model error so that a
 * deprecated or renamed model is picked up immediately.
 */
import { config, requireKey } from "./config.js";

export type Provider = "sensenova" | "agnes";
export type ModelKind = "image" | "video";

const TTL_MS = Math.max(60_000, Number(process.env.MODEL_LIST_TTL_MS ?? 3_600_000));

type Catalog = { ids: string[]; fetchedAt: number };
const caches = new Map<Provider, Catalog>();
const inFlight = new Map<Provider, Promise<string[]>>();

async function fetchProviderModels(provider: Provider): Promise<string[]> {
  const key = requireKey(provider);
  const base = provider === "sensenova" ? config.sensenova.baseUrl : config.agnes.baseUrl;
  const res = await fetch(`${base}/models`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${provider} /models HTTP ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text || "{}") as { data?: Array<Record<string, unknown>> };
  const entries = Array.isArray(json.data) ? json.data : [];
  const ids = new Set<string>();
  for (const entry of entries) {
    const id = typeof entry.id === "string" ? entry.id : undefined;
    if (!id) continue;
    // SenseNova lists chat models too; keep only image-output ones.
    if (provider === "sensenova") {
      const out = entry.output_modalities;
      if (Array.isArray(out) && !out.includes("image")) continue;
    }
    ids.add(id);
  }
  if (ids.size === 0) throw new Error(`${provider} /models returned no usable model ids`);
  return [...ids];
}

/** Cached /models ids. Fetches when missing or past the TTL (deduped). */
export function models(provider: Provider, force = false): Promise<string[]> {
  const cached = caches.get(provider);
  if (!force && cached && Date.now() - cached.fetchedAt < TTL_MS) return Promise.resolve(cached.ids);
  const pending = inFlight.get(provider);
  if (pending) return pending;
  const job = fetchProviderModels(provider)
    .then((ids) => {
      caches.set(provider, { ids, fetchedAt: Date.now() });
      return ids;
    })
    .catch((err) => {
      // Serve a stale list rather than failing; only throw when nothing is known.
      const stale = caches.get(provider);
      if (stale) {
        stale.fetchedAt = Date.now();
        return stale.ids;
      }
      throw err;
    })
    .finally(() => inFlight.delete(provider));
  inFlight.set(provider, job);
  return job;
}

/** Cached ids usable for a kind; undefined when the catalog has never loaded. */
export function knownModels(provider: Provider, kind: ModelKind): string[] | undefined {
  const ids = caches.get(provider)?.ids;
  if (!ids) return undefined;
  return kind === "image" || provider === "sensenova"
    ? ids
    : ids.filter((id) => id.includes("video"));
}

function matchesKind(provider: Provider, kind: ModelKind, id: string): boolean {
  if (provider === "sensenova" || kind === "image") return true; // sensenova catalog is pre-filtered
  return id.includes("video");
}

export function defaultModel(provider: Provider, kind: ModelKind): string {
  if (provider === "sensenova") return config.sensenova.imageModel;
  return kind === "video" ? "agnes-video-2.5" : "agnes-image-2.5-flash";
}

/** Keep the catalog fresh between calls. unref'd so stdio can still exit. */
export function startModelWatch(): void {
  const timer = setInterval(() => {
    for (const provider of ["sensenova", "agnes"] as const) {
      models(provider, true).catch(() => {});
    }
  }, TTL_MS);
  timer.unref?.();
}

/** True when a provider error message suggests the model id is gone or renamed. */
export function looksLikeModelError(message: string): boolean {
  return (
    /model/i.test(message) &&
    /(not found|no longer|unknown|invalid|deprecat|does not exist|not exist|unsupported)/i.test(message)
  );
}

/** Fail fast when a requested model id is not in the live catalog. */
export async function validateModel(provider: Provider, requested: string, kind: ModelKind): Promise<void> {
  if (requested === defaultModel(provider, kind)) return; // defaults are always accepted (u1.6-lite quirk)
  let ids = await models(provider).catch(() => undefined);
  if (ids?.some((id) => id === requested && matchesKind(provider, kind, id))) return;
  ids = await models(provider, true).catch(() => undefined) ?? ids;
  if (ids?.some((id) => id === requested && matchesKind(provider, kind, id))) return;
  const available = ids?.filter((id) => matchesKind(provider, kind, id));
  throw new Error(
    `unknown ${provider} model "${requested}" for ${kind} generation ` +
      `(available: ${available?.length ? available.join(", ") : "catalog unavailable"})`,
  );
}

/** Run a provider call; on a model error, refresh the catalog and retry once. */
export async function withModelRetry<T>(provider: Provider, kind: ModelKind, fn: () => Promise<T>): Promise<T> {
  const text = (err: unknown) => (err instanceof Error ? err.message : String(err));
  try {
    return await fn();
  } catch (err) {
    if (!looksLikeModelError(text(err))) throw err;
    await models(provider, true).catch(() => {});
    try {
      return await fn();
    } catch (err2) {
      if (looksLikeModelError(text(err2))) {
        const available = knownModels(provider, kind)?.filter((id) => matchesKind(provider, kind, id));
        throw new Error(
          `${text(err2)} — still listed ${kind} models: ${available?.length ? available.join(", ") : "catalog unavailable"}`,
        );
      }
      throw err2;
    }
  }
}
