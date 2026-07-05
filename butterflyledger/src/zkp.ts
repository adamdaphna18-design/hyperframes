import { hexToBigInt, sha256Fields } from "./hash.js";
import { G, H, modPow, modQ, P, Q, randomScalar } from "./group.js";

/**
 * Zero-knowledge layer.
 *
 * ButterflyLedger records what an AI agent *did* without forcing it to reveal
 * *who it is* (its secret key) or, optionally, the raw contents of the action.
 * Two standard, self-contained constructions provide this:
 *
 *  1. Schnorr NIZK (Fiat–Shamir) — a non-interactive zero-knowledge proof of
 *     knowledge of the discrete log `x` behind a public agent id `y = G^x`.
 *     The proof is bound to the message (the action being recorded), so it
 *     doubles as an unforgeable signature of authorship. The verifier learns
 *     *that* the agent authored the action, and nothing about `x`.
 *
 *  2. Pedersen commitment — `C = G^m · H^r`. Perfectly hiding, computationally
 *     binding. Lets an agent commit to a sensitive numeric action value `m`
 *     on-chain and later open it (or prove statements about it) without the
 *     value ever appearing in the ledger.
 */

/** An agent's keypair. The public id is safe to publish; the secret never leaves the agent. */
export interface AgentKey {
  /** Secret discrete log. Keep private. */
  readonly secret: bigint;
  /** Public identity: G^secret mod P, as a hex string. */
  readonly publicId: string;
}

/** A non-interactive Schnorr proof of knowledge, bound to a message. */
export interface SchnorrProof {
  /** Commitment r = G^k mod P (hex). */
  readonly commitment: string;
  /** Response s = k + c·x mod Q (hex). */
  readonly response: string;
}

/** Derive an agent keypair from a secret scalar. */
export function agentKeyFromSecret(secret: bigint): AgentKey {
  const s = modQ(secret);
  if (s === 0n) throw new Error("agent secret must be non-zero mod Q");
  return { secret: s, publicId: modPow(G, s, P).toString(16) };
}

/** Generate a fresh random agent keypair. */
export function generateAgentKey(rng?: (n: number) => Uint8Array): AgentKey {
  return agentKeyFromSecret(randomScalar(rng));
}

/** Fiat–Shamir challenge: hash the public transcript into an exponent-field scalar. */
function challenge(publicId: string, commitment: bigint, message: string): bigint {
  const digest = sha256Fields("butterflyledger/schnorr/v1", [
    P.toString(16),
    G.toString(16),
    publicId,
    commitment.toString(16),
    message,
  ]);
  return modQ(hexToBigInt(digest));
}

/**
 * Prove knowledge of the secret behind `key.publicId`, binding the proof to
 * `message`. Reveals nothing about the secret (honest-verifier zero knowledge,
 * made non-interactive via Fiat–Shamir).
 */
export function proveAuthorship(
  key: AgentKey,
  message: string,
  rng?: (n: number) => Uint8Array,
): SchnorrProof {
  const k = randomScalar(rng);
  const commitment = modPow(G, k, P);
  const c = challenge(key.publicId, commitment, message);
  const s = modQ(k + c * key.secret);
  return { commitment: commitment.toString(16), response: s.toString(16) };
}

/**
 * Verify a Schnorr authorship proof. Returns true iff `G^s == r · y^c mod P`,
 * which holds exactly when the prover knew `x` with `y = G^x` and signed
 * `message`.
 */
export function verifyAuthorship(publicId: string, message: string, proof: SchnorrProof): boolean {
  let r: bigint;
  let s: bigint;
  let y: bigint;
  try {
    r = hexToBigInt(proof.commitment);
    s = hexToBigInt(proof.response);
    y = hexToBigInt(publicId);
  } catch {
    return false;
  }
  if (r <= 0n || r >= P || y <= 0n || y >= P) return false;
  if (s < 0n || s >= Q) return false;
  const c = challenge(publicId, r, message);
  const lhs = modPow(G, s, P);
  const rhs = (r * modPow(y, c, P)) % P;
  return lhs === rhs;
}

/** A Pedersen commitment together with the opening needed to reveal it later. */
export interface Commitment {
  /** C = G^value · H^blinding mod P (hex). Safe to publish. */
  readonly commitment: string;
  /** The committed value. Secret until opened. */
  readonly value: bigint;
  /** Random blinding factor. Secret until opened. */
  readonly blinding: bigint;
}

/** Commit to a numeric value with a fresh random blinding factor. */
export function commit(value: bigint, rng?: (n: number) => Uint8Array): Commitment {
  const v = modQ(value);
  const blinding = randomScalar(rng);
  const c = (modPow(G, v, P) * modPow(H, blinding, P)) % P;
  return { commitment: c.toString(16), value: v, blinding };
}

/** Verify that `(value, blinding)` opens `commitmentHex`. */
export function verifyCommitment(commitmentHex: string, value: bigint, blinding: bigint): boolean {
  let c: bigint;
  try {
    c = hexToBigInt(commitmentHex);
  } catch {
    return false;
  }
  const expected = (modPow(G, modQ(value), P) * modPow(H, modQ(blinding), P)) % P;
  return c === expected;
}
