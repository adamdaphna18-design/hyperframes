import { createHash } from "node:crypto";

/**
 * SHA-256 primitives for ButterflyLedger.
 *
 * Every structural commitment in the ledger — block hashes, the Merkle root,
 * transaction ids and the Fiat–Shamir challenge inside the zero-knowledge
 * proofs — bottoms out in SHA-256. This gives the chain its avalanche
 * property: flipping a single input bit re-randomises ~half the output bits,
 * which is the cryptographic seed of the "butterfly effect" the ledger is
 * named for (see {@link ./butterfly.ts}).
 */

/** Hash arbitrary bytes/strings to a lowercase hex digest. */
export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Hash bytes and return the raw 32-byte digest. */
export function sha256Bytes(data: string | Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(data).digest());
}

/**
 * Domain-separated hash of an ordered list of fields. Each part is length-
 * prefixed so that `["ab", "c"]` and `["a", "bc"]` can never collide — a
 * standard defense against concatenation ambiguity.
 */
export function sha256Fields(domain: string, parts: Array<string | number | bigint>): string {
  const h = createHash("sha256");
  h.update(domain);
  h.update("\x1f");
  for (const part of parts) {
    const s = typeof part === "string" ? part : part.toString();
    h.update(s.length.toString());
    h.update(":");
    h.update(s);
    h.update("\x1f");
  }
  return h.digest("hex");
}

/** Interpret a hex digest as a big-endian BigInt. */
export function hexToBigInt(hex: string): bigint {
  return BigInt("0x" + hex);
}
