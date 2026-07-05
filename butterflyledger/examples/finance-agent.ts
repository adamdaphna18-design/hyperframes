/**
 * Design-partner demo: a finance agent whose spending is governed, recorded,
 * and provable — end to end in ~60 seconds.
 *
 *   bun run examples/finance-agent.ts
 *
 * What it shows:
 *   1. A spending-cap policy contract deployed on-chain.
 *   2. An agent tool (`transfer_funds`) wrapped by the SDK — every call is
 *      policy-checked BEFORE execution and recorded with a ZK authorship proof.
 *   3. A violating transfer blocked at the policy layer (the tool never runs).
 *   4. Confidential amounts hidden behind Pedersen commitments.
 *   5. The sealed, validated audit trail — and what happens to it under tamper.
 */
import { Ledger } from "../src/ledger.js";
import { agentKeyFromSecret } from "../src/zkp.js";
import { ButterflyClient } from "../src/sdk.js";
import type { Instruction } from "../src/vm.js";

const DAILY_CAP = 1_000n;

// Policy: spent += amount, only while spent + amount ≤ DAILY_CAP.
const capPolicy: Instruction[] = [
  { op: "LOAD", arg: "spent" },
  { op: "ARG", arg: "0" },
  { op: "ADD" },
  { op: "DUP" },
  { op: "PUSH", arg: DAILY_CAP.toString() },
  { op: "GT" },
  { op: "JZ", arg: "8" },
  { op: "REJECT" },
  { op: "STORE", arg: "spent" },
  { op: "PUSH", arg: "1" },
  { op: "HALT" },
];

const ledger = new Ledger({ difficulty: 2 });
const client = new ButterflyClient({
  ledger,
  key: agentKeyFromSecret(0xf14a4cen), // in production: agentKeyFromEnv("AGENT_SECRET")
});

console.log("\n— ButterflyLedger finance-agent demo —\n");

// 1. Governance: put the spending cap on-chain.
const { id: capId } = client.deployContract(capPolicy);
console.log(`policy contract deployed: ${capId.slice(0, 20)}… (daily cap ${DAILY_CAP})`);

// 2. The agent's tool, wrapped: policy-checked before execution, recorded after.
let bankCalls = 0;
const transferFunds = client.wrapTool(
  "transfer_funds",
  async (input: { vendor: string; amount: number }) => {
    bankCalls++; // stands in for the real banking API call
    return { status: "sent", vendor: input.vendor, amount: input.amount };
  },
  { policy: { contractId: capId, args: (input) => [BigInt(input.amount)] } },
);

// 3. Normal operation.
await transferFunds({ vendor: "acme-cloud", amount: 600 });
console.log(`transfer 600 → acme-cloud   OK   (bank API calls: ${bankCalls})`);

// 4. The violation: 600 + 700 > 1000. Blocked BEFORE the tool executes.
try {
  await transferFunds({ vendor: "unknown-llc", amount: 700 });
} catch {
  console.log(
    `transfer 700 → unknown-llc  BLOCKED by on-chain policy (bank API calls: ${bankCalls})`,
  );
}

// 5. Back under the cap.
await transferFunds({ vendor: "acme-cloud", amount: 300 });
console.log(`transfer 300 → acme-cloud   OK   (bank API calls: ${bankCalls})`);

// 6. A confidential action: the amount never appears on-chain.
const { openings } = client.recordToolCall({
  tool: "payroll.run",
  input: { period: "2026-07" },
  status: "ok",
  confidential: { total: 84_250n },
});
console.log(`payroll recorded; total committed as ${openings.total!.commitment.slice(0, 20)}…`);

// 7. Seal and validate.
const block = ledger.sealPending(1);
console.log(`\nsealed block #${block.height}  stateRoot=${block.stateRoot.slice(0, 20)}…`);
console.log(
  `policy state on-chain: spent=${ledger.inspectContract(capId)?.state.spent}/${DAILY_CAP}`,
);
console.log(`chain valid: ${JSON.stringify(ledger.validate().valid)}`);

// 8. The insurer's question: "can the operator quietly rewrite this?"
// (Note: raw amounts never appear on-chain — inputs are hashed — so the
// forgery below has to attack the record itself: it swaps the sealed input
// hash of the 600-transfer, i.e. "the agent was asked to do something else".)
const snapshot = ledger.snapshot();
const target = snapshot.blocks[0]!;
snapshot.blocks[0] = {
  ...target,
  transactions: target.transactions.map((t, i) =>
    i === 2
      ? { ...t, payload: t.payload.replace(/"sha256":"[0-9a-f]{8}/, '"sha256":"00000000') }
      : t,
  ),
};
const forged = Ledger.restore(snapshot);
console.log(`\ntamper attempt (rewrite a sealed record): ${JSON.stringify(forged.validate())}`);
console.log(
  "\nEvery action above carries a zero-knowledge authorship proof. The record is complete,",
);
console.log(
  "the policy was enforced before execution, and history cannot be silently rewritten.\n",
);
