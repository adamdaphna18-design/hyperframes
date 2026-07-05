import { describe, expect, test } from "bun:test";
import { type Instruction, execute, validateProgram } from "../src/vm.js";
import {
  CONTRACT_DEPLOY_ACTION,
  CONTRACT_INVOKE_ACTION,
  ContractEngine,
  EMPTY_STATE_ROOT,
  contractIdOf,
  deployPayload,
  invokePayload,
  serializeProgram,
} from "../src/contract.js";
import { Ledger } from "../src/ledger.js";
import { agentKeyFromSecret } from "../src/zkp.js";
import { createTransaction } from "../src/transaction.js";

/**
 * Spending-cap policy: state.spent += ARG0, but only while spent + ARG0 ≤ cap.
 *
 *   0: LOAD spent      4: GT (new > cap?)      8: ADD
 *   1: ARG 0           5: JZ 8 (ok → commit)   9: STORE spent
 *   2: ADD             6: REJECT               10: PUSH 1
 *   3: PUSH cap        7: (unreachable)        11: HALT
 */
function spendingCap(cap: bigint): Instruction[] {
  return [
    { op: "LOAD", arg: "spent" },
    { op: "ARG", arg: "0" },
    { op: "ADD" },
    { op: "DUP" },
    { op: "PUSH", arg: cap.toString() },
    { op: "GT" },
    { op: "JZ", arg: "8" },
    { op: "REJECT" },
    { op: "STORE", arg: "spent" },
    { op: "PUSH", arg: "1" },
    { op: "HALT" },
  ];
}

describe("vm", () => {
  test("arithmetic and HALT accept", () => {
    const program: Instruction[] = [
      { op: "PUSH", arg: "6" },
      { op: "PUSH", arg: "7" },
      { op: "MUL" },
      { op: "PUSH", arg: "42" },
      { op: "EQ" },
      { op: "HALT" },
    ];
    const result = execute(program, new Map(), []);
    expect(result.accepted).toBe(true);
  });

  test("REJECT rejects and preserves state", () => {
    const state = new Map([["k", 9n]]);
    const program: Instruction[] = [
      { op: "PUSH", arg: "1" },
      { op: "STORE", arg: "k" },
      { op: "REJECT" },
    ];
    const result = execute(program, state, []);
    expect(result.accepted).toBe(false);
    expect(result.state.get("k")).toBe(9n);
  });

  test("infinite loop is stopped by gas", () => {
    const program: Instruction[] = [{ op: "JMP", arg: "0" }];
    const result = execute(program, new Map(), [], 100);
    expect(result.accepted).toBe(false);
    expect(result.error).toContain("out of gas");
  });

  test("stack underflow traps instead of throwing", () => {
    const result = execute([{ op: "ADD" }, { op: "HALT" }], new Map(), []);
    expect(result.accepted).toBe(false);
    expect(result.error).toContain("underflow");
  });

  test("missing invocation argument traps", () => {
    const result = execute([{ op: "ARG", arg: "3" }, { op: "HALT" }], new Map(), [1n]);
    expect(result.accepted).toBe(false);
  });

  test("validateProgram rejects bad jumps and empty programs", () => {
    expect(validateProgram([])).toBeDefined();
    expect(validateProgram([{ op: "JMP", arg: "99" }])).toBeDefined();
    expect(validateProgram(spendingCap(10n))).toBeUndefined();
  });
});

describe("contract engine", () => {
  test("deploy then invoke mutates state; root changes", () => {
    const engine = new ContractEngine();
    expect(engine.stateRoot()).toBe(EMPTY_STATE_ROOT);
    const program = spendingCap(1000n);
    const id = contractIdOf(serializeProgram(program));
    expect(
      engine.apply({ action: CONTRACT_DEPLOY_ACTION, payload: deployPayload(program) }).ok,
    ).toBe(true);
    const afterDeploy = engine.stateRoot();
    expect(afterDeploy).not.toBe(EMPTY_STATE_ROOT);
    expect(
      engine.apply({ action: CONTRACT_INVOKE_ACTION, payload: invokePayload(id, [250n]) }).ok,
    ).toBe(true);
    expect(engine.inspect(id)?.state.spent).toBe("250");
    expect(engine.stateRoot()).not.toBe(afterDeploy);
  });

  test("duplicate deploy and unknown contract are rejected", () => {
    const engine = new ContractEngine();
    const payload = deployPayload(spendingCap(5n));
    expect(engine.apply({ action: CONTRACT_DEPLOY_ACTION, payload }).ok).toBe(true);
    expect(engine.apply({ action: CONTRACT_DEPLOY_ACTION, payload }).ok).toBe(false);
    const bad = engine.apply({
      action: CONTRACT_INVOKE_ACTION,
      payload: invokePayload("0".repeat(64), [1n]),
    });
    expect(bad.ok).toBe(false);
  });

  test("malformed payloads are errors, not throws", () => {
    const engine = new ContractEngine();
    expect(engine.apply({ action: CONTRACT_DEPLOY_ACTION, payload: "not json" }).ok).toBe(false);
    expect(engine.apply({ action: CONTRACT_INVOKE_ACTION, payload: "{}" }).ok).toBe(false);
  });

  test("non-contract actions are no-ops", () => {
    const engine = new ContractEngine();
    expect(engine.apply({ action: "http.get", payload: "GET /" }).ok).toBe(true);
    expect(engine.stateRoot()).toBe(EMPTY_STATE_ROOT);
  });
});

