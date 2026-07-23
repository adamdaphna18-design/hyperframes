import { readFile } from "node:fs/promises";
import type { Business, BusinessSource } from "../types.ts";
import { normalizeRecord } from "./normalize.ts";

/**
 * Parse RFC-4180-ish CSV text into rows of cells. Handles quoted fields,
 * escaped quotes (`""`), and embedded newlines/commas inside quotes.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Strip a UTF-8 BOM if present.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // Swallow \r\n as one line break.
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // Flush trailing field/row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Convert CSV text into loose records keyed by header. */
export function csvToRecords(text: string): Record<string, unknown>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0]!.map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const rec: Record<string, unknown> = {};
    header.forEach((key, i) => {
      rec[key] = cells[i] ?? "";
    });
    return rec;
  });
}

export class CsvSource implements BusinessSource {
  readonly name: string;
  constructor(private readonly path: string) {
    this.name = `csv:${path}`;
  }
  async load(): Promise<Business[]> {
    const text = await readFile(this.path, "utf8");
    return csvToRecords(text).map((rec, i) => normalizeRecord(rec, this.name, i));
  }
}
