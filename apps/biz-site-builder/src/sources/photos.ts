import type { Business } from "../types.ts";
import { extractImages, USER_AGENTS } from "./web.ts";
import { fetchPlacePhotoData, type PlacesOptions } from "./places.ts";

/**
 * **Photo enrichment** — fill `business.images` with the business's OWN real
 * photos, from honest sources only, in order of preference:
 *
 *   1. Photos already on the record (operator-supplied / already scraped).
 *   2. Their existing website, if any — harvest the real `<img>` / og:image
 *      shots (no API key needed).
 *   3. Their Google Business Profile via the Places API (the only real source
 *      for a business that has no website at all).
 *
 * It never invents or substitutes a stock/AI image: if none of these yield a
 * photo, the business stays photoless and the site uses its (now stronger)
 * photoless layout. Inert without a key and without network — all fetches are
 * injected, so this is fully unit-tested and a no-op in a sandbox.
 */

export interface PhotoEnrichOptions {
  fetchImpl?: typeof fetch;
  /** Google Places API key — enables the no-website photo source. */
  placesApiKey?: string;
  /** Max photos to keep. */
  maxPhotos?: number;
  /** BCP-47 language for Places (e.g. "he"). */
  languageCode?: string;
  timeoutMs?: number;
}

/** Harvest real images from a business's existing website (no key needed). */
async function harvestFromWebsite(url: string, opts: PhotoEnrichOptions): Promise<string[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12000);
  try {
    const res = await doFetch(url, {
      headers: { "User-Agent": USER_AGENTS.googlebot!, Accept: "text/html" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const html = await res.text();
    return extractImages(html, res.url || url, opts.maxPhotos ?? 8);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Return real photo URLs/`data:` URIs for a business, or `[]`. Does NOT mutate
 * the business — the caller decides whether to assign. Pure sources first, then
 * Places.
 */
export async function findRealPhotos(
  business: Business,
  opts: PhotoEnrichOptions = {},
): Promise<string[]> {
  if (business.images.length) return business.images;

  const max = opts.maxPhotos ?? 6;

  // 2) Their own existing site.
  if (business.website) {
    const fromSite = await harvestFromWebsite(business.website, opts);
    if (fromSite.length) return fromSite.slice(0, max);
  }

  // 3) Google Business Profile photos (the no-website case).
  if (opts.placesApiKey) {
    const placesOpts: PlacesOptions = { apiKey: opts.placesApiKey, maxPhotos: max };
    if (opts.fetchImpl) placesOpts.fetchImpl = opts.fetchImpl;
    if (opts.languageCode) placesOpts.languageCode = opts.languageCode;
    const fromPlaces = await fetchPlacePhotoData(business, placesOpts);
    if (fromPlaces.length) return fromPlaces.slice(0, max);
  }

  return [];
}

/**
 * Enrich a business in place with its real photos when it has none. Returns the
 * number of photos added (0 if it already had photos or none were found).
 */
export async function enrichPhotos(
  business: Business,
  opts: PhotoEnrichOptions = {},
): Promise<number> {
  if (business.images.length) return 0;
  const photos = await findRealPhotos(business, opts);
  if (photos.length) {
    business.images = photos;
    return photos.length;
  }
  return 0;
}
