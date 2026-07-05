/**
 * ButterflyLedger — domain types.
 *
 * A tamper-evident, hash-chained, signed audit log for the AI-agent layer of
 * the Performance Marketing OS. Every recommendation that becomes an action is
 * written here as an append-only entry, chained to its predecessor (Merkle
 * style) and signed. Outcomes are never mutated in place — they are recorded
 * as linked settlement entries, so the chain stays immutable end to end.
 */

/** How a decision was reached. */
export type DecisionMode = "copilot" | "autopilot" | "human";

/** The decision attached to a proposed action. */
export interface Decision {
  /** Who/what approved: a user id, an agent id, or "system". */
  by: string;
  mode: DecisionMode;
  /** Optional human-readable rationale (grounded, per the no-hallucination rule). */
  rationale?: string;
}

/**
 * The substance of an action entry: a recommendation the agent produced, the
 * decision that greenlit it, the concrete action taken, and what the agent
 * predicted would happen. `predictedOutcome` is later compared against the
 * settled `actualOutcome` — that delta is the learning signal.
 */
export interface ActionRecord {
  /** What fired the agent: an anomaly signal, a rule, a manual request. */
  trigger: string;
  /** The recommendation text, grounded in real metrics. */
  recommendation: string;
  decision: Decision;
  /** The action verb, e.g. "increase_budget", "pause_ad", "rewrite_copy". */
  action: string;
  /** Structured action parameters. */
  params: Record<string, unknown>;
  /** What the agent expected this action to produce (e.g. { roas: 3.4 }). */
  predictedOutcome?: Record<string, unknown>;
  /**
   * Lineage back into the creative graph: which concept/angle/icp/offer this
   * action touched. This is what makes the ledger queryable as an OS, not a log.
   */
  lineage?: {
    creativeAssetId?: string;
    conceptId?: string;
    angleId?: string;
    icpId?: string;
    offerId?: string;
  };
}

/**
 * Records the real-world result of a prior action. Append-only: this does not
 * edit the original entry, it links to it.
 */
export interface SettlementRecord {
  /** Hash/id of the action entry being settled. */
  ref: string;
  /** What actually happened (e.g. { roas: 2.9 }). */
  actualOutcome: Record<string, unknown>;
  /** Optional note (e.g. "measured over 72h window"). */
  note?: string;
}

export type EntryKind = "action" | "settlement";

export type EntryPayload =
  | { kind: "action"; data: ActionRecord }
  | { kind: "settlement"; data: SettlementRecord };

/**
 * A single, sealed ledger entry. `hash` is content-addressed over the canonical
 * form of everything above it plus `prevHash`; `id` equals `hash`. `signature`
 * is an Ed25519 signature over `hash`, verifiable with the public key named by
 * `signerKeyId` — no secret needed to audit.
 */
export interface LedgerEntry {
  /** Content address of this entry (== hash). */
  id: string;
  orgId: string;
  /** Per-tenant sequence number, starting at 0. */
  seq: number;
  timestamp: number;
  payload: EntryPayload;
  /** Hash of the previous entry in this tenant's chain (genesis == 64 zeros). */
  prevHash: string;
  /** SHA-256 over the canonical content of this entry. */
  hash: string;
  /** Ed25519 signature over `hash`, hex-encoded. */
  signature: string;
  /** Identifier of the public key that can verify `signature`. */
  signerKeyId: string;
}

/** Result of verifying a tenant's chain. */
export type VerifyResult =
  | { valid: true; entries: number }
  | { valid: false; seq: number; reason: string };
