import { describe, expect, test } from "bun:test";
import { Ledger } from "../src/ledger.js";
import { agentKeyFromSecret } from "../src/zkp.js";
import { createTransaction, verifyTransaction } from "../src/transaction.js";
import { headerDigest, meetsDifficulty } from "../src/block.js";

const agent = agentKeyFromSecret(0xa11cen);

function tx(action: string, payload: string, nonce: number) {
  return createTransaction(agent, { action, payload, timestamp: nonce + 1, nonce });
}

function build(): Ledger {
  const ledger = new Ledger({ difficulty: 1 });
  ledger.record(tx("plan.create", "do the thing", 0));
  ledger.record(tx("http.get", "GET /status", 1));
  ledger.sealPending(100);
  ledger.record(tx("file.write", "wrote report.md", 2));
  ledger.sealPending(200);
  return ledger;
}

describe("transaction", () => {
  test("round-trips and verifies", () => {
    const t = tx("noop", "x", 0);
    expect(verifyTransaction(t)).toBe(true);
  });

  test("mutating any field breaks verification", () => {
    const t = tx("noop", "x", 0);
    expect(verifyTransaction({ ...t, payload: "y" })).toBe(false);
    expect(verifyTransaction({ ...t, action: "evil" })).toBe(false);
    expect(verifyTransaction({ ...t, id: "0".repeat(64) })).toBe(false);
  });
});

describe("block sealing", () => {
  test("sealed block meets its proof-of-work difficulty", () => {
    const ledger = new Ledger({ difficulty: 2 });
    ledger.record(tx("a", "b", 0));
    const block = ledger.sealPending(1);
    expect(meetsDifficulty(block.hash, 2)).toBe(true);
    expect(headerDigest(block)).toBe(block.hash);
  });
});

describe("ledger", () => {
  test("valid chain validates", () => {
    const ledger = build();
    expect(ledger.height).toBe(2);
    expect(ledger.validate().valid).toBe(true);
  });

  test("blocks link by previousHash", () => {
    const ledger = build();
    expect(ledger.chain[1]!.previousHash).toBe(ledger.chain[0]!.hash);
  });

  test("recording an unverifiable transaction is refused", () => {
    const ledger = new Ledger({ difficulty: 1 });
    const good = tx("a", "b", 0);
    expect(() => ledger.record({ ...good, payload: "forged" })).toThrow();
  });

  test("forging a sealed transaction is detected as a cascade", () => {
    const ledger = build();
    const snapshot = ledger.snapshot();
    const victim = snapshot.blocks[0]!.transactions[0]!;
    snapshot.blocks[0]!.transactions[0] = { ...victim, payload: "TAMPERED" };
    const forged = Ledger.restore(snapshot);
    const result = forged.validate();
    expect(result.valid).toBe(false);
    expect(result.brokenAtHeight).toBe(0);
  });

  test("re-linking a block to a wrong parent is detected", () => {
    const ledger = build();
    const snapshot = ledger.snapshot();
    snapshot.blocks[1] = { ...snapshot.blocks[1]!, previousHash: "0".repeat(64) };
    const forged = Ledger.restore(snapshot);
    const result = forged.validate();
    expect(result.valid).toBe(false);
    expect(result.brokenAtHeight).toBe(1);
  });

  test("inclusion proof verifies for a real tx and reports the block", () => {
    const ledger = build();
    const target = ledger.chain[0]!.transactions[1]!;
    const { proof } = ledger.proveInclusion(target.id);
    expect(ledger.verifyInclusion(0, proof)).toBe(true);
    expect(ledger.verifyInclusion(1, proof)).toBe(false);
  });

  test("snapshot/restore round-trips", () => {
    const ledger = build();
    const restored = Ledger.restore(JSON.parse(JSON.stringify(ledger.snapshot())));
    expect(restored.validate().valid).toBe(true);
    expect(restored.height).toBe(ledger.height);
  });
});
