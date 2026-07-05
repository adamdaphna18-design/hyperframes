import { randomBytes } from "node:crypto";
import { hexToBigInt, sha256 } from "./hash.js";

/**
 * Prime-order group used by the zero-knowledge layer.
 *
 * We work in the order-`q` subgroup of Z*_p where `p` is the 2048-bit MODP
 * safe prime from RFC 3526 (group 14), so `q = (p - 1) / 2`. The generator is
 * `4 = 2^2`, which is a quadratic residue and therefore a generator of the
 * prime-order subgroup — this rules out small-subgroup confusion.
 *
 * These are fixed, "nothing-up-my-sleeve" parameters. They are more than
 * adequate to make the Schnorr / Pedersen constructions in {@link ./zkp.ts}
 * genuinely sound for a reference implementation; a production deployment
 * would swap in an elliptic curve for speed.
 */

const P_HEX =
  "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1" +
  "29024E088A67CC74020BBEA63B139B22514A08798E3404DD" +
  "EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245" +
  "E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED" +
  "EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3D" +
  "C2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F" +
  "83655D23DCA3AD961C62F356208552BB9ED529077096966D" +
  "670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B" +
  "E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9" +
  "DE2BCBF6955817183995497CEA956AE515D2261898FA0510" +
  "15728E5A8AACAA68FFFFFFFFFFFFFFFF";

/** Field modulus (safe prime). */
export const P = BigInt("0x" + P_HEX);
/** Order of the prime-order subgroup: q = (p - 1) / 2. */
export const Q = (P - 1n) / 2n;
/** Generator of the order-q subgroup (4 = 2^2 is a quadratic residue). */
export const G = 4n;

/** Modular exponentiation: base^exp mod m, via square-and-multiply. */
export function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  if (m === 1n) return 0n;
  let result = 1n;
  let b = base % m;
  if (b < 0n) b += m;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % m;
    e >>= 1n;
    b = (b * b) % m;
  }
  return result;
}

/** Reduce a value into the exponent field [0, q). */
export function modQ(x: bigint): bigint {
  const r = x % Q;
  return r < 0n ? r + Q : r;
}

/**
 * A second generator `h` with no known discrete-log relation to `G`, derived
 * by hashing a fixed label and squaring into the subgroup. Because the
 * exponent is fixed by SHA-256 (a "nothing-up-my-sleeve" number) nobody knows
 * `log_G(h)`, which is exactly the hiding requirement for Pedersen
 * commitments.
 */
export const H: bigint = (() => {
  const seed = hexToBigInt(sha256("butterflyledger/pedersen-h/v1"));
  // Square to force membership in the order-q subgroup.
  return modPow((seed % (P - 2n)) + 2n, 2n, P);
})();

/**
 * Sample a uniform scalar in [1, q). Uses the OS CSPRNG. An optional injected
 * randomness source keeps proofs reproducible in tests without weakening the
 * production path.
 */
export function randomScalar(rng: (n: number) => Uint8Array = defaultRng): bigint {
  // 288 bits of entropy → negligible modulo bias against the 2047-bit q.
  const bytes = rng(36);
  let x = 0n;
  for (const byte of bytes) x = (x << 8n) | BigInt(byte);
  return (x % (Q - 1n)) + 1n;
}

function defaultRng(n: number): Uint8Array {
  return new Uint8Array(randomBytes(n));
}
