/**
 * End-to-end ButterflyLedger walkthrough.
 *
 * Run with:  bun run src/demo.ts   (or  npm run demo)
 *
 * Simulates an AI agent taking a sequence of actions, records each one with a
 * zero-knowledge authorship proof, seals them into blocks, proves inclusion,
 * and finally shows the butterfly cascade when history is forged.
 */
import { Ledger } from "./ledger.js";
import { agentKeyFromSecret, commit, verifyCommitment } from "./zkp.js";
import { createTransaction } from "./transaction.js";
import { measureDivergence, seedFromHash } from "./butterfly.js";

function rule(title: string): void {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

// Two AI agents with fixed secrets (deterministic demo).
const planner = agentKeyFromSecret(0x5eed_0001n);
const executor = agentKeyFromSecret(0x5eed_0002n);

const ledger = new Ledger({ difficulty: 2 });

rule("1. Agents record actions (each carries a zero-knowledge authorship proof)");
ledger.record(
  createTransaction(planner, {
    action: "plan.create",
    payload: "book flight NYC→SFO",
    timestamp: 1,
    nonce: 0,
  }),
);
ledger.record(
  createTransaction(executor, {
    action: "http.post",
    payload: "POST /api/flights/search",
    timestamp: 2,
    nonce: 0,
  }),
);

// Confidential action: hide the amount behind a Pedersen commitment.
const price = commit(499n);
const confidential = createTransaction(executor, {
  action: "payment.charge",
  payload: price.commitment,
  timestamp: 3,
  nonce: 1,
});
ledger.record(confidential);
console.log(`  recorded 3 actions; payment amount is committed, not revealed`);
console.log(
  `  commitment opens correctly: ${verifyCommitment(price.commitment, price.value, price.blinding)}`,
);

const block0 = ledger.sealPending(10);
console.log(`  sealed block #0  hash=${block0.hash.slice(0, 20)}…  pow-nonce=${block0.nonce}`);

rule("2. More actions in a second block");
ledger.record(
  createTransaction(planner, {
    action: "plan.revise",
    payload: "add hotel booking",
    timestamp: 4,
    nonce: 1,
  }),
);
const block1 = ledger.sealPending(20);
console.log(`  sealed block #1  hash=${block1.hash.slice(0, 20)}…  links to #0`);

rule("3. Prove a specific action is on-chain (Merkle inclusion)");
const { proof } = ledger.proveInclusion(confidential.id);
console.log(`  action ${confidential.id.slice(0, 16)}… proof steps=${proof.steps.length}`);
console.log(`  inclusion verified: ${ledger.verifyInclusion(0, proof)}`);

rule("4. Validate the whole chain");
console.log(`  ${JSON.stringify(ledger.validate())}`);

rule("5. The butterfly effect — forge one historical byte");
const snapshot = ledger.snapshot();
const victim = snapshot.blocks[0]!.transactions[0]!;
snapshot.blocks[0]!.transactions[0] = { ...victim, payload: "book flight NYC→LAX" };
const forged = Ledger.restore(snapshot);
console.log(`  changed one payload in block #0 …`);
console.log(`  ${JSON.stringify(forged.validate())}`);

rule("6. Quantify the chaos (why one byte cascades)");
const report = measureDivergence(seedFromHash(block0.hash));
console.log(
  `  separation after ${report.separationStep} iterations, ` +
    `Lyapunov≈${report.lyapunovEstimate.toFixed(3)} (positive ⇒ chaotic / butterfly effect)`,
);

console.log(
  "\n\x1b[32mdone.\x1b[0m ButterflyLedger recorded, proved, and defended a chain of AI actions.",
);
