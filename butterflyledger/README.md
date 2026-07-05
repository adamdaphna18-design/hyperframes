# ButterflyLedger

**A zero-knowledge, SHA-256 blockchain ledger for every action an AI agent takes — grounded in butterfly-effect (chaos) theory.**

As autonomous AI agents take real-world actions (calling tools, spending money, writing files, hitting APIs), we need an **immutable, verifiable, privacy-preserving record** of what they did. ButterflyLedger is that record:

- **Every AI action is a transaction** on an append-only, hash-chained ledger.
- **SHA-256 everywhere** — block hashes, Merkle roots, transaction ids, and the Fiat–Shamir challenge inside every proof.
- **Zero-knowledge authorship** — an agent proves _it_ authored an action without ever revealing its private key (Schnorr NIZK), and can hide sensitive payloads behind Pedersen commitments.
- **The butterfly effect is the security model** — the ledger is treated as a deterministic chaotic system: tamper with one historical byte and the SHA-256 avalanche cascades through every downstream block, exactly like a 1e-12 perturbation blowing up a chaotic trajectory.

> **Whitepaper:** see [WHITEPAPER.md](./WHITEPAPER.md) — a full rewrite of the original _Butterfly Effect Engine_ PDF (which shipped a CID font with no Unicode mapping and could not be recovered), grounded in this reference implementation.

## The core idea: a ledger _is_ a chaotic system

Chaos theory studies deterministic systems with **sensitive dependence on initial conditions** — the butterfly effect. A hash chain has exactly this property:

| Chaos theory                            | ButterflyLedger                                                |
| --------------------------------------- | -------------------------------------------------------------- |
| Nonlinear map `xₙ₊₁ = f(xₙ)`            | `blockHashₙ₊₁ = SHA256(headerₙ₊₁ ‖ blockHashₙ)`                |
| Initial condition `x₀`                  | Genesis / previous block hash                                  |
| Sensitive dependence (butterfly effect) | SHA-256 avalanche — 1 flipped bit ⇒ ~half the output bits flip |
| Positive Lyapunov exponent ⇒ chaos      | Any tamper diverges the whole downstream chain                 |
| Deterministic yet unpredictable         | Recompute the chain exactly, but you can't shortcut it         |

`src/butterfly.ts` makes this **measurable**: it seeds the logistic map `x → 3.99·x·(1−x)` (deep in the chaotic regime) from a block hash and reports the Lyapunov exponent and how fast a minimal perturbation diverges — the same fingerprint that makes the ledger tamper-evident.

## Architecture

```
src/
  hash.ts          SHA-256 primitives, domain-separated field hashing, avalanche
  group.ts         2048-bit RFC-3526 prime-order group for the ZK layer
  zkp.ts           Schnorr NIZK authorship proofs + Pedersen commitments
  merkle.ts        Binary Merkle tree + inclusion proofs
  butterfly.ts     Chaos engine: logistic map, butterfly signature, divergence
  transaction.ts   AI-action transaction (ZK-signed, deterministic)
  vm.ts            Deterministic gas-metered stack VM for smart contracts
  contract.ts      Smart-contract engine: deploy/invoke, state roots
  block.ts         Block header, Merkle + state roots, proof-of-work sealing
  ledger.ts        The chain: record → seal → validate → prove, cascade detection
  cli.ts           Command-line interface
  demo.ts          End-to-end walkthrough
```

## Quick start

```bash
bun install
bun test            # 35 tests across crypto, merkle, chaos, and ledger
bun run src/demo.ts # full end-to-end story
```

### Library

```ts
import { Ledger, agentKeyFromSecret, createTransaction } from "butterflyledger";

const agent = agentKeyFromSecret(0x5eed0001n);
const ledger = new Ledger({ difficulty: 2 });

// Record an AI action — the transaction carries a zero-knowledge authorship proof.
ledger.record(
  createTransaction(agent, {
    action: "http.post",
    payload: "POST /api/book",
    timestamp: 1,
    nonce: 0,
  }),
);

const block = ledger.sealPending(Date.now()); // mine proof-of-work + butterfly signature
console.log(ledger.validate()); // { valid: true, brokenAtHeight: -1, ... }
```

