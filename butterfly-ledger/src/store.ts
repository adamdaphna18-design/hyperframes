/**
 * Storage abstraction. The ledger logic is storage-agnostic; production swaps
 * the in-memory store for Postgres (one append-only table, PK `(org_id, seq)`,
 * an fk `signer_key_id`, and RLS on `org_id` for tenant isolation).
 *
 * A store MUST enforce append-only semantics: entries are never updated or
 * deleted, and `(orgId, seq)` is unique.
 */
import type { LedgerEntry } from "./types.ts";

export interface LedgerStore {
  /** Append a sealed entry. Rejects if `(orgId, seq)` already exists. */
  append(entry: LedgerEntry): Promise<void>;
  /** The current head (highest-seq) entry for a tenant, or null if empty. */
  head(orgId: string): Promise<LedgerEntry | null>;
  /** All entries for a tenant, ascending by seq. */
  chain(orgId: string): Promise<LedgerEntry[]>;
  /** Look up a single entry by its content id (hash) within a tenant. */
  get(orgId: string, id: string): Promise<LedgerEntry | null>;
}

/** Reference in-memory store. Deterministic, dependency-free, good for tests. */
export class InMemoryLedgerStore implements LedgerStore {
  #chains = new Map<string, LedgerEntry[]>();

  async append(entry: LedgerEntry): Promise<void> {
    const chain = this.#chains.get(entry.orgId) ?? [];
    const expectedSeq = chain.length;
    if (entry.seq !== expectedSeq) {
      throw new Error(
        `append conflict for org ${entry.orgId}: expected seq ${expectedSeq}, got ${entry.seq}`,
      );
    }
    chain.push(entry);
    this.#chains.set(entry.orgId, chain);
  }

  async head(orgId: string): Promise<LedgerEntry | null> {
    const chain = this.#chains.get(orgId);
    return chain && chain.length > 0 ? chain[chain.length - 1]! : null;
  }

  async chain(orgId: string): Promise<LedgerEntry[]> {
    // Return a shallow copy so callers can't mutate internal state.
    return [...(this.#chains.get(orgId) ?? [])];
  }

  async get(orgId: string, id: string): Promise<LedgerEntry | null> {
    const chain = this.#chains.get(orgId);
    return chain?.find((e) => e.id === id) ?? null;
  }
}
