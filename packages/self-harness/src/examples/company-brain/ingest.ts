import type { Source } from "./sources.js";

/**
 * A compiled wiki page — a source (or a learned playbook) turned into a tagged,
 * cross-linked page. This is what the agents query: "what you know".
 */
export interface BrainPage {
  id: string;
  title: string;
  body: string;
  tags: string[];
  /** Ids of other pages this one cross-links to (shared tag). */
  links: string[];
  /** The vertical this page belongs to, when it is a playbook page. */
  vertical?: string;
}

/**
 * INGEST: read every source, tag it (its verticals plus salient keywords), and
 * bind pages by shared tags into cross-links — sources merged into one
 * searchable memory. Deterministic: no model, no network.
 */
export function ingest(sources: Source[]): BrainPage[] {
  const pages: BrainPage[] = sources.map((s) => ({
    id: s.id,
    title: s.title,
    body: s.text,
    tags: [...new Set([...s.verticals, ...keywords(s.text)])].sort(),
    links: [],
    vertical: undefined,
  }));
  return crossLink(pages);
}

/** Recompute cross-links: two pages link when they share at least one tag. */
export function crossLink(pages: BrainPage[]): BrainPage[] {
  return pages.map((page) => ({
    ...page,
    links: pages
      .filter((other) => other.id !== page.id && shareTag(page, other))
      .map((other) => other.id)
      .sort(),
  }));
}

function shareTag(a: BrainPage, b: BrainPage): boolean {
  const bTags = new Set(b.tags);
  return a.tags.some((t) => bTags.has(t));
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "not",
  "but",
  "our",
  "are",
  "was",
  "you",
  "its",
  "a",
  "an",
  "to",
  "of",
  "in",
  "it",
  "is",
  "as",
  "on",
  "we",
  "up",
  "so",
  "no",
  "at",
  "be",
]);

/** A few salient keywords from a text — lowercase words over three chars, not stopwords. */
function keywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  return [...new Set(words)];
}
