import type { Business } from "../types.ts";
import { extractImages, USER_AGENTS } from "./web.ts";
import { googlePlacesProvider, type PhotoProvider } from "./photo-provider.ts";
import { osmFreePhotos } from "./osm-photos.ts";

/**
 * **Photo enrichment** — fill `business.images` with the business's OWN real
 * photos, from honest sources only, in order of preference:
 *
 *   1. Photos already on the record (operator-supplied / already scraped).
 *   2. Their existing website, if any — harvest the real `<img>` / og:image
 *      shots. FREE, no key.
 *   3. FREE, keyless OSM + Wikimedia Commons photo tags on the record
 *      (`image`, `wikimedia_commons`, `wikidata` → P18). No paid API.
 *   4. Optional: a paid place-API provider (Google Places / Foursquare), ONLY
 *      if the operator explicitly configured one. Never required.
 *
 * It never invents or substitutes a stock/AI image: if none of these yield a
 * photo, the business stays photoless and the site uses its (now stronger)
 * photoless layout. Inert without network — all fetches are injected, so this is
 * fully unit-tested and a no-op in a sandbox.
 */

export interface PhotoEnrichOptions {
  fetchImpl?: typeof fetch;
  /** A vendor-neutral photo provider (Google Places / Foursquare / …). */
  provider?: PhotoProvider;
  /** Convenience: a Google Places key (wrapped as a provider). Prefer `provider`. */
  placesApiKey?: string;
  /** Max photos to keep. */
  maxPhotos?: number;
  /** BCP-47 language for the provider (e.g. "he"). */
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

  // 3) FREE, keyless: OSM/Wikimedia photo tags on the record (no paid API).
  const freeOpts: Parameters<typeof osmFreePhotos>[1] = { maxPhotos: max };
  if (opts.fetchImpl) freeOpts.fetchImpl = opts.fetchImpl;
  const fromOsm = await osmFreePhotos(business, freeOpts);
  if (fromOsm.length) return fromOsm;

  // 4) Optional paid place-API provider (only if the operator configured one).
  const provider =
    opts.provider ?? (opts.placesApiKey ? googlePlacesProvider(opts.placesApiKey) : undefined);
  if (provider) {
    const query: Parameters<PhotoProvider["photosFor"]>[1] = { maxPhotos: max };
    if (opts.fetchImpl) query.fetchImpl = opts.fetchImpl;
    if (opts.languageCode) query.languageCode = opts.languageCode;
    const fromProvider = await provider.photosFor(business, query);
    if (fromProvider.length) return fromProvider.slice(0, max);
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
