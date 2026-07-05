import { sha256Fields } from "./hash.js";
import { type AgentKey, type SchnorrProof, proveAuthorship, verifyAuthorship } from "./zkp.js";

/**
 * A ButterflyLedger transaction records a single action taken by an AI agent.
 *
 * The design goal is accountability without surveillance: the ledger proves an
 * action happened and who authored it, while the zero-knowledge proof means the
 * agent never exposes its private key, and (optionally) a Pedersen commitment
 * can stand in for a sensitive payload.
 */

/** The canonical, signable content of an action (everything except the proof). */
export interface ActionBody {
  /** Public id of the agent that performed the action. */
  readonly agentId: string;
  /** Machine-readable action verb, e.g. "tool.call", "http.get", "file.write". */
  readonly action: string;
  /**
   * Free-form payload describing the action. May be the literal content, or a
   * Pedersen commitment hex when the content must stay confidential.
   */
  readonly payload: string;
  /**
   * Logical timestamp (e.g. a monotonic counter or supplied epoch ms). Passed
   * in explicitly rather than read from the clock so the ledger stays
   * deterministic and reproducible.
   */
  readonly timestamp: number;
  /** Per-agent monotonically increasing counter, preventing replay/reordering. */
  readonly nonce: number;
}

/** A fully-formed transaction: the action body plus its zero-knowledge authorship proof. */
export interface Transaction extends ActionBody {
  /** SHA-256 id of the action body (its Merkle leaf). */
  readonly id: string;
  /** Non-interactive ZK proof that `agentId`'s owner authored this exact body. */
  readonly proof: SchnorrProof;
}

/** Deterministically serialise an action body for hashing and proving. */
export function serializeBody(body: ActionBody): string {
  return sha256Fields("butterflyledger/tx/v1", [
    body.agentId,
    body.action,
    body.payload,
    body.timestamp,
    body.nonce,
  ]);
}

/**
 * Build a signed transaction. The Schnorr proof is bound to the serialised
 * body, so any later mutation of the body invalidates the proof.
 */
export function createTransaction(
  key: AgentKey,
  input: Omit<ActionBody, "agentId">,
  rng?: (n: number) => Uint8Array,
): Transaction {
  const body: ActionBody = { agentId: key.publicId, ...input };
  const id = serializeBody(body);
  const proof = proveAuthorship(key, id, rng);
  return { ...body, id, proof };
}

/** Verify a transaction's id and its zero-knowledge authorship proof. */
export function verifyTransaction(tx: Transaction): boolean {
  const body: ActionBody = {
    agentId: tx.agentId,
    action: tx.action,
    payload: tx.payload,
    timestamp: tx.timestamp,
    nonce: tx.nonce,
  };
  const id = serializeBody(body);
  if (id !== tx.id) return false;
  return verifyAuthorship(tx.agentId, id, tx.proof);
}
