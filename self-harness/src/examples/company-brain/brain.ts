import { crossLink, type BrainPage } from "./ingest.js";
import type { Warehouse } from "./warehouse.js";

/**
 * Ranks pages against a query — the "semantic search on top" of the brain. The
 * offline default is lexical (token overlap); a real drop-in implements the same
 * interface over embeddings so it finds by meaning even when the words don't match.
 */
export interface Retriever {
  rank(query: string, pages: BrainPage[]): BrainPage[];
}

/** Deterministic token-overlap retriever — the offline default. */
export class LexicalRetriever implements Retriever {
  rank(query: string, pages: BrainPage[]): BrainPage[] {
    const terms = tokenize(query);
    return pages
      .map((page) => ({ page, score: overlap(terms, page) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || a.page.id.localeCompare(b.page.id))
      .map((s) => s.page);
  }
}

/**
 * THE COMPANY BRAIN — sources and data merged into one searchable memory. Agents
 * read it before they act (`context`), it is queryable (`search`), and results
 * file back into it (`writeBack`) so it compounds.
 */
export class CompanyBrain {
  private wiki: BrainPage[];

  constructor(
    pages: BrainPage[],
    readonly warehouse: Warehouse,
    private readonly retriever: Retriever = new LexicalRetriever(),
  ) {
    this.wiki = pages;
  }

  /** Semantic search across the whole brain. */
  // Called on the factory-built brain (demo + tests), which fallow can't attribute.
  // fallow-ignore-next-line unused-class-member
  search(query: string): BrainPage[] {
    return this.retriever.rank(query, this.wiki);
  }

  /** The brain slice a specialist reads before acting: pages tagged with its vertical. */
  context(vertical: string): BrainPage[] {
    return this.wiki.filter((p) => p.tags.includes(vertical) || p.vertical === vertical);
  }

  /** File a result back into the brain as a new cross-linked page — it compounds. */
  writeBack(page: BrainPage): void {
    const without = this.wiki.filter((p) => p.id !== page.id);
    this.wiki = crossLink([...without, page]);
  }

  // Called on the factory-built brain (demo + tests), which fallow can't attribute.
  // fallow-ignore-next-line unused-class-member
  pages(): BrainPage[] {
    return this.wiki;
  }
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function overlap(terms: Set<string>, page: BrainPage): number {
  const hay = tokenize(`${page.title} ${page.body} ${page.tags.join(" ")}`);
  let score = 0;
  for (const t of terms) if (hay.has(t)) score++;
  return score;
}
