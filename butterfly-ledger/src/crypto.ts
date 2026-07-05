/**
 * Cryptographic primitives for the ledger: SHA-256 content hashing and Ed25519
 * signing/verification. Uses only Node's built-in `crypto` — no dependencies,
 * so this drops into any Node/Bun runtime unchanged.
 */
import {
  createHash,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
  createPublicKey,
  createPrivateKey,
  type KeyObject,
} from "node:crypto";

export const GENESIS_PREV_HASH = "0".repeat(64);

/** SHA-256 of a UTF-8 string, hex-encoded. */
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Signs entry hashes. The public half is exported so auditors can verify the
 * chain without ever holding the secret — the core promise of the ledger.
 */
export interface Signer {
  readonly keyId: string;
  /** Sign a hex hash, returning a hex signature. */
  sign(hashHex: string): string;
  /** SPKI-encoded public key (PEM), safe to share for verification. */
  publicKeyPem(): string;
}

export class Ed25519Signer implements Signer {
  readonly keyId: string;
  #privateKey: KeyObject;
  #publicKey: KeyObject;

  constructor(keyId: string, privateKey: KeyObject, publicKey: KeyObject) {
    this.keyId = keyId;
    this.#privateKey = privateKey;
    this.#publicKey = publicKey;
  }

  /** Generate a fresh keypair. In production the key lives in a KMS/vault. */
  static generate(keyId: string): Ed25519Signer {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    return new Ed25519Signer(keyId, privateKey, publicKey);
  }

  /** Rebuild a signer from stored PEM material (e.g. loaded from a vault). */
  static fromPem(keyId: string, privateKeyPem: string): Ed25519Signer {
    const privateKey = createPrivateKey(privateKeyPem);
    // Passing the private-key PEM extracts its public half.
    const publicKey = createPublicKey(privateKeyPem);
    return new Ed25519Signer(keyId, privateKey, publicKey);
  }

  sign(hashHex: string): string {
    // Ed25519 in Node takes a null algorithm; it hashes internally.
    return edSign(null, Buffer.from(hashHex, "hex"), this.#privateKey).toString("hex");
  }

  publicKeyPem(): string {
    return this.#publicKey.export({ type: "spki", format: "pem" }).toString();
  }

  privateKeyPem(): string {
    return this.#privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  }
}

/**
 * Holds public keys by id so a verifier can check any entry's signature. An
 * auditor loads only public material here.
 */
export class Keyring {
  #keys = new Map<string, KeyObject>();

  addPublicKeyPem(keyId: string, publicKeyPem: string): this {
    this.#keys.set(keyId, createPublicKey(publicKeyPem));
    return this;
  }

  /** Convenience: register a signer's public half. */
  addSigner(signer: Signer): this {
    return this.addPublicKeyPem(signer.keyId, signer.publicKeyPem());
  }

  verify(keyId: string, hashHex: string, signatureHex: string): boolean {
    const key = this.#keys.get(keyId);
    if (!key) return false;
    try {
      return edVerify(null, Buffer.from(hashHex, "hex"), key, Buffer.from(signatureHex, "hex"));
    } catch {
      return false;
    }
  }

  has(keyId: string): boolean {
    return this.#keys.has(keyId);
  }
}
