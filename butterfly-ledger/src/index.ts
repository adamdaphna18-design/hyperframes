/**
 * ButterflyLedger — tamper-evident, hash-chained, signed action log for the
 * AI-agent layer of the Performance Marketing OS.
 *
 * @example
 * ```ts
 * import { ButterflyLedger, Ed25519Signer, Keyring, InMemoryLedgerStore } from "butterfly-ledger";
 *
 * const signer = Ed25519Signer.generate("agent-signer-v1");
 * const keyring = new Keyring().addSigner(signer);
 * const ledger = new ButterflyLedger({ store: new InMemoryLedgerStore(), signer, keyring });
 *
 * const entry = await ledger.record("org_123", {
 *   trigger: "roas_drop:concept_88 fell 22% over 72h",
 *   recommendation: "Cut budget on ad set A by 10% and rotate to angle_12.",
 *   decision: { by: "user_7", mode: "copilot", rationale: "approved after review" },
 *   action: "decrease_budget",
 *   params: { adSetId: "as_1", pct: -10 },
 *   predictedOutcome: { roas: 3.1 },
 *   lineage: { conceptId: "concept_88", angleId: "angle_12" },
 * });
 *
 * await ledger.settle("org_123", entry.id, { roas: 3.25 }, "measured over 72h");
 * console.log(await ledger.verify("org_123")); // { valid: true, entries: 2 }
 * ```
 */
export { ButterflyLedger } from "./ledger.ts";
export type { ButterflyLedgerOptions, SettledAction } from "./ledger.ts";
export { Ed25519Signer, Keyring, GENESIS_PREV_HASH, sha256, type Signer } from "./crypto.ts";
export { InMemoryLedgerStore, type LedgerStore } from "./store.ts";
export { canonicalize } from "./canonical.ts";
export type {
  ActionRecord,
  Decision,
  DecisionMode,
  EntryKind,
  EntryPayload,
  LedgerEntry,
  SettlementRecord,
  VerifyResult,
} from "./types.ts";
