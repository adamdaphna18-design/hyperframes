import { readFile, writeFile } from "node:fs/promises";

/**
 * A resume journal: records the result of every completed step keyed by its
 * label. On a later run with the same journal, completed steps return their
 * cached value instead of re-executing — the deterministic-resume property that
 * dynamic-workflow runtimes (odw, open-dynamic-workflows) are built around.
 *
 * Values must be JSON-serialisable (they are, in this pipeline: statuses and
 * output paths).
 */
export class Journal {
  private readonly entries: Map<string, unknown>;

  constructor(entries?: Record<string, unknown>) {
    this.entries = new Map(Object.entries(entries ?? {}));
  }

  has(label: string): boolean {
    return this.entries.has(label);
  }

  get<T>(label: string): { hit: true; value: T } | { hit: false } {
    if (this.entries.has(label)) return { hit: true, value: this.entries.get(label) as T };
    return { hit: false };
  }

  set(label: string, value: unknown): void {
    this.entries.set(label, value);
  }

  get size(): number {
    return this.entries.size;
  }

  toJSON(): Record<string, unknown> {
    return Object.fromEntries(this.entries);
  }

  static async load(path: string): Promise<Journal> {
    try {
      const text = await readFile(path, "utf8");
      const data = JSON.parse(text) as { runId?: string; steps?: Record<string, unknown> };
      return new Journal(data.steps ?? {});
    } catch {
      // No journal yet (fresh run) — start empty.
      return new Journal();
    }
  }

  async save(path: string, runId: string): Promise<void> {
    await writeFile(path, JSON.stringify({ runId, steps: this.toJSON() }, null, 2) + "\n", "utf8");
  }
}
