import type { Business, BusinessSource } from "../types.ts";

/**
 * OpenStreetMap via the Overpass API — a free, open, no-key dataset of local
 * businesses (POIs) that crucially carries a `website` tag, which is exactly the
 * signal this tool keys off. This is the "free open data + scraping" source.
 *
 * Caveats, stated honestly:
 *  - OSM has no community reviews and rarely has photos, so generated sites for
 *    OSM businesses fall back to profile-only content. Merge with a reviews CSV
 *    (via a second --source) to enrich them.
 *  - Be a good citizen: Overpass is community-run. Keep queries small (use an
 *    area/bbox), cache results, and respect the usage policy.
 */

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const CATEGORY_KEYS = ["shop", "amenity", "craft", "office", "tourism", "leisure"] as const;

function titleize(v: string): string {
  return v.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildAddress(tags: Record<string, string>): string | undefined {
  const parts = [
    [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" "),
    tags["addr:city"],
    tags["addr:state"],
    tags["addr:postcode"],
  ].filter((p) => p && p.trim());
  return parts.length ? parts.join(", ") : undefined;
}

/** Pure mapping from an Overpass element to a Business (network-free, testable). */
export function overpassElementToBusiness(el: OverpassElement): Business | null {
  const tags = el.tags ?? {};
  const name = tags.name?.trim();
  if (!name) return null; // Unnamed POIs aren't businesses we can build for.

  const category =
    CATEGORY_KEYS.map((k) => tags[k])
      .filter(Boolean)
      .map((v) => titleize(v!))
      .join(" · ") || undefined;

  const website =
    tags.website ?? tags["contact:website"] ?? tags.url ?? tags["contact:url"] ?? null;

  const loc =
    el.center ??
    (el.lat !== undefined && el.lon !== undefined ? { lat: el.lat, lon: el.lon } : undefined);

  const business: Business = {
    id: `osm-${el.type}-${el.id}`,
    name,
    website: website ? website.trim() : null,
    images: [tags.image].filter((x): x is string => Boolean(x)),
    reviews: [],
    source: "overpass",
    tags,
  };
  if (category) business.category = category;
  const desc = tags.description ?? tags["description:en"];
  if (desc) business.description = desc;
  const addr = buildAddress(tags);
  if (addr) business.address = addr;
  const phone = tags.phone ?? tags["contact:phone"];
  if (phone) business.phone = phone;
  const email = tags.email ?? tags["contact:email"];
  if (email) business.email = email;
  if (tags.opening_hours) business.hours = tags.opening_hours;
  if (loc) business.location = loc;
  return business;
}

export function elementsToBusinesses(elements: OverpassElement[]): Business[] {
  return elements.map(overpassElementToBusiness).filter((b): b is Business => b !== null);
}

/**
 * Build an Overpass QL query for named businesses within an area (by name) or a
 * bounding box `south,west,north,east`.
 */
export function buildOverpassQuery(opts: { area?: string; bbox?: string }): string {
  const selectors = CATEGORY_KEYS.map((k) => `nwr[${JSON.stringify(k)}][name]`);
  if (opts.area) {
    const area = `area[name=${JSON.stringify(opts.area)}]->.a;`;
    const body = selectors.map((s) => `${s}(area.a);`).join("\n  ");
    return `[out:json][timeout:60];\n${area}\n(\n  ${body}\n);\nout center tags;`;
  }
  const bbox = opts.bbox ?? "0,0,0,0";
  const body = selectors.map((s) => `${s}(${bbox});`).join("\n  ");
  return `[out:json][timeout:60];\n(\n  ${body}\n);\nout center tags;`;
}

export interface OverpassOptions {
  /** Place name, e.g. "Brooklyn". */
  area?: string;
  /** Bounding box "south,west,north,east". */
  bbox?: string;
  endpoint?: string;
  /** Cap results to keep runs polite. */
  limit?: number;
  fetchImpl?: typeof fetch;
}

export class OverpassSource implements BusinessSource {
  readonly name = "overpass";
  constructor(private readonly opts: OverpassOptions) {
    if (!opts.area && !opts.bbox) {
      throw new Error("OverpassSource needs either `area` or `bbox`.");
    }
  }
  async load(): Promise<Business[]> {
    const endpoint = this.opts.endpoint ?? "https://overpass-api.de/api/interpreter";
    const doFetch = this.opts.fetchImpl ?? fetch;
    const query = buildOverpassQuery({ area: this.opts.area, bbox: this.opts.bbox });
    const res = await doFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: query }).toString(),
    });
    if (!res.ok) {
      throw new Error(`Overpass request failed: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as { elements?: OverpassElement[] };
    let businesses = elementsToBusinesses(json.elements ?? []);
    if (this.opts.limit && businesses.length > this.opts.limit) {
      businesses = businesses.slice(0, this.opts.limit);
    }
    return businesses;
  }
}

/** Parse `overpass:area=Brooklyn` / `overpass:bbox=40.6,-74.0,40.7,-73.9`. */
export function parseOverpassSpec(spec: string): OverpassOptions {
  const opts: OverpassOptions = {};
  for (const part of spec.split(/[,;](?=\s*(?:area|bbox|limit)=)/)) {
    const [k, ...rest] = part.split("=");
    const key = k?.trim();
    const value = rest.join("=").trim();
    if (key === "area") opts.area = value;
    else if (key === "bbox") opts.bbox = value;
    else if (key === "limit") opts.limit = Number(value) || undefined;
  }
  // Fallback: a bare value is treated as an area name.
  if (!opts.area && !opts.bbox && spec.trim() && !spec.includes("=")) {
    opts.area = spec.trim();
  }
  return opts;
}
