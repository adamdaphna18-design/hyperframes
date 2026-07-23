import { readFile } from "node:fs/promises";
import type { Business, BusinessSource } from "../types.ts";
import { normalizeRecord } from "./normalize.ts";

/**
 * Accepts either a top-level array of records, or an object with a `businesses`
 * / `results` / `elements` array (the common wrappers used by dataset exports
 * and place APIs).
 */
export function jsonToRecords(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const key of ["businesses", "results", "data", "elements", "items"]) {
      if (Array.isArray(o[key])) return o[key] as Record<string, unknown>[];
    }
  }
  return [];
}

export class JsonSource implements BusinessSource {
  readonly name: string;
  constructor(private readonly path: string) {
    this.name = `json:${path}`;
  }
  async load(): Promise<Business[]> {
    const text = await readFile(this.path, "utf8");
    const records = jsonToRecords(JSON.parse(text));
    return records.map((rec, i) => normalizeRecord(rec, this.name, i));
  }
}
