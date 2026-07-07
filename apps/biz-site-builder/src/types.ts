/**
 * Core data model shared across sources, detection and generators.
 *
 * A `Business` is source-agnostic: a CSV row, a JSON record and an OpenStreetMap
 * POI all normalise to this shape so the rest of the pipeline never has to know
 * where the data came from.
 */

export interface Review {
  author?: string;
  /** 0–5, if the source provides one. */
  rating?: number;
  text: string;
  /** ISO date string if known. */
  date?: string;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface Business {
  /** Stable identifier used for dedupe and output slugs. */
  id: string;
  name: string;
  /** Human-readable category, e.g. "Coffee Shop", "Plumber". */
  category?: string;
  description?: string;
  address?: string;
  phone?: string;
  email?: string;
  /**
   * The business's own website, if any. `null`/empty is the signal that we
   * should build one. A social-media URL is NOT a website (see detect.ts).
   */
  website?: string | null;
  /** Free-form opening hours string, e.g. "Mon–Fri 9–5". */
  hours?: string;
  /** Absolute image URLs (logo, storefront, product shots). */
  images: string[];
  reviews: Review[];
  /** Aggregate rating 0–5 if the source provides one. */
  rating?: number;
  location?: GeoPoint;
  /** Raw source tags kept for debugging / advanced templates. */
  tags?: Record<string, string>;
  /** Which source produced this record. */
  source?: string;
}

/**
 * A pluggable business-data provider. Implementations live in src/sources/*.
 * `load` returns normalised `Business` records; it may hit the network (Overpass)
 * or read local files (CSV/JSON).
 */
export interface BusinessSource {
  readonly name: string;
  load(): Promise<Business[]>;
}

export interface WebsiteStatus {
  hasWebsite: boolean;
  /** The URL we considered, if any. */
  url?: string;
  /** Set when a liveness check ran. `undefined` means "not checked". */
  live?: boolean;
  /** Why we decided the business needs a site (for reporting). */
  reason: string;
  /** Detected platform/CMS of an existing live site (verify-live only). */
  platform?: string;
  /** All detected technologies of the existing site. */
  technologies?: string[];
  /** The existing site runs on a locked-in DIY builder (weak presence). */
  weakBuilder?: boolean;
  /** The existing site runs visibly outdated tech → a redesign lead. */
  outdated?: boolean;
}
