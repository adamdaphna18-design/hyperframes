import { sha256Fields } from "./hash.js";
import { butterflySignature } from "./butterfly.js";
import { EMPTY_STATE_ROOT } from "./contract.js";
import { type Transaction, serializeBody } from "./transaction.js";
import { merkleRoot } from "./merkle.js";

/**
 * A block bundles a batch of agent-action transactions and chains to its
 * predecessor by hash. The header commits to:
 *   • the previous block hash (the chain link / chaotic initial condition),
 *   • the Merkle root of its transactions (tamper-evidence per action),
 *   • a proof-of-work nonce (cost to rewrite history),
 *   • the butterfly signature derived from the sealed hash.
 */

export interface BlockHeader {
  readonly height: number;
  readonly previousHash: string;
  readonly merkleRoot: string;
  /** Commitment to all contract programs + state after this block (contract.ts). */
  readonly stateRoot: string;
  readonly timestamp: number;
  /** Proof-of-work nonce found during sealing. */
  readonly nonce: number;
  /** Number of leading hex zeros the block hash must have. */
  readonly difficulty: number;
}

export interface Block extends BlockHeader {
  readonly transactions: readonly Transaction[];
  /** SHA-256 of the header — the chain link and next block's seed. */
  readonly hash: string;
  /** Chaotic fingerprint derived from `hash` (see butterfly.ts). */
  readonly butterfly: string;
}

/** Serialise the header (excluding the pow nonce) for a given nonce candidate. */
export function headerDigest(header: BlockHeader): string {
  return sha256Fields("butterflyledger/block/v1", [
    header.height,
    header.previousHash,
    header.merkleRoot,
    header.stateRoot,
    header.timestamp,
    header.difficulty,
    header.nonce,
  ]);
}

/** The Merkle root of a block's transactions (over their canonical bodies). */
export function transactionsRoot(transactions: readonly Transaction[]): string {
  return merkleRoot(
    transactions.map((tx) =>
      serializeBody({
        agentId: tx.agentId,
        action: tx.action,
        payload: tx.payload,
        timestamp: tx.timestamp,
        nonce: tx.nonce,
      }),
    ),
  );
}

/** True iff `hash` has at least `difficulty` leading zero hex characters. */
export function meetsDifficulty(hash: string, difficulty: number): boolean {
  for (let i = 0; i < difficulty; i++) {
    if (hash[i] !== "0") return false;
  }
  return true;
}

export interface SealOptions {
  readonly height: number;
  readonly previousHash: string;
  readonly timestamp: number;
  readonly difficulty: number;
  /** Contract state root after this block; defaults to the empty-state commitment. */
  readonly stateRoot?: string;
  /** Safety cap on pow iterations; throws if exceeded. */
  readonly maxNonce?: number;
}

/**
 * Seal a block: grind the proof-of-work nonce until the header hash meets the
 * difficulty target, then derive the butterfly signature. Proof-of-work is
 * what makes the butterfly cascade *costly* to repair — an attacker who edits
 * one historical transaction must re-mine every block after it.
 */
export function sealBlock(transactions: readonly Transaction[], opts: SealOptions): Block {
  const merkleRootHash = transactionsRoot(transactions);
  const stateRoot = opts.stateRoot ?? EMPTY_STATE_ROOT;
  const maxNonce = opts.maxNonce ?? 5_000_000;
  for (let nonce = 0; nonce <= maxNonce; nonce++) {
    const header: BlockHeader = {
      height: opts.height,
      previousHash: opts.previousHash,
      merkleRoot: merkleRootHash,
      stateRoot,
      timestamp: opts.timestamp,
      nonce,
      difficulty: opts.difficulty,
    };
    const hash = headerDigest(header);
    if (meetsDifficulty(hash, opts.difficulty)) {
      return { ...header, transactions, hash, butterfly: butterflySignature(hash) };
    }
  }
  throw new Error(
    `proof-of-work exhausted after ${maxNonce} nonces at difficulty ${opts.difficulty}`,
  );
}

/** Recompute a block's hash and butterfly signature and check they are internally consistent. */
export function verifyBlockSelf(block: Block): boolean {
  if (transactionsRoot(block.transactions) !== block.merkleRoot) return false;
  const hash = headerDigest(block);
  if (hash !== block.hash) return false;
  if (!meetsDifficulty(hash, block.difficulty)) return false;
  return butterflySignature(hash) === block.butterfly;
}
