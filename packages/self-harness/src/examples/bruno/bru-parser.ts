/**
 * A parser for Bruno's `.bru` request format
 * (https://github.com/usebruno/bruno). A `.bru` file is a sequence of named
 * blocks — `meta { ... }`, `get { ... }`, `headers { ... }`, `assert { ... }`,
 * `body:json { ... }`, and so on. Dictionary blocks hold `key: value` lines
 * (a leading `~` marks the entry disabled); a handful of blocks (bodies,
 * scripts, docs, tests) hold raw text. This parser tokenizes those blocks with
 * brace matching so nested braces inside JSON bodies are preserved.
 */

export interface BruEntry {
  name: string;
  value: string;
  enabled: boolean;
}

export type BruBlock = { kind: "dict"; entries: BruEntry[] } | { kind: "text"; text: string };

/** A parsed `.bru` document: block name → block. Later blocks win on collision. */
export type BruDocument = Map<string, BruBlock>;

function isTextBlock(name: string): boolean {
  return (
    name.startsWith("body:") || name.startsWith("script:") || name === "docs" || name === "tests"
  );
}

/** Parse a `.bru` file's text into a {@link BruDocument}. */
export function parseBru(source: string): BruDocument {
  const doc: BruDocument = new Map();
  let i = 0;
  const n = source.length;

  while (i < n) {
    // Skip whitespace between blocks.
    while (i < n && /\s/.test(source[i] as string)) i++;
    if (i >= n) break;

    const nameMatch = /^([A-Za-z0-9:_-]+)\s*\{/.exec(source.slice(i));
    if (!nameMatch) {
      // Not a block start — skip the line and continue defensively.
      const nl = source.indexOf("\n", i);
      if (nl === -1) break;
      i = nl + 1;
      continue;
    }

    const name = nameMatch[1] as string;
    const braceStart = i + nameMatch[0].length - 1; // index of the "{"
    const braceEnd = matchBrace(source, braceStart);
    if (braceEnd === -1) break; // unbalanced; stop parsing
    const inner = source.slice(braceStart + 1, braceEnd);
    doc.set(
      name,
      isTextBlock(name) ? { kind: "text", text: trimBlockText(inner) } : parseDict(inner),
    );
    i = braceEnd + 1;
  }

  return doc;
}

/** Find the index of the `}` matching the `{` at `open`, honoring nesting. */
function matchBrace(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function parseDict(inner: string): BruBlock {
  const entries: BruEntry[] = [];
  for (const raw of inner.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const rawKey = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    const enabled = !rawKey.startsWith("~");
    const name = enabled ? rawKey : rawKey.slice(1).trim();
    entries.push({ name, value, enabled });
  }
  return { kind: "dict", entries };
}

/** Strip the leading/trailing blank lines a text block picks up from `{ \n ... \n }`. */
function trimBlockText(inner: string): string {
  return inner.replace(/^\n/, "").replace(/\n[ \t]*$/, "");
}

/** Convenience: the entries of a dict block, or [] for a missing/text block. */
export function dictEntries(doc: BruDocument, name: string): BruEntry[] {
  const block = doc.get(name);
  return block && block.kind === "dict" ? block.entries : [];
}
