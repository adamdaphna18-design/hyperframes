import { describe, expect, test } from "bun:test";
import { EMPTY_MERKLE_ROOT, merkleProof, merkleRoot, verifyMerkleProof } from "../src/merkle.js";

describe("Merkle tree", () => {
  test("empty set has the fixed empty root", () => {
    expect(merkleRoot([])).toBe(EMPTY_MERKLE_ROOT);
  });

  test("root is deterministic and order-sensitive", () => {
    expect(merkleRoot(["a", "b", "c"])).toBe(merkleRoot(["a", "b", "c"]));
    expect(merkleRoot(["a", "b", "c"])).not.toBe(merkleRoot(["c", "b", "a"]));
  });

  test.each([1, 2, 3, 4, 5, 8, 9])("inclusion proof verifies for every leaf (n=%i)", (n) => {
    const leaves = Array.from({ length: n }, (_, i) => `leaf-${i}`);
    const root = merkleRoot(leaves);
    for (let i = 0; i < n; i++) {
      const proof = merkleProof(leaves, i);
      expect(proof.root).toBe(root);
      expect(verifyMerkleProof(proof)).toBe(true);
    }
  });

  test("a proof with a corrupted sibling fails", () => {
    const leaves = ["a", "b", "c", "d"];
    const proof = merkleProof(leaves, 2);
    const broken = {
      ...proof,
      steps: proof.steps.map((s, i) => (i === 0 ? { ...s, siblingHash: "0".repeat(64) } : s)),
    };
    expect(verifyMerkleProof(broken)).toBe(false);
  });

  test("out-of-range index throws", () => {
    expect(() => merkleProof(["a"], 3)).toThrow();
  });
});