### CLI

```bash
# generate an agent keypair
bun run src/cli.ts keygen

# record actions (each becomes a ZK-signed transaction), then mine a block
bun run src/cli.ts record --secret <hex> --action tool.call --payload "search(flights)"
bun run src/cli.ts seal
bun run src/cli.ts verify        # OK — chain of 1 block(s) is valid
bun run src/cli.ts show

# prove a specific action is on-chain without shipping the whole block
bun run src/cli.ts prove --tx <id>

# show the butterfly cascade: forge one byte of history and watch validation break
bun run src/cli.ts tamper --tx <id> --payload "forged"

# measure the chaos directly (logistic map, Lyapunov exponent)
bun run src/cli.ts butterfly
```

## Smart contracts: policy as code

Contracts on an audit ledger are **policy programs**: deterministic, gas-metered bytecode (a tiny stack VM — no floats, no clock, no host calls) deployed _as transactions_. A contract's id is the SHA-256 of its code; its state lives on-chain; and every block header commits to a **state root** over all programs + state, so contract state gets the same butterfly-cascade protection as the transactions themselves.

- **Enforcement at ingress** — `contract.invoke` actions execute against the current state when recorded; a rejected action (e.g. exceeding a spending cap) never enters the mempool.
- **Verifiability by re-execution** — `validate()` replays every deploy/invoke from genesis and requires each sealed state root to be reproducible. Forge a sealed invocation and the chain breaks at that exact block.

```ts
// Spending-cap policy: spent += amount, only while spent + amount ≤ 800
const program: Instruction[] = [
  { op: "LOAD", arg: "spent" }, { op: "ARG", arg: "0" }, { op: "ADD" },
  { op: "DUP" }, { op: "PUSH", arg: "800" }, { op: "GT" },
  { op: "JZ", arg: "8" }, { op: "REJECT" },
  { op: "STORE", arg: "spent" }, { op: "PUSH", arg: "1" }, { op: "HALT" },
];
ledger.record(createTransaction(agent, { action: "contract.deploy",  payload: deployPayload(program), … }));
ledger.record(createTransaction(agent, { action: "contract.invoke", payload: invokePayload(id, [499n]), … })); // ok
ledger.record(createTransaction(agent, { action: "contract.invoke", payload: invokePayload(id, [400n]), … })); // throws: policy REJECT
```

```bash
bun run src/cli.ts deploy   --secret <hex> --program cap.json
bun run src/cli.ts invoke   --secret <hex> --contract <id> --args 300
bun run src/cli.ts contracts
```

## Zero-knowledge layer

**Schnorr NIZK (proof of authorship).** An agent's identity is a public key `y = G^x` in a 2048-bit prime-order group. To record an action it produces a non-interactive proof of knowledge of `x`, bound to the action via a Fiat–Shamir challenge (`c = SHA256(G, y, r, message)`). The verifier checks `G^s == r · y^c` — learning _that_ the agent authored the action and **nothing** about `x`. The proof doubles as an unforgeable signature.

**Pedersen commitments (hidden payloads).** For confidential actions (e.g. a payment amount), the agent publishes `C = G^m · H^r` instead of the raw value. `C` is perfectly hiding and computationally binding; the value can be opened or proven later without ever appearing on-chain. `H` is derived by a nothing-up-my-sleeve hash so nobody knows `logₘ(H)`.

**Merkle inclusion proofs.** Each block header stores only the Merkle root of its transactions, so anyone can prove "action T is in block B" against the root without the full block.

## Security notes

This is a **reference implementation** meant to be correct, readable, and fully tested — not a hardened production deployment. The discrete-log group is a fixed 2048-bit MODP prime (adequate for demonstrating soundness); a production system would swap in an elliptic curve for speed, add networking/consensus, and use a persistent store. Randomness for proofs comes from the OS CSPRNG; timestamps and nonces are supplied by the caller so the ledger stays **deterministic and reproducible**.

## License

MIT
