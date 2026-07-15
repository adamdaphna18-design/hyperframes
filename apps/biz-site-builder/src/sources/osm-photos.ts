import type { Business } from "../types.ts";

/**
 * **Free, keyless photo source: OpenStreetMap + Wikimedia Commons.**
 *
 * No paid API. When a business's OSM record carries a photo tag, that photo was
 * attached by a contributor to *that specific POI*, so it is unambiguously the
 * business's own — never a stock/nearby substitute. Sources, all free:
 *
 *   - `image` / `image:N`  — a direct photo URL on the POI.
 *   - `wikimedia_commons`  — a `File:…` on Commons; resolved KEYLESSLY via the
 *     `Special:FilePath` redirect (no API call — the URL itself serves the image).
 *   - `wikidata`           — the entity's P18 image claim, via the free Wikidata
 *     EntityData JSON endpoint (no key), then `Special:FilePath`.
 *
 * We deliberately DON'T do a radius/geosearch for nearby Commons photos: that
 * could attach a neighbouring building's picture, which wouldn't be theirs. Only
 * links that identify this exact place are used. Network (Wikidata) is injected
 * for tests; the tag/URL parsing is pure.
 */

const FILEPATH_BASE = "https://commons.wikimedia.org/wiki/Special:FilePath/";
const WIKIDATA_ENTITY = "https://www.wikidata.org/wiki/Special:EntityData/";

/** A keyless, direct image URL for a Commons `File:` name (no API call needed). */
export function commonsFilePath(fileName: string, opts: { width?: number } = {}): string {
  const name = fileName
    .replace(/^File:/i, "")
    .trim()
    .replace(/ /g, "_");
  const q = opts.width ? `?width=${opts.width}` : "";
  return `${FILEPATH_BASE}${encodeURIComponent(name)}${q}`;
}

function isImageName(name: string): boolean {
  return /\.(jpe?g|png|webp|gif|tiff?)$/i.test(name.trim());
}

/** Collect real photo URLs from a POI's OSM tags (pure — no network). */
export function parseOsmPhotoTags(tags: Record<string, string>, width = 1200): string[] {
  const out: string[] = [];
  const push = (u: string | undefined) => {
    if (u && /^https?:\/\//i.test(u) && !out.includes(u)) out.push(u);
  };

  // Direct image URLs: `image`, `image:0`.. plus panoramic/interior variants.
  for (const [key, value] of Object.entries(tags)) {
    if (/^image(:\d+)?$/i.test(key)) {
      for (const part of value.split(";")) push(part.trim());
    }
  }

  // Wikimedia Commons File(s) → keyless Special:FilePath URLs.
  const commons = tags.wikimedia_commons ?? tags["image:wikimedia_commons"];
  if (commons) {
    for (const entry of commons.split(";")) {
      const e = entry.trim();
      if (/^File:/i.test(e) && isImageName(e)) push(commonsFilePath(e, { width }));
    }
  }
  return out;
}

/** The Wikidata QID linked from a POI, if any (pure). */
export function osmWikidataId(tags: Record<string, string>): string | undefined {
  const q = tags.wikidata ?? tags["subject:wikidata"] ?? tags["brand:wikidata"];
  return q && /^Q\d+$/.test(q.trim()) ? q.trim() : undefined;
}

/** Resolve a Wikidata entity's P18 image to a keyless Commons URL (free API). */
export async function fetchWikidataImage(
  qid: string,
  opts: { fetchImpl?: typeof fetch; width?: number } = {},
): Promise<string | undefined> {
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${WIKIDATA_ENTITY}${encodeURIComponent(qid)}.json`);
    if (!res.ok) return undefined;
    const json = (await res.json()) as {
      entities?: Record<string, { claims?: Record<string, unknown> }>;
    };
    const entity = json.entities?.[qid];
    const p18 = entity?.claims?.["P18"];
    if (!Array.isArray(p18) || p18.length === 0) return undefined;
    const first = p18[0] as { mainsnak?: { datavalue?: { value?: unknown } } };
    const file = first.mainsnak?.datavalue?.value;
    if (typeof file === "string" && isImageName(file)) {
      return commonsFilePath(file, opts.width ? { width: opts.width } : {});
    }
  } catch {
    // Free endpoint down / offline — no photo, no fabrication.
  }
  return undefined;
}

/**
 * Free OSM/Wikimedia photos for a business, from its preserved tags. `[]` on a
 * miss — never a substitute. No API key, no payment.
 */
export async function osmFreePhotos(
  business: Business,
  opts: { fetchImpl?: typeof fetch; maxPhotos?: number } = {},
): Promise<string[]> {
  const tags = business.tags;
  if (!tags) return [];
  const max = opts.maxPhotos ?? 6;

  const direct = parseOsmPhotoTags(tags);
  if (direct.length) return direct.slice(0, max);

  const qid = osmWikidataId(tags);
  if (qid) {
    const wd: { fetchImpl?: typeof fetch } = {};
    if (opts.fetchImpl) wd.fetchImpl = opts.fetchImpl;
    const img = await fetchWikidataImage(qid, wd);
    if (img) return [img];
  }
  return [];
}
