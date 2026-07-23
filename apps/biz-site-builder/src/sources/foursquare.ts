import type { Business } from "../types.ts";

/**
 * **Foursquare Places photo connector** — an alternative to Google Places for a
 * business's real photos, with rich POI metadata and a friendlier price.
 *
 * Unlike Google's Place Photos (whose media URL carries the API key, forcing a
 * download-and-inline to stay key-safe), Foursquare returns **public CDN URLs**
 * assembled as `${prefix}${size}${suffix}` — the key lives only in the request
 * `Authorization` header, never in the photo URL. So this connector can hand
 * back the URLs directly: no key leak, no byte download.
 *
 * Like every photo source here it returns only the business's OWN photos, or
 * nothing — never a stock/AI substitute. Network is injected; the pure parts
 * (request shaping, id/photo parsing, URL assembly) are fixture-tested.
 */

const SEARCH_ENDPOINT = "https://api.foursquare.com/v3/places/search";
const PLACES_ENDPOINT = "https://api.foursquare.com/v3/places";

export interface FoursquareOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  /** Max photos to keep (default 6). */
  maxPhotos?: number;
  /** Photo size token: "original" or e.g. "800x600" (default "original"). */
  size?: string;
}

/** Build the place-search URL (pure — key travels in a header, not the URL). */
export function fsqSearchUrl(business: Business): string {
  const params = new URLSearchParams({ query: business.name, limit: "1" });
  if (business.address) params.set("near", business.address);
  return `${SEARCH_ENDPOINT}?${params.toString()}`;
}

/** The fsq place id of the first search result, if any (pure). */
export function parseFsqId(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  const results = (json as { results?: unknown }).results;
  if (!Array.isArray(results) || results.length === 0) return undefined;
  const first = results[0];
  if (first && typeof first === "object") {
    const id = (first as { fsq_id?: unknown }).fsq_id;
    if (typeof id === "string" && id) return id;
  }
  return undefined;
}

/** The photos endpoint URL for a place (pure). */
export function fsqPhotosUrl(fsqId: string, opts: { maxPhotos?: number } = {}): string {
  const limit = opts.maxPhotos ?? 6;
  return `${PLACES_ENDPOINT}/${encodeURIComponent(fsqId)}/photos?limit=${limit}&sort=POPULAR`;
}

/** Assemble public photo URLs from a Foursquare photos response (pure). */
export function parseFsqPhotos(json: unknown, opts: { size?: string } = {}): string[] {
  if (!Array.isArray(json)) return [];
  const size = opts.size ?? "original";
  const out: string[] = [];
  for (const p of json) {
    if (p && typeof p === "object") {
      const prefix = (p as { prefix?: unknown }).prefix;
      const suffix = (p as { suffix?: unknown }).suffix;
      if (typeof prefix === "string" && typeof suffix === "string") {
        const url = `${prefix}${size}${suffix}`;
        if (/^https?:\/\//i.test(url) && !out.includes(url)) out.push(url);
      }
    }
  }
  return out;
}

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: apiKey, Accept: "application/json" };
}

/**
 * Resolve a business to its Foursquare photos (public CDN URLs). Returns `[]` on
 * any miss — never a fabricated image. Network is injected for tests.
 */
export async function fetchFoursquarePhotos(
  business: Business,
  opts: FoursquareOptions,
): Promise<string[]> {
  if (!opts.apiKey) return [];
  const doFetch = opts.fetchImpl ?? fetch;
  const headers = authHeaders(opts.apiKey);

  let fsqId: string | undefined;
  try {
    const res = await doFetch(fsqSearchUrl(business), { headers });
    if (!res.ok) return [];
    fsqId = parseFsqId(await res.json());
  } catch {
    return [];
  }
  if (!fsqId) return [];

  try {
    const res = await doFetch(fsqPhotosUrl(fsqId, { maxPhotos: opts.maxPhotos }), { headers });
    if (!res.ok) return [];
    const size = opts.size;
    return parseFsqPhotos(await res.json(), size ? { size } : {}).slice(0, opts.maxPhotos ?? 6);
  } catch {
    return [];
  }
}