describe("ledger + contracts", () => {
  const agent = agentKeyFromSecret(0xc0ffeen);
  const program = spendingCap(1000n);
  const contractId = contractIdOf(serializeProgram(program));
  let nonce = 0;

  function tx(action: string, payload: string) {
    nonce += 1;
    return createTransaction(agent, { action, payload, timestamp: nonce, nonce });
  }

  test("deploy + invoke seal into a validating chain with a live state root", () => {
    const ledger = new Ledger({ difficulty: 1 });
    ledger.record(tx(CONTRACT_DEPLOY_ACTION, deployPayload(program)));
    ledger.record(tx(CONTRACT_INVOKE_ACTION, invokePayload(contractId, [400n])));
    const block0 = ledger.sealPending(1);
    expect(block0.stateRoot).not.toBe(EMPTY_STATE_ROOT);

    // State persists across blocks.
    ledger.record(tx(CONTRACT_INVOKE_ACTION, invokePayload(contractId, [500n])));
    ledger.sealPending(2);
    expect(ledger.inspectContract(contractId)?.state.spent).toBe("900");
    expect(ledger.validate().valid).toBe(true);
  });

  test("policy rejection happens at record() ingress", () => {
    const ledger = new Ledger({ difficulty: 1 });
    ledger.record(tx(CONTRACT_DEPLOY_ACTION, deployPayload(program)));
    ledger.record(tx(CONTRACT_INVOKE_ACTION, invokePayload(contractId, [900n])));
    // 900 + 200 > 1000 → the contract rejects; the action never enters the mempool.
    expect(() =>
      ledger.record(tx(CONTRACT_INVOKE_ACTION, invokePayload(contractId, [200n]))),
    ).toThrow(/REJECT/i);
    expect(ledger.mempool.length).toBe(2);
    // A smaller spend still fits under the cap.
    ledger.record(tx(CONTRACT_INVOKE_ACTION, invokePayload(contractId, [100n])));
    ledger.sealPending(1);
    expect(ledger.validate().valid).toBe(true);
    expect(ledger.inspectContract(contractId)?.state.spent).toBe("1000");
  });

  test("tampering with sealed contract results is detected", () => {
    const ledger = new Ledger({ difficulty: 1 });
    ledger.record(tx(CONTRACT_DEPLOY_ACTION, deployPayload(program)));
    ledger.record(tx(CONTRACT_INVOKE_ACTION, invokePayload(contractId, [100n])));
    ledger.sealPending(1);

    // Forge the sealed invocation to claim a different amount was approved.
    const snapshot = ledger.snapshot();
    const victim = snapshot.blocks[0]!.transactions[1]!;
    snapshot.blocks[0]!.transactions[1] = {
      ...victim,
      payload: invokePayload(contractId, [999n]),
    };
    const forged = Ledger.restore(snapshot);
    const result = forged.validate();
    expect(result.valid).toBe(false);
    expect(result.brokenAtHeight).toBe(0);
  });

  test("snapshot/restore replays contract state correctly", () => {
    const ledger = new Ledger({ difficulty: 1 });
    ledger.record(tx(CONTRACT_DEPLOY_ACTION, deployPayload(program)));
    ledger.record(tx(CONTRACT_INVOKE_ACTION, invokePayload(contractId, [123n])));
    ledger.sealPending(1);
    const restored = Ledger.restore(JSON.parse(JSON.stringify(ledger.snapshot())));
    expect(restored.validate().valid).toBe(true);
    expect(restored.inspectContract(contractId)?.state.spent).toBe("123");
    // Policy still enforced after restore.
    expect(() =>
      restored.record(tx(CONTRACT_INVOKE_ACTION, invokePayload(contractId, [2000n]))),
    ).toThrow(/REJECT/i);
  });
});
