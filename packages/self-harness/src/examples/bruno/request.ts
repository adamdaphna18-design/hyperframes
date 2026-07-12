import { parseAssertions, type Assertion } from "./assertions.js";
import { dictEntries, type BruDocument } from "./bru-parser.js";
import { interpolate, type BruEnvironment } from "./environment.js";

/** A structured Bruno HTTP request extracted from a parsed `.bru` document. */
export interface BruRequest {
  name: string;
  type: string;
  seq?: number;
  method: string;
  url: string;
  headers: Array<{ name: string; value: string }>;
  query: Array<{ name: string; value: string }>;
  assertions: Assertion[];
}

const METHOD_BLOCKS = ["get", "post", "put", "delete", "patch", "head", "options"] as const;

/** Convert a parsed `.bru` document into a {@link BruRequest}, interpolating env vars. */
export function toBruRequest(doc: BruDocument, env: BruEnvironment = new Map()): BruRequest {
  const meta = new Map(dictEntries(doc, "meta").map((e) => [e.name, e.value]));
  const method = METHOD_BLOCKS.find((m) => doc.has(m)) ?? "get";
  const urlEntry = dictEntries(doc, method).find((e) => e.name === "url");
  const subst = (s: string) => interpolate(s, env);

  return {
    name: meta.get("name") ?? "unnamed",
    type: meta.get("type") ?? "http",
    seq: meta.has("seq") ? Number(meta.get("seq")) : undefined,
    method: method.toUpperCase(),
    url: subst(urlEntry?.value ?? ""),
    headers: enabledPairs(doc, "headers", subst),
    query: enabledPairs(doc, "query", subst).concat(enabledPairs(doc, "params:query", subst)),
    assertions: parseAssertions(doc),
  };
}

function enabledPairs(
  doc: BruDocument,
  block: string,
  subst: (s: string) => string,
): Array<{ name: string; value: string }> {
  return dictEntries(doc, block)
    .filter((e) => e.enabled)
    .map((e) => ({ name: e.name, value: subst(e.value) }));
}
