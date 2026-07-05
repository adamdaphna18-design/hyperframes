import { describe, expect, test } from "bun:test";
import { Ledger } from "../src/ledger.js";
import { agentKeyFromSecret, verifyCommitment } from "../src/zkp.js";
import { ButterflyClient, agentKeyFromEnv, attestHash, canonicalJson } from "../src/sdk.js";
import { ButterflyCallbackHandler } from "../src/integrations/langchain.js";
import type { Instruction } from "../src/vm.js";

const KEY = agentKeyFromSecret(0x5d4an);

/** Spending-cap policy program (spent += ARG0 while ≤ cap). */
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

describe("canonicalJson / attestHash", () => {
  test("key order does not change the hash", () => {
    expect(attestHash({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(
      attestHash({ a: [2, { c: 4, d: 3 }], b: 1 }),
    );
  });

  test("different values produce different hashes", () => {
    expect(attestHash({ amount: 500 })).not.toBe(attestHash({ amount: 501 }));
  });

  test("primitives and null are stable", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson("x")).toBe('"x"');
    expect(canonicalJson(7)).toBe("7");
  });
});

describe("agentKeyFromEnv", () => {
  test("loads a key from the environment", () => {
    process.env.BFL_TEST_SECRET = "abc123";
    const key = agentKeyFromEnv("BFL_TEST_SECRET");
    expect(key.publicId).toBe(agentKeyFromSecret(0xabc123n).publicId);
    delete process.env.BFL_TEST_SECRET;
  });

  test("throws when unset", () => {
    expect(() => agentKeyFromEnv("BFL_MISSING_SECRET")).toThrow(/not set/);
  });
});

describe("ButterflyClient", () => {
  test("recordToolCall stores hashes on-chain, not raw payloads", () => {
    const ledger = new Ledger({ difficulty: 1 });
    const client = new ButterflyClient({ ledger, key: KEY });
    const { tx } = client.recordToolCall({
      tool: "http.get",
      input: { url: "https://api.example.com/secret-path" },
      output: { body: "top secret response" },
      status: "ok",
    });
    expect(tx.payload).not.toContain("secret-path");
    expect(tx.payload).not.toContain("top secret");
    expect(tx.payload).toContain(attestHash({ url: "https://api.example.com/secret-path" }));
    ledger.sealPending(1);
    expect(ledger.validate().valid).toBe(true);
  });

  test("confidential fields become Pedersen commitments with valid openings", () => {
    const ledger = new Ledger({ difficulty: 1 });
    const client = new ButterflyClient({ ledger, key: KEY });
    const { tx, openings } = client.recordToolCall({
      tool: "payment.charge",
      input: { vendor: "acme" },
      status: "ok",
      confidential: { amount: 499n },
    });
    const opening = openings.amount!;
    expect(tx.payload).toContain(opening.commitment);
    expect(tx.payload).not.toContain("499");
    expect(verifyCommitment(opening.commitment, 499n, opening.blinding)).toBe(true);
    expect(verifyCommitment(opening.commitment, 500n, opening.blinding)).toBe(false);
  });

  test("nonces resume across client instances (no replay collisions)", () => {
    const ledger = new Ledger({ difficulty: 1 });
    const a = new ButterflyClient({ ledger, key: KEY });
    a.recordToolCall({ tool: "t1", input: 1, status: "ok" });
    ledger.sealPending(1);
    a.recordToolCall({ tool: "t2", input: 2, status: "ok" });
    // A fresh client over the same ledger must continue, not collide.
    const b = new ButterflyClient({ ledger, key: KEY });
    b.recordToolCall({ tool: "t3", input: 3, status: "ok" });
    ledger.sealPending(2);
    expect(ledger.validate().valid).toBe(true);
  });

  test("wrapTool blocks policy-violating calls BEFORE the tool executes", async () => {
    const ledger = new Ledger({ difficulty: 1 });
    const client = new ButterflyClient({ ledger, key: KEY });
    const { id } = client.deployContract(spendingCap(800n));
    let executions = 0;
    const transfer = client.wrapTool(
      "transfer_funds",
      async (input: { amount: number }) => {
        executions++;
        return { ok: true, moved: input.amount };
      },
      { policy: { contractId: id, args: (input) => [BigInt(input.amount)] } },
    );

    await transfer({ amount: 500 });
    expect(executions).toBe(1);
    // 500 + 400 > 800 → the contract rejects and the tool never runs.
    await expect(transfer({ amount: 400 })).rejects.toThrow(/REJECT/i);
    expect(executions).toBe(1);
    await transfer({ amount: 300 });
    expect(executions).toBe(2);

    ledger.sealPending(1);
    expect(ledger.validate().valid).toBe(true);
    expect(ledger.inspectContract(id)?.state.spent).toBe("800");
  });

  test("wrapTool records tool failures before rethrowing", async () => {
    const ledger = new Ledger({ difficulty: 1 });
    const client = new ButterflyClient({ ledger, key: KEY });
    const broken = client.wrapTool("flaky", async () => {
      throw new Error("upstream 503");
    });
    await expect(broken(undefined)).rejects.toThrow("upstream 503");
    const recorded = ledger.mempool.find((tx) => tx.payload.includes('"status":"error"'));
    expect(recorded).toBeDefined();
  });
});

describe("ButterflyCallbackHandler (LangChain-shaped)", () => {
  test("tool start/end lifecycle records the call with parent linkage", async () => {
    const ledger = new Ledger({ difficulty: 1 });
    const client = new ButterflyClient({ ledger, key: KEY });
    const handler = new ButterflyCallbackHandler({ client });

    await handler.handleChainStart({ name: "finance_agent" }, { input: "pay vendor" }, "run-chain");
    await handler.handleToolStart({ name: "http_post" }, '{"url":"/pay"}', "run-1", "run-chain");
    await handler.handleToolEnd({ statusCode: 200 }, "run-1");
    ledger.sealPending(1);

    expect(ledger.validate().valid).toBe(true);
    const txs = ledger.chain[0]!.transactions;
    expect(txs.length).toBe(2); // chain scope + tool call
    const toolTx = txs[1]!;
    expect(toolTx.payload).toContain('"tool":"http_post"');
    expect(toolTx.payload).toContain(`"parent":"${txs[0]!.id}"`); // nested under the chain
  });

  test("policy enforcement at handleToolStart blocks the call", async () => {
    const ledger = new Ledger({ difficulty: 1 });
    const client = new ButterflyClient({ ledger, key: KEY });
    const { id } = client.deployContract(spendingCap(100n));
    const handler = new ButterflyCallbackHandler({
      client,
      policies: { transfer_funds: { contractId: id, args: (input) => [BigInt(input)] } },
    });

    await handler.handleToolStart({ name: "transfer_funds" }, "60", "run-a");
    await handler.handleToolEnd({ ok: true }, "run-a");
    // 60 + 60 > 100 → rejected before the tool would run.
    await expect(
      handler.handleToolStart({ name: "transfer_funds" }, "60", "run-b"),
    ).rejects.toThrow(/REJECT/i);
    ledger.sealPending(1);
    expect(ledger.validate().valid).toBe(true);
    expect(ledger.inspectContract(id)?.state.spent).toBe("60");
  });

  test("tool errors are recorded as error-status transactions", async () => {
    const ledger = new Ledger({ difficulty: 1 });
    const client = new ButterflyClient({ ledger, key: KEY });
    const handler = new ButterflyCallbackHandler({ client });
    await handler.handleToolStart({ name: "search" }, "query", "run-x");
    await handler.handleToolError(new Error("timeout"), "run-x");
    expect(ledger.mempool.some((tx) => tx.payload.includes('"status":"error"'))).toBe(true);
  });
});
