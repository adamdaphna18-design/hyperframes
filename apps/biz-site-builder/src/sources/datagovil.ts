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
 * Find a resource id at https://data.gov.il and pass it as `resource=<id>`.
 */

export interface DataGovIlOptions {
  resourceId: string;
  /** Free-text filter passed to CKAN `q`. */
  query?: string;
  limit?: number;
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

export class DataGovIlSource implements BusinessSource {
  readonly name: string;
  constructor(private readonly opts: DataGovIlOptions) {
    if (!opts.resourceId) throw new Error("DataGovIlSource needs a `resource` id.");
    this.name = `datagovil:${opts.resourceId}`;
  }

  async load(): Promise<Business[]> {
    const endpoint = this.opts.endpoint ?? "https://data.gov.il/api/3/action/datastore_search";
    const doFetch = this.opts.fetchImpl ?? fetch;
    const params = new URLSearchParams({
      resource_id: this.opts.resourceId,
      limit: String(this.opts.limit ?? 100),
    });
    if (this.opts.query) params.set("q", this.opts.query);
    const res = await doFetch(`${endpoint}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`data.gov.il request failed: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as CkanResponse;
    return ckanRecordsToBusinesses(json.result?.records ?? []);
  }
}

/** Parse `datagovil:resource=<id>,q=<query>,limit=<n>`. */
export function parseDataGovIlSpec(spec: string): DataGovIlOptions {
  const opts: DataGovIlOptions = { resourceId: "" };
  for (const part of spec.split(/[,;](?=\s*(?:resource|q|query|limit)=)/)) {
    const [k, ...rest] = part.split("=");
    const key = k?.trim();
    const value = rest.join("=").trim();
    if (key === "resource" || key === "resource_id") opts.resourceId = value;
    else if (key === "q" || key === "query") opts.query = value;
    else if (key === "limit") opts.limit = Number(value) || undefined;
  }
  // Bare value is treated as a resource id.
  if (!opts.resourceId && spec.trim() && !spec.includes("=")) opts.resourceId = spec.trim();
  return opts;
}
