/**
 * ButterflyLedger — the tamper-evident action log.
 *
 * Each tenant gets an independent hash chain. Recording an action seals a new
 * entry: seq = head.seq + 1, prevHash = head.hash, hash = SHA-256 over the
 * canonical content, signature = Ed25519 over that hash. Outcomes are settled
 * as their own linked entries, never by editing history.
 *
 * `verify()` re-derives every hash, checks the prev-links, and validates every
 * signature — so any post-hoc edit, reorder, drop, or forgery is detectable by
 * anyone holding only the public keys.
 */
import { canonicalize } from "./canonical.ts";
import { GENESIS_PREV_HASH, sha256, type Keyring, type Signer } from "./crypto.ts";
import type { LedgerStore } from "./store.ts";
import type {
  ActionRecord,
  EntryPayload,
  LedgerEntry,
  SettlementRecord,
  VerifyResult,
} from "./types.ts";

export interface ButterflyLedgerOptions {
  store: LedgerStore;
  signer: Signer;
  /** Public keys for verification. Defaults to a keyring holding `signer`. */
  keyring: Keyring;
  /**
   * Clock. Injectable for deterministic tests. Defaults to `Date.now`. The
   * ledger is the one place a real timestamp is wanted, so this is not
   * defaulted to a seeded clock — but tests pin it.
   */
  now?: () => number;
}

/** A settled action paired with its outcome — the learning signal. */
export interface SettledAction {
  action: LedgerEntry;
  settlement: LedgerEntry;
  predicted: Record<string, unknown> | undefined;
  actual: Record<string, unknown>;
}

export class ButterflyLedger {
  #store: LedgerStore;
  #signer: Signer;
  #keyring: Keyring;
  #now: () => number;

  constructor(opts: ButterflyLedgerOptions) {
    this.#store = opts.store;
    this.#signer = opts.signer;
    this.#keyring = opts.keyring;
    this.#now = opts.now ?? (() => Date.now());
  }

  /** Seal a recommendation-turned-action into the tenant's chain. */
  async record(orgId: string, action: ActionRecord): Promise<LedgerEntry> {
    return this.#appendSealed(orgId, { kind: "action", data: action });
  }

  /**
   * Record the real-world outcome of a prior action as a linked entry. The
   * original entry is never touched — immutability is the whole point.
   */
  async settle(
    orgId: string,
    ref: string,
    actualOutcome: Record<string, unknown>,
    note?: string,
  ): Promise<LedgerEntry> {
    const target = await this.#store.get(orgId, ref);
    if (!target) {
      throw new Error(`cannot settle: no entry ${ref} for org ${orgId}`);
    }
    if (target.payload.kind !== "action") {
      throw new Error(`cannot settle: entry ${ref} is not an action`);
    }
    const settlement: SettlementRecord = { ref, actualOutcome, note };
    return this.#appendSealed(orgId, { kind: "settlement", data: settlement });
  }

  /** All entries for a tenant, ascending by seq. */
  chain(orgId: string): Promise<LedgerEntry[]> {
    return this.#store.chain(orgId);
  }

  /**
   * Walk the chain and prove it is untampered: correct seq order, intact
   * prev-links, re-derivable hashes, valid signatures, and settlements that
   * reference real actions.
   */
  async verify(orgId: string): Promise<VerifyResult> {
    const chain = await this.#store.chain(orgId);
    let expectedPrev = GENESIS_PREV_HASH;
    const seenActions = new Set<string>();

    for (let i = 0; i < chain.length; i++) {
      const e = chain[i]!;

      if (e.seq !== i) {
        return { valid: false, seq: i, reason: `seq gap: expected ${i}, got ${e.seq}` };
      }
      if (e.prevHash !== expectedPrev) {
        return { valid: false, seq: i, reason: "prevHash does not link to previous entry" };
      }

      const recomputed = this.#hashOf(e);
      if (recomputed !== e.hash) {
        return { valid: false, seq: i, reason: "content hash mismatch (entry was altered)" };
      }
      if (e.id !== e.hash) {
        return { valid: false, seq: i, reason: "id does not match hash" };
      }
      if (!this.#keyring.verify(e.signerKeyId, e.hash, e.signature)) {
        return { valid: false, seq: i, reason: "invalid or unknown signature" };
      }

      if (e.payload.kind === "action") {
        seenActions.add(e.id);
      } else {
        if (!seenActions.has(e.payload.data.ref)) {
          return { valid: false, seq: i, reason: "settlement references unknown action" };
        }
      }

      expectedPrev = e.hash;
    }

    return { valid: true, entries: chain.length };
  }

  /**
   * Pair every settled action with its outcome. `predicted` vs `actual` is the
   * dataset that trains the optimization policy in later roadmap phases.
   */
  async settledActions(orgId: string): Promise<SettledAction[]> {
    const chain = await this.#store.chain(orgId);
    const actions = new Map<string, LedgerEntry>();
    const out: SettledAction[] = [];

    for (const e of chain) {
      if (e.payload.kind === "action") {
        actions.set(e.id, e);
      } else {
        const action = actions.get(e.payload.data.ref);
        if (action && action.payload.kind === "action") {
          out.push({
            action,
            settlement: e,
            predicted: action.payload.data.predictedOutcome,
            actual: e.payload.data.actualOutcome,
          });
        }
      }
    }
    return out;
  }

  /** Compute the canonical content hash for an entry (excludes hash/id/sig). */
  #hashOf(e: LedgerEntry): string {
    return sha256(
      canonicalize({
        orgId: e.orgId,
        seq: e.seq,
        timestamp: e.timestamp,
        payload: e.payload,
        prevHash: e.prevHash,
      }),
    );
  }

  async #appendSealed(orgId: string, payload: EntryPayload): Promise<LedgerEntry> {
    const head = await this.#store.head(orgId);
    const seq = head ? head.seq + 1 : 0;
    const prevHash = head ? head.hash : GENESIS_PREV_HASH;
    const timestamp = this.#now();

    const hash = sha256(canonicalize({ orgId, seq, timestamp, payload, prevHash }));
    const signature = this.#signer.sign(hash);

    const entry: LedgerEntry = {
      id: hash,
      orgId,
      seq,
      timestamp,
      payload,
      prevHash,
      hash,
      signature,
      signerKeyId: this.#signer.keyId,
    };

    await this.#store.append(entry);
    return entry;
  }
}
