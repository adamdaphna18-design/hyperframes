import { parseBru, dictEntries } from "./bru-parser.js";

/** A Bruno environment: variable name → value. */
export type BruEnvironment = Map<string, string>;

/** Parse a `.bru` environment file (its `vars { ... }` block) into a map. */
export function parseEnvironment(source: string): BruEnvironment {
  const doc = parseBru(source);
  const env: BruEnvironment = new Map();
  for (const entry of dictEntries(doc, "vars")) {
    if (entry.enabled) env.set(entry.name, entry.value);
  }
  return env;
}

/** Substitute `{{var}}` placeholders in a string using the environment. */
export function interpolate(value: string, env: BruEnvironment): string {
  return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (whole, name: string) => {
    const replacement = env.get(name);
    return replacement ?? whole;
  });
}
