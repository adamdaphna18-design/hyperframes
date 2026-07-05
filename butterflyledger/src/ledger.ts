import { type Block, sealBlock, verifyBlockSelf } from "./block.js";
import { ContractEngine } from "./contract.js";
import { type MerkleProof, merkleProof, verifyMerkleProof } from "./merkle.js";
import { type Transaction, serializeBody, verifyTransaction } from "./transaction.js";

/** Fixed hash used as the parent of the genesis block. */
export const GENESIS_PARENT = "0".repeat(64);

export interface LedgerOptions {
  /** Leading-zero difficulty for sealed blocks. Keep small for tests. */
  readonly difficulty?: number;
}

/** Result of a full-chain validation pass. */
export interface ValidationResult {
  readonly valid: boolean;
  /** Height of the first invalid block, or -1 if the chain is valid. */
  readonly brokenAtHeight: number;
  readonly reason: string;
}

/**
 * ButterflyLedger — an append-only, hash-chained ledger of AI-agent actions.
 *
 * Pending transactions accumulate in a mempool; `sealPending()` mines them into
 * a block that links to the current tip. Because every block's hash feeds the
 * next block's header, the chain is a discrete chaotic trajectory: altering any
 * historical byte triggers the butterfly cascade that `validate()` detects.
 */
export class Ledger {
  private readonly blocks: Block[] = [];
  private readonly pending: Transaction[] = [];
  private readonly difficulty: number;
  /** Contract state as of the sealed chain tip. */
  private engine = new ContractEngine();
  /** Contract state as of tip + mempool (speculative, for ingress policy checks). */
  private speculative = new ContractEngine();

  constructor(options: LedgerOptions = {}) {
    this.difficulty = options.difficulty ?? 2;
  }

  /** Number of sealed blocks. */
  get height(): number {
    return this.blocks.length;
  }

  /** Hash of the current chain tip (or the genesis parent if empty). */
  get tipHash(): string {
    return this.blocks.length === 0 ? GENESIS_PARENT : this.blocks[this.blocks.length - 1]!.hash;
  }

  /** Immutable view of the sealed chain. */
  get chain(): readonly Block[] {
    return this.blocks;
  }

  /**
   * Queue a verified transaction for inclusion in the next block.
   *
   * Replay protection: a transaction id commits to `(agentId, nonce)` inside
   * the signed body, so re-submitting a sealed or pending action verbatim is
   * rejected here at ingress. (A *modified* replay is a new body and therefore
   * needs a fresh proof only the key holder can produce.)
   */
  record(tx: Transaction): void {
    if (!verifyTransaction(tx)) {
      throw new Error(`refusing to record transaction ${tx.id}: invalid authorship proof`);
    }
    if (this.pending.some((p) => p.id === tx.id) || this.locate(tx.id) !== undefined) {
      throw new Error(`refusing to record transaction ${tx.id}: duplicate (replay rejected)`);
    }
    // Smart-contract policy enforcement at ingress: deploys and invokes run
    // against the speculative state; a rejected action never enters the mempool.
    const result = this.speculative.apply(tx);
    if (!result.ok) {
      throw new Error(`refusing to record transaction ${tx.id}: ${result.error}`);
    }
    this.pending.push(tx);
  }

  /** Transactions waiting to be sealed. */
  get mempool(): readonly Transaction[] {
    return this.pending;
  }

  /**
   * Seal all pending transactions into a new block on top of the tip.
   * `timestamp` is supplied by the caller to keep sealing deterministic.
   */
  sealPending(timestamp: number): Block {
    if (this.pending.length === 0) throw new Error("nothing to seal: mempool is empty");
    // Snapshot the mempool: the block must own its own array, since we clear
    // `this.pending` immediately below.
    const batch = [...this.pending];
    // Advance the sealed contract state by the batch. Every transaction already
    // executed successfully against the speculative engine at ingress, and the
    // VM is deterministic, so this replay cannot fail.
    for (const tx of batch) {
      const result = this.engine.apply(tx);
      if (!result.ok) {
        throw new Error(`contract state divergence while sealing ${tx.id}: ${result.error}`);
      }
    }
    const block = sealBlock(batch, {
      height: this.blocks.length,
      previousHash: this.tipHash,
      timestamp,
      difficulty: this.difficulty,
      stateRoot: this.engine.stateRoot(),
    });
    this.blocks.push(block);
    this.pending.length = 0;
    this.speculative = this.engine.clone();
    return block;
  }

