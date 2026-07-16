import type { Business, GeoPoint } from "../types.ts";

/**
 * **Mapillary street-level photos — free (token, no payment).**
 *
 * For a business with no website and no OSM/Wikimedia photo tag, Mapillary's
 * crowdsourced street imagery can still show its storefront. Honesty caveats,
 * stated plainly:
 *
 *   - This is a *street-level* view at the business's coordinates, NOT a curated
 *     interior/brand photo. It shows the shopfront as seen from the road.
 *   - It is location-based, so a slightly-off coordinate can catch a neighbour.
 *     We therefore query a TIGHT bbox and require real coordinates, and this
 *     source is opt-in only (never auto-preferred over POI-linked sources).
 *
 * Key-safe: the access token travels in the request URL (server-side); the photo
 * `thumb_*_url` returned is a separate signed CDN URL with no token, so it's safe
 * to embed. Network injected for tests; geometry/URL/parse parts are pure.
 */

const IMAGES_ENDPOINT = "https://graph.mapillary.com/images";

export interface MapillaryOptions {
  accessToken: string;
  fetchImpl?: typeof fetch;
  maxPhotos?: number;
  /** Half-size of the search box around the point, in metres (default 30). */
  radiusMeters?: number;
}

/** A tight bounding box (minLon,minLat,maxLon,maxLat) around a point (pure). */
export function bboxAround(point: GeoPoint, meters = 30): string {
  const dLat = meters / 111_320;
  const dLon = meters / (111_320 * Math.max(0.01, Math.cos((point.lat * Math.PI) / 180)));
  const minLon = point.lon - dLon;
  const minLat = point.lat - dLat;
  const maxLon = point.lon + dLon;
  const maxLat = point.lat + dLat;
  return [minLon, minLat, maxLon, maxLat].map((n) => n.toFixed(6)).join(",");
}

/** Build the Mapillary images request URL (pure). Token is a server-side param. */
export function mapillaryImagesUrl(
  bbox: string,
  opts: { accessToken: string; limit?: number },
): string {
  const params = new URLSearchParams({
    access_token: opts.accessToken,
    fields: "id,thumb_1024_url,computed_geometry",
    bbox,
    limit: String(opts.limit ?? 6),
  });
  return `${IMAGES_ENDPOINT}?${params.toString()}`;
}

/** Extract token-free public thumbnail URLs from an images response (pure). */
export function parseMapillaryThumbs(json: unknown): string[] {
  if (!json || typeof json !== "object") return [];
  const data = (json as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const out: string[] = [];
  for (const item of data) {
    if (item && typeof item === "object") {
      const url = (item as { thumb_1024_url?: unknown }).thumb_1024_url;
      if (typeof url === "string" && /^https?:\/\//i.test(url) && !out.includes(url)) {
        out.push(url);
      }
    }
  }
  return out;
}

/**
 * Street-level photos at a business's coordinates, or `[]`. Needs a location and
 * a (free) token; never fabricates. Network injected for tests.
 */
export async function fetchMapillaryPhotos(
  business: Business,
  opts: MapillaryOptions,
): Promise<string[]> {
  if (!opts.accessToken || !business.location) return [];
  const doFetch = opts.fetchImpl ?? fetch;
  const max = opts.maxPhotos ?? 6;
  try {
    const bbox = bboxAround(business.location, opts.radiusMeters ?? 30);
    const res = await doFetch(
      mapillaryImagesUrl(bbox, { accessToken: opts.accessToken, limit: max }),
    );
    if (!res.ok) return [];
    return parseMapillaryThumbs(await res.json()).slice(0, max);
  } catch {
    return [];
  }
}
