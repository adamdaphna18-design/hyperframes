/**
 * ButterflyLedger walkthrough. Run: `bun run demo.ts`
 *
 * Shows the full lifecycle: seal an agent action, settle its real outcome,
 * verify the chain, expose the predicted-vs-actual learning signal, then prove
 * that a silent edit to history is caught.
 */
import {
  ButterflyLedger,
  Ed25519Signer,
  InMemoryLedgerStore,
  Keyring,
  type ActionRecord,
} from "./src/index.ts";

const signer = Ed25519Signer.generate("agent-signer-v1");
const keyring = new Keyring().addSigner(signer);
const store = new InMemoryLedgerStore();
const ledger = new ButterflyLedger({ store, signer, keyring });

const org = "org_acme";

const action: ActionRecord = {
  trigger: "anomaly:roas concept_88 -22% over 72h",
  recommendation:
    "ROAS on concept_88 dropped 3.2 → 2.5. Cut ad set A budget 10% and rotate creative to angle_12.",
  decision: { by: "user_7", mode: "copilot", rationale: "approved in review" },
  action: "decrease_budget",
  params: { adSetId: "as_1", pct: -10 },
  predictedOutcome: { roas: 3.1 },
  lineage: { conceptId: "concept_88", angleId: "angle_12", icpId: "icp_dtc_owner" },
};

const sealed = await ledger.record(org, action);
console.log("1) sealed action  seq=%d hash=%s…", sealed.seq, sealed.hash.slice(0, 12));

const settlement = await ledger.settle(org, sealed.id, { roas: 3.25 }, "measured 72h");
console.log("2) settled outcome seq=%d ref=%s…", settlement.seq, sealed.id.slice(0, 12));

console.log("3) verify chain   ", await ledger.verify(org));

const learning = await ledger.settledActions(org);
console.log("4) learning signal", {
  action:
    learning[0]!.action.payload.kind === "action"
      ? (learning[0]!.action.payload.data as ActionRecord).action
      : "",
  predicted: learning[0]!.predicted,
  actual: learning[0]!.actual,
});

// --- Tamper test: rewrite the approved budget change after the fact ---
const chain = await ledger.chain(org);
const tampered = structuredClone(chain);
(tampered[0]!.payload.data as ActionRecord).params = { adSetId: "as_1", pct: -95 };
const tamperedStore = new InMemoryLedgerStore();
for (const e of tampered) await tamperedStore.append(e);
const auditor = new ButterflyLedger({ store: tamperedStore, signer, keyring });
console.log("5) tampered chain ", await auditor.verify(org), "← silent edit caught");
