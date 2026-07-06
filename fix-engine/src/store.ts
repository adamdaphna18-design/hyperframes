/**
 * Storage for the fix queue. The engine logic is storage-agnostic; the default
 * is a single JSON file (per the spec — "a JSON file, not a DB table" so the
 * whole scaffold lifts out in one move). An in-memory store backs the tests.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { EMPTY_STATE, type QueueState } from "./types.ts";

export interface QueueStore {
  read(): Promise<QueueState>;
  write(state: QueueState): Promise<void>;
}

/** JSON-file store. Creates the file (and parent dir) on first write. */
export class JsonFileStore implements QueueStore {
  #path: string;

  constructor(path: string) {
    this.#path = path;
  }

  async read(): Promise<QueueState> {
    try {
      const raw = await readFile(this.#path, "utf8");
      const parsed = JSON.parse(raw) as QueueState;
      // Tolerate a hand-emptied or partial file.
      return {
        cards: Array.isArray(parsed.cards) ? parsed.cards : [],
        seq: typeof parsed.seq === "number" ? parsed.seq : 0,
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...EMPTY_STATE };
      throw err;
    }
  }

  async write(state: QueueState): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true });
    await writeFile(this.#path, JSON.stringify(state, null, 2) + "\n", "utf8");
  }
}

/** Deterministic in-memory store for tests. */
export class MemoryStore implements QueueStore {
  #state: QueueState;

  constructor(initial: QueueState = { ...EMPTY_STATE }) {
    this.#state = structuredClone(initial);
  }

  async read(): Promise<QueueState> {
    return structuredClone(this.#state);
  }

  async write(state: QueueState): Promise<void> {
    this.#state = structuredClone(state);
  }
}
