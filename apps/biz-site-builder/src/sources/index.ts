import type { Business, BusinessSource } from "../types.ts";
import { CsvSource } from "./csv.ts";
import { JsonSource } from "./json.ts";
import { OverpassSource, parseOverpassSpec } from "./overpass.ts";
import { parseWebSpec, WebSource } from "./web.ts";

export { CsvSource } from "./csv.ts";
export { JsonSource } from "./json.ts";
export { OverpassSource } from "./overpass.ts";
export { WebSource } from "./web.ts";
export { normalizeRecord, slugify } from "./normalize.ts";

/**
 * Build a source from a `type:spec` string:
 *   csv:./data.csv
 *   json:./data.json
 *   overpass:area=Brooklyn,limit=200
 *   overpass:bbox=40.6,-74.0,40.7,-73.9
 */
export function createSource(spec: string): BusinessSource {
  const idx = spec.indexOf(":");
  const type = (idx === -1 ? spec : spec.slice(0, idx)).trim().toLowerCase();
  const rest = idx === -1 ? "" : spec.slice(idx + 1).trim();
  switch (type) {
    case "csv":
      return new CsvSource(rest);
    case "json":
      return new JsonSource(rest);
    case "overpass":
    case "osm":
      return new OverpassSource(parseOverpassSpec(rest));
    case "web":
    case "url":
      return new WebSource(parseWebSpec(rest));
    default:
      throw new Error(`Unknown source type "${type}". Use csv:, json:, overpass:, or web:.`);
  }
}

/**
 * Load every source and merge. When the same business (by id, or by
 * name+locality) appears in multiple sources, later sources enrich — but never
 * blank out — fields already set by earlier ones. This is how a reviews/photos
 * CSV augments a bare Overpass listing.
 */
export async function loadAndMerge(sources: BusinessSource[]): Promise<Business[]> {
  const byKey = new Map<string, Business>();
  for (const source of sources) {
    const businesses = await source.load();
    for (const b of businesses) {
      const key = mergeKey(b);
      const existing = byKey.get(key);
      byKey.set(key, existing ? mergeBusiness(existing, b) : b);
    }
  }
  return [...byKey.values()];
}

function mergeKey(b: Business): string {
  const locality = (b.address ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
  return `${b.name.toLowerCase().trim()}|${locality}`;
}

/** Fill gaps in `base` from `extra`; concatenate list fields. */
export function mergeBusiness(base: Business, extra: Business): Business {
  const merged: Business = { ...base };
  const scalarKeys = [
    "category",
    "description",
    "address",
    "phone",
    "email",
    "hours",
    "rating",
    "location",
  ] as const;
  for (const k of scalarKeys) {
    if ((merged[k] === undefined || merged[k] === null) && extra[k] !== undefined) {
      // @ts-expect-error index assignment across a heterogeneous key union
      merged[k] = extra[k];
    }
  }
  // A real website in either record wins over a missing one.
  if (!merged.website && extra.website) merged.website = extra.website;
  merged.images = [...new Set([...base.images, ...extra.images])];
  merged.reviews = [...base.reviews, ...extra.reviews];
  merged.tags = { ...(extra.tags ?? {}), ...(base.tags ?? {}) };
  return merged;
}