  /**
   * Validate the whole chain: each block must be internally consistent, carry a
   * valid proof-of-work, link to its predecessor, and every transaction's
   * zero-knowledge proof must verify. Returns the first point of failure — the
   * epicentre of any butterfly cascade.
   */
  validate(): ValidationResult {
    let previousHash = GENESIS_PARENT;
    // Contract execution is part of consensus: re-run every deploy/invoke from
    // genesis and require each block's sealed state root to be reproducible.
    const replay = new ContractEngine();
    for (let h = 0; h < this.blocks.length; h++) {
      const block = this.blocks[h]!;
      if (block.height !== h) {
        return fail(h, `height mismatch: expected ${h}, got ${block.height}`);
      }
      if (block.previousHash !== previousHash) {
        return fail(h, "broken chain link: previousHash does not match prior block");
      }
      if (!verifyBlockSelf(block)) {
        return fail(h, "block hash / merkle root / butterfly signature inconsistent");
      }
      for (const tx of block.transactions) {
        if (!verifyTransaction(tx)) {
          return fail(h, `transaction ${tx.id} has an invalid authorship proof`);
        }
        const applied = replay.apply(tx);
        if (!applied.ok) {
          return fail(h, `contract execution failed for ${tx.id}: ${applied.error}`);
        }
      }
      if (replay.stateRoot() !== block.stateRoot) {
        return fail(h, "contract state root mismatch: sealed state is not reproducible");
      }
      previousHash = block.hash;
    }
    return { valid: true, brokenAtHeight: -1, reason: "chain is valid" };
  }

  /** Locate a transaction by id, returning its block height and index. */
  locate(txId: string): { height: number; index: number } | undefined {
    for (let h = 0; h < this.blocks.length; h++) {
      const index = this.blocks[h]!.transactions.findIndex((tx) => tx.id === txId);
      if (index >= 0) return { height: h, index };
    }
    return undefined;
  }

  /**
   * Produce a Merkle inclusion proof that `txId` is committed to by its block's
   * root — proof of an action's presence without shipping the whole block.
   */
  proveInclusion(txId: string): { blockHash: string; proof: MerkleProof } {
    const at = this.locate(txId);
    if (!at) throw new Error(`transaction ${txId} not found in ledger`);
    const block = this.blocks[at.height]!;
    const leaves = block.transactions.map((tx) =>
      serializeBody({
        agentId: tx.agentId,
        action: tx.action,
        payload: tx.payload,
        timestamp: tx.timestamp,
        nonce: tx.nonce,
      }),
    );
    return { blockHash: block.hash, proof: merkleProof(leaves, at.index) };
  }

  /** Verify an inclusion proof against the block's stored Merkle root. */
  verifyInclusion(blockHeight: number, proof: MerkleProof): boolean {
    const block = this.blocks[blockHeight];
    if (!block) return false;
    return proof.root === block.merkleRoot && verifyMerkleProof(proof);
  }

  /** Serialise the sealed chain to JSON. */
  toJSON(): string {
    return JSON.stringify(this.blocks, null, 2);
  }

  /** Capture the full ledger state (chain + mempool + config) for persistence. */
  snapshot(): LedgerSnapshot {
    return {
      difficulty: this.difficulty,
      blocks: [...this.blocks],
      pending: [...this.pending],
    };
  }

  /**
   * Rehydrate a ledger from a previously captured snapshot. Contract state is
   * not stored — it is re-derived by replaying the chain, which is exactly the
   * property `validate()` checks. Replay errors are tolerated here (a tampered
   * snapshot must still be restorable so validation can report the damage).
   */
  static restore(snapshot: LedgerSnapshot): Ledger {
    const ledger = new Ledger({ difficulty: snapshot.difficulty });
    ledger.blocks.push(...snapshot.blocks);
    for (const block of snapshot.blocks) {
      for (const tx of block.transactions) ledger.engine.apply(tx);
    }
    ledger.speculative = ledger.engine.clone();
    for (const tx of snapshot.pending) {
      ledger.speculative.apply(tx);
      ledger.pending.push(tx);
    }
    return ledger;
  }

  /** Ids of all deployed contracts, as seen from tip + mempool. */
  listContracts(): string[] {
    return this.speculative.list();
  }

  /** Current state of a deployed contract (tip + mempool view). */
  inspectContract(id: string): { id: string; state: Record<string, string> } | undefined {
    return this.speculative.inspect(id);
  }
}

/** Serialisable ledger state produced by {@link Ledger.snapshot}. */
export interface LedgerSnapshot {
  readonly difficulty: number;
  readonly blocks: Block[];
  readonly pending: Transaction[];
}

function fail(height: number, reason: string): ValidationResult {
  return { valid: false, brokenAtHeight: height, reason };
}
