import { readFile } from "node:fs/promises";
import type { Business, BusinessSource } from "../types.ts";
import { normalizeRecord } from "./normalize.ts";

/**
 * data.gov.il — Israel's official government open-data portal, powered by CKAN.
 * There is no single registry of "all Israeli businesses", but many datasets
 * (company registry, licensed businesses, food service, markets, etc.) are
 * published here as CKAN resources queryable via `datastore_search`. Fields are
 * typically Hebrew — the normalizer's Hebrew aliases map them to the Business
 * shape, and the Israel market detection then renders them in Hebrew/RTL.
 *
 * Find a resource id at https://data.gov.il and pass it as `resource=<id>`, or
 * use the `registry` alias for the **Registrar of Companies** (רשם החברות).
 */

/** data.gov.il resource id for the Israeli Registrar of Companies (רשם החברות). */
export const COMPANY_REGISTRY_RESOURCE = "f004176c-b85f-4542-8901-7b3176f9a054";

/** The registry's status field + the value marking an active company. */
export const REGISTRY_STATUS_FIELD = "סטטוס חברה";
export const REGISTRY_STATUS_ACTIVE = "פעילה";

const REGISTRY_ALIASES = new Set([
  "registry",
  "companies",
  "company-registry",
  "rasham",
  "רשם",
  "רשם החברות",
  "רשם_החברות",
]);

export interface DataGovIlOptions {
  resourceId: string;
  /** Free-text filter passed to CKAN `q`. */
  query?: string;
  limit?: number;
  /** Exact-match field filters passed to CKAN `filters` (JSON). */
  filters?: Record<string, string>;
  /** Replay a saved CKAN response from disk instead of calling the network. */
  file?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

interface CkanResponse {
  success?: boolean;
  result?: { records?: Record<string, unknown>[] };
}

/** Map CKAN records to businesses (network-free, testable). */
export function ckanRecordsToBusinesses(records: Record<string, unknown>[]): Business[] {
  return records.map((rec, i) => normalizeRecord(rec, "datagovil", i));
}

/** Extract records from a CKAN datastore_search response (or a bare array). */
function recordsFromCkan(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  const j = json as CkanResponse & { records?: Record<string, unknown>[] };
  return j.result?.records ?? j.records ?? [];
}

export class DataGovIlSource implements BusinessSource {
  readonly name: string;
  constructor(private readonly opts: DataGovIlOptions) {
    if (!opts.resourceId && !opts.file)
      throw new Error("DataGovIlSource needs a `resource` id (or a `file` to replay).");
    this.name = `datagovil:${opts.resourceId || opts.file}`;
  }

  async load(): Promise<Business[]> {
    // Offline replay of a saved CKAN response — no network.
    if (this.opts.file) {
      const text = await readFile(this.opts.file, "utf8");
      return ckanRecordsToBusinesses(recordsFromCkan(JSON.parse(text)));
    }
    const endpoint = this.opts.endpoint ?? "https://data.gov.il/api/3/action/datastore_search";
    const doFetch = this.opts.fetchImpl ?? fetch;
    const params = new URLSearchParams({
      resource_id: this.opts.resourceId,
      limit: String(this.opts.limit ?? 100),
    });
    if (this.opts.query) params.set("q", this.opts.query);
    if (this.opts.filters && Object.keys(this.opts.filters).length)
      params.set("filters", JSON.stringify(this.opts.filters));
    const res = await doFetch(`${endpoint}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`data.gov.il request failed: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as CkanResponse;
    return ckanRecordsToBusinesses(recordsFromCkan(json));
  }
}

/**
 * Parse `datagovil:resource=<id>,q=<query>,limit=<n>` — or the `registry`
 * alias for רשם החברות, which resolves to the registrar resource id and filters
 * to active companies by default (`active=false` to include struck-off ones).
 */
export function parseDataGovIlSpec(spec: string): DataGovIlOptions {
  const opts: DataGovIlOptions = { resourceId: "" };
  let active: boolean | undefined;
  for (const part of spec.split(/[,;](?=\s*(?:resource|resource_id|q|query|limit|active|file)=)/)) {
    const [k, ...rest] = part.split("=");
    const key = k?.trim();
    const value = rest.join("=").trim();
    if (key === "resource" || key === "resource_id") opts.resourceId = value;
    else if (key === "q" || key === "query") opts.query = value;
    else if (key === "limit") opts.limit = Number(value) || undefined;
    else if (key === "active") active = value !== "false" && value !== "0";
    else if (key === "file") opts.file = value;
  }
  // A leading bare token (before any key=value) is the resource id or alias.
  if (!opts.resourceId) {
    const first = spec.split(/[,;]/)[0]?.trim();
    if (first && !first.includes("=")) opts.resourceId = first;
  }
  // Resolve the registrar alias → real resource id, active-only by default.
  if (REGISTRY_ALIASES.has(opts.resourceId.toLowerCase())) {
    opts.resourceId = COMPANY_REGISTRY_RESOURCE;
    if (active !== false) opts.filters = { [REGISTRY_STATUS_FIELD]: REGISTRY_STATUS_ACTIVE };
  } else if (opts.resourceId === COMPANY_REGISTRY_RESOURCE && active) {
    opts.filters = { [REGISTRY_STATUS_FIELD]: REGISTRY_STATUS_ACTIVE };
  }
  return opts;
}
