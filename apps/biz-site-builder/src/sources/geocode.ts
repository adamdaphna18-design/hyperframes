import type { GeoPoint } from "../types.ts";

/**
 * Free geocoding via OpenStreetMap **Nominatim** (osm-search/Nominatim) — turns a
 * street address into coordinates so a business without lat/lon still gets a map.
 * No API key. Nominatim's usage policy requires a descriptive User-Agent and at
 * most ~1 request/second, so callers should geocode sparingly and cache.
 */

const DEFAULT_ENDPOINT = "https://nominatim.openstreetmap.org/search";

export interface GeocodeOptions {
  endpoint?: string;
  /** Contact string for the required User-Agent (per Nominatim policy). */
  email?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface NominatimResult {
  lat: string;
  lon: string;
}

/** Geocode a free-text address to a point, or null if not found / on error. */
export async function geocodeAddress(
  address: string,
  opts: GeocodeOptions = {},
): Promise<GeoPoint | null> {
  const query = address.trim();
  if (!query) return null;
  const doFetch = opts.fetchImpl ?? fetch;
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const url = `${endpoint}?${new URLSearchParams({ q: query, format: "jsonv2", limit: "1" }).toString()}`;
  const ua = `biz-site-builder/0.1 (${opts.email ?? "https://github.com/heygen-com/hyperframes"})`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10000);
  try {
    const res = await doFetch(url, {
      headers: { "User-Agent": ua, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const results = (await res.json()) as NominatimResult[];
    const first = results[0];
    if (!first) return null;
    const lat = Number(first.lat);
    const lon = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
