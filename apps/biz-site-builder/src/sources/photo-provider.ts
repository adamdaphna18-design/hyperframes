import type { Business } from "../types.ts";
import { fetchPlacePhotoData } from "./places.ts";
import { fetchFoursquarePhotos } from "./foursquare.ts";
import { fetchMapillaryPhotos } from "./mapillary.ts";

/**
 * **Vendor-neutral photo providers.** The builder is not locked to any one place
 * API: a `PhotoProvider` resolves a business to its OWN real photos, and the
 * enrichment layer treats them interchangeably. Swap Google Places for
 * Foursquare (or a future Brave / self-hosted provider) with one flag.
 *
 * Note: most "Places API alternatives" (Mapbox, HERE, LocationIQ, Geoapify,
 * OSM/Nominatim, BizData) are geocoders — they return coordinates, not business
 * photos. The photo-bearing providers are Google Places and Foursquare, so those
 * are the two shipped here. Geocoding is handled separately (Nominatim).
 */

export interface PhotoQuery {
  fetchImpl?: typeof fetch;
  maxPhotos?: number;
  languageCode?: string;
}

export interface PhotoProvider {
  readonly name: string;
  /** Real photo URLs / data: URIs for the business, or [] on a miss. */
  photosFor(business: Business, opts: PhotoQuery): Promise<string[]>;
}

/** Google Places (New) — rich photos; media downloaded to key-safe data: URIs. */
export function googlePlacesProvider(apiKey: string): PhotoProvider {
  return {
    name: "google-places",
    photosFor(business, opts) {
      const o: Parameters<typeof fetchPlacePhotoData>[1] = { apiKey };
      if (opts.fetchImpl) o.fetchImpl = opts.fetchImpl;
      if (opts.maxPhotos !== undefined) o.maxPhotos = opts.maxPhotos;
      if (opts.languageCode) o.languageCode = opts.languageCode;
      return fetchPlacePhotoData(business, o);
    },
  };
}

/** Foursquare Places — cheaper, public CDN photo URLs (no key in the URL). */
export function foursquareProvider(apiKey: string): PhotoProvider {
  return {
    name: "foursquare",
    photosFor(business, opts) {
      const o: Parameters<typeof fetchFoursquarePhotos>[1] = { apiKey };
      if (opts.fetchImpl) o.fetchImpl = opts.fetchImpl;
      if (opts.maxPhotos !== undefined) o.maxPhotos = opts.maxPhotos;
      return fetchFoursquarePhotos(business, o);
    },
  };
}

/** Mapillary — FREE (token) street-level shopfront photos at the coordinates. */
export function mapillaryProvider(accessToken: string): PhotoProvider {
  return {
    name: "mapillary",
    photosFor(business, opts) {
      const o: Parameters<typeof fetchMapillaryPhotos>[1] = { accessToken };
      if (opts.fetchImpl) o.fetchImpl = opts.fetchImpl;
      if (opts.maxPhotos !== undefined) o.maxPhotos = opts.maxPhotos;
      return fetchMapillaryPhotos(business, o);
    },
  };
}

export type PhotoProviderName = "google" | "google-places" | "foursquare" | "fsq" | "mapillary";

/**
 * Resolve a provider by name + key. Returns undefined when the name is unknown
 * or the key is missing (the enrichment layer then falls back to website-only,
 * which needs no key at all).
 */
export function resolvePhotoProvider(
  name: string | undefined,
  keys: { googlePlaces?: string; foursquare?: string; mapillary?: string },
): PhotoProvider | undefined {
  const n = (name ?? "").trim().toLowerCase();
  if (n === "foursquare" || n === "fsq") {
    return keys.foursquare ? foursquareProvider(keys.foursquare) : undefined;
  }
  if (n === "google" || n === "google-places") {
    return keys.googlePlaces ? googlePlacesProvider(keys.googlePlaces) : undefined;
  }
  // Mapillary is free but street-level/approximate — opt-in by name only, never
  // auto-preferred over a POI-linked source.
  if (n === "mapillary") {
    return keys.mapillary ? mapillaryProvider(keys.mapillary) : undefined;
  }
  // No explicit name: prefer whichever key is present (Foursquare first — cheaper).
  if (keys.foursquare) return foursquareProvider(keys.foursquare);
  if (keys.googlePlaces) return googlePlacesProvider(keys.googlePlaces);
  return undefined;
}
