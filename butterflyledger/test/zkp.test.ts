import { describe, expect, test } from "bun:test";
import {
  agentKeyFromSecret,
  commit,
  generateAgentKey,
  proveAuthorship,
  verifyAuthorship,
  verifyCommitment,
} from "../src/zkp.js";
import { G, H, P, modPow } from "../src/group.js";

describe("group parameters", () => {
  test("generator and second base live in the prime-order subgroup", () => {
    // Elements of the order-q subgroup are quadratic residues: x^q ≡ 1 mod p.
    const q = (P - 1n) / 2n;
    expect(modPow(G, q, P)).toBe(1n);
    expect(modPow(H, q, P)).toBe(1n);
  });
});

describe("Schnorr NIZK authorship proof", () => {
  test("valid proof verifies", () => {
    const key = agentKeyFromSecret(1234567n);
    const proof = proveAuthorship(key, "action-42");
    expect(verifyAuthorship(key.publicId, "action-42", proof)).toBe(true);
  });

  test("proof does not verify for a different message (binding)", () => {
    const key = generateAgentKey();
    const proof = proveAuthorship(key, "action-A");
    expect(verifyAuthorship(key.publicId, "action-B", proof)).toBe(false);
  });

  test("proof does not verify for a different agent (soundness)", () => {
    const alice = agentKeyFromSecret(111n);
    const mallory = agentKeyFromSecret(222n);
    const proof = proveAuthorship(alice, "msg");
    expect(verifyAuthorship(mallory.publicId, "msg", proof)).toBe(false);
  });

  test("a forged proof without the secret fails", () => {
    const key = agentKeyFromSecret(999n);
    const real = proveAuthorship(key, "msg");
    const forged = { commitment: real.commitment, response: "deadbeef" };
    expect(verifyAuthorship(key.publicId, "msg", forged)).toBe(false);
  });

  test("malformed proof fields are rejected, not thrown", () => {
    const key = agentKeyFromSecret(7n);
    expect(verifyAuthorship(key.publicId, "m", { commitment: "zzz", response: "1" })).toBe(false);
    expect(verifyAuthorship("nothex", "m", { commitment: "1", response: "1" })).toBe(false);
  });
});

describe("Pedersen commitment", () => {
  test("commitment opens with the right value and blinding", () => {
    const c = commit(1000n);
    expect(verifyCommitment(c.commitment, c.value, c.blinding)).toBe(true);
  });

  test("commitment does not open to a different value", () => {
    const c = commit(1000n);
    expect(verifyCommitment(c.commitment, 1001n, c.blinding)).toBe(false);
  });

  test("two commitments to the same value differ (hiding)", () => {
    const a = commit(42n);
    const b = commit(42n);
    expect(a.commitment).not.toBe(b.commitment);
  });
});
