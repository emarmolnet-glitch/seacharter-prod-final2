import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

type CacheEnvelope<T> = {
  storedAt: number;
  expiresAt: number;
  value: T;
};

export type ResponseCacheResult<T> = {
  value: T;
  cacheStatus: "HIT" | "MISS" | "STALE";
  ageMs: number;
};

type ResponseCacheOptions<T> = {
  namespace: string;
  key: unknown;
  ttlMs: number;
  staleTtlMs?: number;
  bypassRead?: boolean;
  producer: () => Promise<T>;
};

const memoryCache = new Map<string, CacheEnvelope<unknown>>();
const inFlightRequests = new Map<string, Promise<ResponseCacheResult<unknown>>>();

function cacheStore() {
  return getStore("core-pro-response-cache");
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildResponseCacheKey(namespace: string, key: unknown) {
  const digest = createHash("sha256").update(stableSerialize(key)).digest("hex");
  return `${namespace}/${digest}.json`;
}

async function readPersistentEnvelope<T>(key: string): Promise<CacheEnvelope<T> | null> {
  try {
    const value = await cacheStore().get(key, { type: "json" });
    if (!value || typeof value !== "object") return null;
    const envelope = value as CacheEnvelope<T>;
    if (!Number.isFinite(envelope.storedAt) || !Number.isFinite(envelope.expiresAt)) return null;
    return envelope;
  } catch (error) {
    console.warn("[response-cache] Persistent cache read unavailable.", error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function writePersistentEnvelope<T>(key: string, envelope: CacheEnvelope<T>) {
  try {
    await cacheStore().setJSON(key, envelope);
  } catch (error) {
    console.warn("[response-cache] Persistent cache write unavailable.", error instanceof Error ? error.message : String(error));
  }
}

export async function getOrSetCachedJson<T>(options: ResponseCacheOptions<T>): Promise<ResponseCacheResult<T>> {
  const ttlMs = Math.max(1_000, Number(options.ttlMs) || 1_000);
  const staleTtlMs = Math.max(ttlMs, Number(options.staleTtlMs) || ttlMs);
  const cacheKey = buildResponseCacheKey(options.namespace, options.key);
  const now = Date.now();
  let envelope = memoryCache.get(cacheKey) as CacheEnvelope<T> | undefined;

  if (!envelope) {
    envelope = await readPersistentEnvelope<T>(cacheKey) || undefined;
    if (envelope) memoryCache.set(cacheKey, envelope);
  }

  if (!options.bypassRead && envelope && envelope.expiresAt > now) {
    return { value: envelope.value, cacheStatus: "HIT", ageMs: Math.max(0, now - envelope.storedAt) };
  }

  const existingRequest = inFlightRequests.get(cacheKey) as Promise<ResponseCacheResult<T>> | undefined;
  if (existingRequest) return existingRequest;

  const request = (async () => {
    try {
      const value = await options.producer();
      const storedAt = Date.now();
      const nextEnvelope: CacheEnvelope<T> = { value, storedAt, expiresAt: storedAt + ttlMs };
      memoryCache.set(cacheKey, nextEnvelope);
      await writePersistentEnvelope(cacheKey, nextEnvelope);
      return { value, cacheStatus: "MISS" as const, ageMs: 0 };
    } catch (error) {
      if (envelope && now - envelope.storedAt <= staleTtlMs) {
        console.warn("[response-cache] Origin unavailable; serving stale response.", options.namespace);
        return {
          value: envelope.value,
          cacheStatus: "STALE" as const,
          ageMs: Math.max(0, now - envelope.storedAt),
        };
      }
      throw error;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, request as Promise<ResponseCacheResult<unknown>>);
  return request;
}

export function createResponseCacheHeaders(result: ResponseCacheResult<unknown>, browserMaxAgeSeconds: number, staleSeconds: number) {
  const maxAge = Math.max(0, Math.floor(browserMaxAgeSeconds));
  const staleWhileRevalidate = Math.max(maxAge, Math.floor(staleSeconds));
  return {
    "cache-control": `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
    "netlify-cdn-cache-control": `public, durable, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
    "x-core-cache": result.cacheStatus,
  };
}
