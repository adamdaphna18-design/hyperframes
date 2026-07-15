import type { Business } from "../types.ts";

/**
 * **Google Places (New) photo connector** — the honest source of a real local
 * business's real photos.
 *
 * The whole point of this builder is businesses with NO website: there is no
 * site to scrape their storefront/interior shots from. Their photos DO exist in
 * one canonical place — their Google Business Profile — and the Places API
 * serves them. This connector resolves the business by name + address, then
 * pulls its Place Photos.
 *
 * Two rules keep it honest and safe:
 *   1. It NEVER generates or substitutes a stock/AI photo — it returns only the
 *      business's own Google-hosted photos, or nothing.
 *   2. A Place Photo media URL carries the API key as a query param. Embedding
 *      that in a published page would leak the key, so this connector DOWNLOADS
 *      the bytes and hands back a self-contained `data:` URI. The key stays
 *      server-side; the generated site stays portable.
 *
 * All network goes through an injected `fetchImpl`, so the pure parts (request
 * shaping, response parsing, URL building) are unit-tested against fixtures and
 * the whole thing is inert without a `GOOGLE_PLACES_API_KEY`.
 */

const SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const PHOTO_HOST = "https://places.googleapis.com/v1/";

export interface PlacePhotoRef {
  /** e.g. "places/ChIJ.../photos/AeJ..." */
  name: string;
  widthPx?: number;
  heightPx?: number;
}

export interface PlacesOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  /** Max photos to pull (default 6). */
  maxPhotos?: number;
  /** Requested pixel width of each photo (default 1200). */
  maxWidthPx?: number;
  /** BCP-47 language for the text search (default from the business locale). */
  languageCode?: string;
}

/** The text query used to resolve the place: name plus address when known. */
export function placeQuery(business: Business): string {
  return [business.name, business.address].filter(Boolean).join(", ");
}

/** Build the Places `searchText` request (pure — no network). */
export function placesSearchRequest(
  business: Business,
  opts: PlacesOptions,
): { url: string; init: RequestInit } {
  return {
    url: SEARCH_ENDPOINT,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": opts.apiKey,
        // Only ask for what we use — id + photo refs.
        "X-Goog-FieldMask": "places.id,places.displayName,places.photos",
      },
      body: JSON.stringify({
        textQuery: placeQuery(business),
        maxResultCount: 1,
        ...(opts.languageCode ? { languageCode: opts.languageCode } : {}),
      }),
    },
  };
}

/** Parse a `places:searchText` JSON body into photo references (pure). */
export function parsePlacesPhotos(json: unknown): PlacePhotoRef[] {
  if (!json || typeof json !== "object") return [];
  const places = (json as { places?: unknown }).places;
  if (!Array.isArray(places) || places.length === 0) return [];
  const first = places[0];
  if (!first || typeof first !== "object") return [];
  const photos = (first as { photos?: unknown }).photos;
  if (!Array.isArray(photos)) return [];
  const refs: PlacePhotoRef[] = [];
  for (const p of photos) {
    if (p && typeof p === "object") {
      const name = (p as { name?: unknown }).name;
      if (typeof name === "string" && /^places\/[^/]+\/photos\//.test(name)) {
        const width = (p as { widthPx?: unknown }).widthPx;
        const height = (p as { heightPx?: unknown }).heightPx;
        refs.push({
          name,
          widthPx: typeof width === "number" ? width : undefined,
          heightPx: typeof height === "number" ? height : undefined,
        });
      }
    }
  }
  return refs;
}

/** Build the media URL that returns the photo bytes (pure). Carries the key. */
export function photoMediaUrl(
  ref: PlacePhotoRef,
  opts: { apiKey: string; maxWidthPx?: number },
): string {
  const w = opts.maxWidthPx ?? 1200;
  return `${PHOTO_HOST}${ref.name}/media?maxWidthPx=${w}&key=${encodeURIComponent(opts.apiKey)}`;
}

/** MIME type from the media response's content-type, defaulting to JPEG. */
function imageMime(contentType: string | null): string | undefined {
  if (!contentType) return "image/jpeg";
  const type = contentType.split(";")[0]!.trim().toLowerCase();
  return /^image\//.test(type) ? type : "image/jpeg";
}

/**
 * Resolve a business to its Google Business Profile photos and return them as
 * self-contained `data:` URIs (key-safe). Returns `[]` on any miss — never a
 * fabricated image. Network is injected for tests.
 */
export async function fetchPlacePhotoData(
  business: Business,
  opts: PlacesOptions,
): Promise<string[]> {
  if (!opts.apiKey) return [];
  const doFetch = opts.fetchImpl ?? fetch;
  const max = opts.maxPhotos ?? 6;

  let refs: PlacePhotoRef[];
  try {
    const { url, init } = placesSearchRequest(business, opts);
    const res = await doFetch(url, init);
    if (!res.ok) return [];
    refs = parsePlacesPhotos(await res.json());
  } catch {
    return [];
  }
  if (refs.length === 0) return [];

  const out: string[] = [];
  for (const ref of refs.slice(0, max)) {
    try {
      const res = await doFetch(photoMediaUrl(ref, opts), { redirect: "follow" });
      if (!res.ok) continue;
      const mime = imageMime(res.headers.get("content-type"));
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length === 0) continue;
      out.push(`data:${mime};base64,${bytes.toString("base64")}`);
    } catch {
      // Skip a photo that fails to download; keep the rest.
    }
  }
  return out;
}
