import { sha256Fields } from "./hash.js";

/**
 * Binary Merkle tree over the transactions in a block.
 *
 * The block header stores only the 32-byte root. That single hash commits to
 * every transaction in the block, so an inclusion proof lets anyone verify
 * "transaction T is in block B" against the root without downloading the whole
 * block — and any tamper to a leaf changes the root (the local seed of the
 * global butterfly cascade).
 */

/** One step of an inclusion proof: a sibling hash and which side it sits on. */
export interface MerkleStep {
  readonly siblingHash: string;
  readonly position: "left" | "right";
}

/** A proof that a specific leaf is committed to by `root`. */
export interface MerkleProof {
  readonly leafHash: string;
  readonly root: string;
  readonly steps: readonly MerkleStep[];
}

function hashLeaf(data: string): string {
  return sha256Fields("butterflyledger/merkle/leaf", [data]);
}

function hashNode(left: string, right: string): string {
  return sha256Fields("butterflyledger/merkle/node", [left, right]);
}

/** Hash of an empty transaction set — a fixed domain-separated constant. */
export const EMPTY_MERKLE_ROOT = sha256Fields("butterflyledger/merkle/empty", []);

/** Compute the Merkle root of a list of already-serialised leaves. */
export function merkleRoot(leaves: readonly string[]): string {
  if (leaves.length === 0) return EMPTY_MERKLE_ROOT;
  let level = leaves.map(hashLeaf);
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      // Odd node is promoted by duplication (standard Bitcoin-style padding).
      const right = i + 1 < level.length ? level[i + 1]! : left;
      next.push(hashNode(left, right));
    }
    level = next;
  }
  return level[0]!;
}

/** Build an inclusion proof for the leaf at `index`. */
export function merkleProof(leaves: readonly string[], index: number): MerkleProof {
  if (index < 0 || index >= leaves.length) {
    throw new RangeError(`leaf index ${index} out of range [0, ${leaves.length})`);
  }
  const leafHash = hashLeaf(leaves[index]!);
  const steps: MerkleStep[] = [];
  let level = leaves.map(hashLeaf);
  let idx = index;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = i + 1 < level.length ? level[i + 1]! : left;
      if (i === idx || i + 1 === idx) {
        if (idx === i) {
          steps.push({ siblingHash: right, position: "right" });
        } else {
          steps.push({ siblingHash: left, position: "left" });
        }
      }
      next.push(hashNode(left, right));
    }
    idx = Math.floor(idx / 2);
    level = next;
  }
  return { leafHash, root: level[0] ?? leafHash, steps };
}

/** Verify an inclusion proof by recomputing the root from the leaf upward. */
export function verifyMerkleProof(proof: MerkleProof): boolean {
  let acc = proof.leafHash;
  for (const step of proof.steps) {
    acc =
      step.position === "right" ? hashNode(acc, step.siblingHash) : hashNode(step.siblingHash, acc);
  }
  return acc === proof.root;
}
