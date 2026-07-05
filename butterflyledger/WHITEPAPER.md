# ButterflyLedger

## A Zero-Knowledge, SHA-256 Blockchain Ledger for Every Action an AI Agent Takes, Grounded in Butterfly-Effect Theory

**Version 1.1 · July 2026**

> This document supersedes the original _Butterfly Effect Engine_ whitepaper PDF, whose
> source file shipped a CID-keyed font with no Unicode mapping and could not be recovered.
> It is a full rewrite, reconstructed from the project thesis and grounded in the reference
> implementation that accompanies it in this repository (`butterflyledger/src`). Every
> parameter, equation, and measurement quoted below is taken from running code.

---

## Abstract

Autonomous AI agents now take consequential real-world actions: they call tools, move
money, write files, send messages, and invoke other agents. Yet the record of _what an
agent actually did_ typically lives in mutable application logs owned by the very party
that would benefit from editing them. ButterflyLedger closes this accountability gap with
an append-only, SHA-256 hash-chained ledger in which **every agent action is a
transaction**, every transaction carries a **zero-knowledge proof of authorship**
(Schnorr NIZK via Fiat–Shamir), sensitive payloads can be hidden behind **Pedersen
commitments**, and per-block **Merkle trees** allow any single action to be proven
on-chain without disclosing its neighbours.

The design is organised around a thesis from chaos theory: _an append-only hash chain is
a deterministic chaotic system_. The SHA-256 avalanche property plays the role of
sensitive dependence on initial conditions — the butterfly effect. Tampering with a
single historical byte diverges the entire downstream trajectory of block hashes, making
forgery not merely detectable but _globally_ detectable, at a precisely locatable
epicentre. ButterflyLedger makes this thesis measurable: each block derives a _butterfly
signature_ from a chaotic map seeded by its own hash, and the ledger can empirically
demonstrate a positive Lyapunov exponent — the mathematical fingerprint of chaos — over
its own chaining function.

---

## 1. Motivation: The Accountability Gap for Acting AI

Three properties are simultaneously required of an audit record for AI actions, and
conventional logging provides none of them:

1. **Immutability.** The operator of an agent must not be able to silently rewrite the
   record of what the agent did. Application logs, databases, and object stores are all
   mutable by their owners.

2. **Verifiable authorship.** "Agent A did X" must be cryptographically checkable by a
   third party — not merely asserted by a log line. At the same time, forcing agents to
   expose long-lived signing secrets to every verifier is unacceptable.

3. **Privacy.** An audit trail must be able to attest that an action _happened_ (a
   payment was made, a file was written) without necessarily disclosing its contents (the
   amount, the file body). Accountability must not require surveillance.

Blockchains solve (1); digital signatures approximate (2) but leak more structure than
needed; (3) is usually abandoned entirely. ButterflyLedger composes standard,
well-understood primitives — SHA-256, Schnorr proofs of knowledge, Pedersen commitments,
Merkle trees, and proof-of-work — into a single small system that provides all three at
once, and explains _why_ the composition is tamper-evident using the language of
dynamical systems.

---

## 2. The Butterfly-Effect Thesis

### 2.1 Chaos, formally

A deterministic dynamical system `x_{n+1} = f(x_n)` is _chaotic_ when it exhibits
sensitive dependence on initial conditions: two trajectories starting a distance `ε`
apart separate exponentially, `|δ_n| ≈ ε · e^{λn}`, where the largest Lyapunov exponent
`λ > 0`. This is the butterfly effect (Lorenz, 1963): an unmeasurably small perturbation
— the flap of a wing — determines the macroscopic future, even though the system is
fully deterministic.

The canonical minimal example is the **logistic map**

```
x_{n+1} = r · x_n · (1 − x_n),      r ∈ (3.57, 4] ⇒ chaotic regime
```

### 2.2 A hash chain is the same object

ButterflyLedger's structural claim is that a hash-chained ledger _is_ such a system:

| Chaos theory                               | ButterflyLedger                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| Nonlinear map `x_{n+1} = f(x_n)`           | `hash_{n+1} = SHA256(header_{n+1} ∥ hash_n)`                                         |
| Initial condition `x_0`                    | Genesis parent / previous block hash                                                 |
| Sensitive dependence (butterfly effect)    | SHA-256 avalanche: one flipped input bit re-randomises ≈ half of the 256 output bits |
| Positive Lyapunov exponent ⇒ chaos         | Any historical tamper diverges every downstream block hash                           |
| Deterministic yet unpredictable trajectory | The chain is exactly recomputable from history, but no shortcut exists               |

Both systems share the property that matters for auditing: **the future state commits to
the entire past with maximal sensitivity**. In a benign dynamical system a small error
stays small and can be patched locally; in a chaotic one — and in a hash chain — there is
no local patch. An adversary who edits one byte of block `k` must re-derive blocks
`k, k+1, …, tip`, and proof-of-work (§5.5) makes each re-derivation costly.

### 2.3 Making the thesis measurable

The reference implementation does not leave this as metaphor. Module `butterfly.ts`:

- **Seeds** the logistic map from a block hash: the low 52 bits of
  `SHA256(hash)` are mapped into the open interval `(0.05, 0.95)` — exactly
  representable in an IEEE-754 double, keeping the trajectory deterministic across
  platforms.
- **Iterates** `x → 3.99 · x · (1 − x)` for 256 steps (`r = 3.99`, deep in the chaotic
  regime).
- **Derives a butterfly signature** — `SHA256("butterfly:" ∥ hash ∥ x_256)` with the
  final state rounded to 12 decimal places — which is stored in the block and re-verified
  during validation. The block is thereby bound to its position on the chaotic
  trajectory.
- **Measures divergence**: perturbing the seed by `ε = 10⁻¹²` and co-iterating both
  trajectories yields, in practice, macroscopic separation (distance ≥ 0.5) after **≈ 40–50
  iterations** and a strongly **positive empirical Lyapunov estimate** — the quantitative
  butterfly effect, computed live over the ledger's own block hashes.

The point of the exercise: the same mathematics that makes tomorrow's weather
unpredictable makes yesterday's ledger unforgeable.

---

## 3. System Model

**Agents.** Each AI agent holds a secret scalar `x` and publishes an identity
`y = G^x mod P` (§5.2). The secret never leaves the agent.

**Actions → transactions.** Every action an agent takes is serialised as a transaction:

```
ActionBody := { agentId, action, payload, timestamp, nonce }
Transaction := ActionBody + { id, proof }
```

- `action` is a machine-readable verb (`tool.call`, `http.post`, `payment.charge`,
  `file.write`, …).
- `payload` is either the literal content **or** a Pedersen commitment when the content
  must remain confidential (§5.3).
- `timestamp` and `nonce` are caller-supplied: a logical clock and a per-agent monotonic
  counter. Nothing in the ledger reads a wall clock or an unseeded RNG at
  serialisation time, so the entire structure is **deterministic and reproducible** —
  the same history always re-derives the same chain.
- `id = H_fields("butterflyledger/tx/v1", body)` — a domain-separated, length-prefixed
  SHA-256 over the body fields (§5.1).
- `proof` is a Schnorr NIZK bound to `id` (§5.2): mutate any body field and the proof
  dies with it.

**Blocks and the chain.** Pending transactions accumulate in a mempool and are _sealed_
into blocks. A block header commits to the block height, the previous block hash, the
Merkle root of its transactions, a timestamp, a difficulty target, and the proof-of-work
nonce. The header's SHA-256 digest is simultaneously the chain link, the proof-of-work
subject, and the seed of the block's butterfly signature.

**Trust model.** The reference implementation is a single-writer, many-verifier ledger:
one process appends; anyone holding a copy (or a Merkle proof plus a block header) can
verify. Multi-writer consensus is explicitly out of scope for v1 (§7).

---

## 4. Protocol Lifecycle

```
record ──▶ mempool ──seal──▶ block_n ──chain──▶ validate ──▶ prove
  │                             │                   │
  ZK authorship proof           PoW + butterfly     first-failure
  checked at ingress            signature           epicentre report
```

1. **Record.** `record(tx)` verifies the transaction id and its zero-knowledge
   authorship proof _at ingress_; unverifiable actions never enter the mempool.
2. **Seal.** `sealPending(timestamp)` computes the Merkle root over the batch, advances
   the contract state machine by the batch and derives the **state root** (§5.6), grinds
   the proof-of-work nonce until `SHA256(header)` has the required number of leading
   zero hex digits, derives the butterfly signature from the sealed hash, and appends
   the block to the chain.
3. **Validate.** `validate()` walks the chain from genesis and checks, per block:
   height continuity, the `previousHash` link, the recomputed Merkle root, the header
   hash, the difficulty target, the butterfly signature, and every transaction's ZK
   proof. It returns either _valid_ or the **height of the first failure** — the
   epicentre of the cascade — with a human-readable reason.
4. **Prove.** `proveInclusion(txId)` emits a Merkle inclusion proof: `O(log n)` sibling
   hashes that connect one action to a 32-byte block commitment. A verifier needs only
   the block header — not the block, not the ledger.
5. **Tamper (adversarial path).** Any post-seal mutation — a payload edit, a re-linked
   parent, a swapped transaction — is caught by step 3. The implementation ships a
   `tamper` command that forges a copy of the ledger and demonstrates the cascade
   without touching the real chain.

---

## 5. Cryptographic Constructions

### 5.1 SHA-256 with domain separation

All structural hashing uses SHA-256 (FIPS 180-4) through a single field-hashing
construction:

```
H_fields(domain, [f_1 … f_k]) = SHA256(domain ∥ 0x1F ∥ len(f_1) ":" f_1 ∥ 0x1F ∥ … )
```

Two defensive properties:

- **Domain separation.** Every context uses a distinct tag (`butterflyledger/tx/v1`,
  `butterflyledger/block/v1`, `butterflyledger/merkle/leaf`, `butterflyledger/merkle/node`,
  `butterflyledger/schnorr/v1`). A hash computed in one role can never be replayed in
  another.
- **Length-prefixed fields.** `["ab","c"]` and `["a","bc"]` hash differently by
  construction, eliminating concatenation-ambiguity collisions.

SHA-256's avalanche behaviour — each input bit flips each output bit with probability
≈ ½ — is the microscopic mechanism behind the macroscopic butterfly cascade of §2.

### 5.2 Zero-knowledge authorship: Schnorr NIZK (Fiat–Shamir)

**Group.** The 2048-bit MODP safe prime `P` of RFC 3526 group 14; `Q = (P−1)/2` prime;
generator `G = 4` (a quadratic residue, hence a generator of the order-`Q` subgroup —
ruling out small-subgroup confusion). These are fixed, nothing-up-my-sleeve parameters.

**Identity.** Secret `x ∈ [1, Q)`, public `y = G^x mod P`.

**Prove** (authorship of message `m`, here the transaction id):

```
k ← random scalar ∈ [1, Q)          (OS CSPRNG, 288 bits → negligible modulo bias)
r = G^k mod P                        (commitment)
c = H_fields("…/schnorr/v1", [P, G, y, r, m]) mod Q      (Fiat–Shamir challenge)
s = k + c·x mod Q                    (response)
proof = (r, s)
```

**Verify:** accept iff `G^s ≡ r · y^c (mod P)`, after range-checking `r, y ∈ (0, P)` and
`s ∈ [0, Q)`.

**Properties.**

- _Completeness_: an honest prover always verifies.
- _Soundness (proof of knowledge)_: producing an accepting `(r, s)` without knowing `x`
  is equivalent to solving the discrete logarithm in a 2048-bit group.
- _Zero knowledge_: the transcript is simulatable without `x`; the verifier learns
  **that** the key-holder authored `m` and nothing else. The agent's secret never
  appears in any message, on any wire, in any block.
- _Message binding_: `c` hashes `m`, so the proof is an unforgeable signature over the
  exact action body; altering any field of the action invalidates it.

### 5.3 Confidential payloads: Pedersen commitments

For sensitive action values (payment amounts, quantities), the agent publishes

```
C = G^m · H^ρ mod P
```

in place of the value `m`, with blinding `ρ` drawn fresh from the CSPRNG. The second
base `H` is derived by hashing a fixed label (`butterflyledger/pedersen-h/v1`) and
squaring into the subgroup — a nothing-up-my-sleeve derivation, so no party knows
`log_G(H)`.

- **Perfectly hiding**: `C` is statistically independent of `m`; even an unbounded
  adversary learns nothing. Two commitments to the same value are unlinkable.
- **Computationally binding**: opening `C` to a different value requires computing
  `log_G(H)`.
- The opening `(m, ρ)` can be disclosed later to selected auditors — or used inside
  richer proofs (range proofs, sum checks) in future versions — without the value ever
  having appeared on-chain.

### 5.4 Merkle trees and inclusion proofs

Each block's transactions are leaves of a binary Merkle tree with domain-separated leaf
and node hashes (preventing leaf/node confusion attacks) and Bitcoin-style odd-node
duplication. The header stores only the 32-byte root. An inclusion proof is the
`⌈log₂ n⌉` sibling path from a leaf to the root: "action T is committed by block B"
verifies against a single header, enabling light-client-style auditing of individual AI
actions.

### 5.5 Proof-of-work sealing and the butterfly signature

Sealing grinds a nonce until `SHA256(header)` meets a leading-zero difficulty target.
Proof-of-work is not used here for consensus — it is used to make the butterfly cascade
**expensive to repair**: after editing block `k`, an adversary must re-mine every block
in `[k, tip]`, and the honest chain's cumulative work keeps growing while they do.

The sealed hash then seeds the chaotic map of §2.3, and the resulting butterfly
signature is stored in the block and checked during validation — a second, independent
binding of each block to the trajectory of the chain.

### 5.6 Smart contracts: on-chain policy programs

Contracts on an audit ledger are **policy programs**: deterministic rules that decide
whether an agent action is allowed and update on-chain state (budgets, quotas,
counters). ButterflyLedger executes them in a purpose-built stack VM whose design is
dictated by one requirement — every validator must reproduce every state transition,
bit for bit, forever:

- **Total determinism.** Integer-only (`bigint`) arithmetic; no floats, no clock, no
  randomness, no host calls. Twenty-one opcodes: stack ops, arithmetic, comparisons,
  logic, conditional jumps, `LOAD`/`STORE` against per-contract state, `ARG` for
  invocation inputs, and `HALT`/`REJECT` verdicts.
- **Gas metering.** Every instruction costs gas (state access priced above stack
  work); an invocation that exceeds its limit traps and rejects. A buggy or malicious
  program can never stall sealing or validation.
- **Fail-closed state.** Writes land in a draft that commits only on accept — a
  rejected or trapped invocation cannot mutate on-chain state.

**Lifecycle.** A contract is _deployed as a transaction_ (`contract.deploy`, payload =
the canonical program serialisation); its id is the domain-separated SHA-256 of that
code, so code and identity are inseparable. Invocations (`contract.invoke`) execute at
`record()` ingress against the speculative tip state — **a rejected action never
enters the mempool** — and are re-executed by every validator.

**State roots.** Each block header commits to
`stateRoot = SHA256(sorted contracts: id ∥ code ∥ sorted state)` after applying the
block. The state root sits inside the proof-of-work-sealed header, so contract state
inherits the full butterfly cascade: forge one stored counter, or one sealed
invocation's arguments, and `validate()` — which replays every deploy and invoke from
genesis and requires each sealed root to be reproducible — breaks at exactly that
block. This is the standard blockchain notion of a verifiable state machine, scaled
to the audit use-case.

_Example._ A spending-cap policy (11 instructions) keeps `spent += amount` while
`spent + amount ≤ cap` and `REJECT`s beyond it. Deployed on-chain, it turns "the agent
must not spend more than its budget" from a promise in application code into a rule
the ledger itself enforces and every verifier re-checks.

---

## 6. Security Analysis

**Threat model.** The adversary may read the entire ledger, submit transactions, and —
after the fact — attempt to modify, reorder, insert, or delete sealed history. The
adversary does not hold any honest agent's secret key and cannot break SHA-256 or compute
discrete logarithms in the 2048-bit group.

| Attack                                                             | Defence                                                                                                                                                                        | Detected by                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Edit a sealed payload                                              | Merkle root changes ⇒ header hash changes ⇒ avalanche cascade                                                                                                                  | `validate()` at the exact block; tx id also mismatches |
| Reorder / delete / insert transactions in a block                  | Order-sensitive Merkle tree                                                                                                                                                    | Root mismatch at that block                            |
| Re-link a block to a different parent                              | `previousHash` continuity walk                                                                                                                                                 | Broken-link report at that height                      |
| Forge an action "as" another agent                                 | Schnorr soundness — requires the victim's discrete log                                                                                                                         | Ingress check and full validation                      |
| Replay an agent's old action                                       | `(agentId, nonce)` sits inside the signed body, so a verbatim replay collides on its id; a modified replay is a new body needing a fresh proof only the key holder can produce | Duplicate-id rejection at `record()` ingress           |
| Rewrite history wholesale                                          | Must re-mine PoW for every downstream block                                                                                                                                    | Cost asymmetry; cumulative work                        |
| Violate an on-chain policy (e.g. overspend a budget)               | Contract VM executes at `record()` ingress; rejected actions never enter the mempool                                                                                           | Ingress rejection; validators re-execute every invoke  |
| Forge sealed contract state or invocation results                  | State root inside the PoW-sealed header; `validate()` replays all contract executions from genesis                                                                             | State-root mismatch at the forged block                |
| Learn an agent's secret from its proofs                            | Zero-knowledge property — transcripts are simulatable                                                                                                                          | N/A (information-theoretic goal)                       |
| Learn a committed payload value                                    | Pedersen perfect hiding                                                                                                                                                        | N/A (information-theoretic goal)                       |
| Cross-context hash replay (tx hash as block hash, leaf as node, …) | Global domain separation (§5.1)                                                                                                                                                | Verification fails by construction                     |

**Honest reporting of limits.** The zero-knowledge layer proves _authorship_, not
_truthfulness_: an agent can honestly sign a dishonest description of what it did.
ButterflyLedger guarantees the record cannot be _changed after the fact_ and cannot be
_attributed to the wrong agent_ — semantic truth of payloads is the responsibility of the
recording harness. Similarly, a single-writer ledger's operator can _withhold_ the chain;
they cannot, however, produce two conflicting versions of it without one failing
validation or forfeiting the accumulated proof-of-work.

---

## 7. Limitations and Future Work

The reference implementation is deliberately small, readable, and fully tested rather
than production-hardened:

- **Single node.** No networking, gossip, or consensus. The natural v2 path is
  federated verification: multiple auditors mirror the chain and cross-attest tips.
- **MODP group.** The 2048-bit RFC 3526 group is sound but slow (~ms-scale proofs). A
  production deployment would move to an elliptic curve (e.g. secp256k1 or Ristretto)
  with the identical Schnorr/Pedersen structure.
- **Commitment proofs.** Pedersen openings are currently all-or-nothing. Range proofs
  (Bulletproofs) and homomorphic sum checks ("total spend this epoch < budget, amounts
  hidden") are the highest-value extension.
- **Contract VM scope.** The policy VM is intentionally minimal: no cross-contract
  calls, no events, and integer-only state. It is a governance layer, not a
  general-purpose execution environment.
- **Storage.** JSON snapshot persistence; a production system would use an append-only
  segment store with checkpointing.
- **Key management.** Agent secrets are raw scalars supplied by the caller; rotation,
  HSM custody, and revocation lists are out of scope for v1.

---

## 8. Reference Implementation

TypeScript (Bun), ~1,000 lines, zero runtime dependencies beyond `node:crypto`. Located
in `butterflyledger/` of this repository.

```
src/hash.ts          SHA-256, domain-separated field hashing
src/group.ts         RFC 3526 group-14 parameters, modPow, CSPRNG scalars, base H
src/zkp.ts           Schnorr NIZK authorship proofs; Pedersen commitments
src/merkle.ts        Merkle root, inclusion proofs, verification
src/butterfly.ts     Chaos engine: seeding, logistic map, signature, divergence
src/transaction.ts   Action bodies, ids, ZK-signed transactions
src/vm.ts            Deterministic gas-metered stack VM for contracts
src/contract.ts      Contract engine: deploy/invoke, state, state roots
src/block.ts         Headers, PoW sealing, self-verification
src/ledger.ts        Chain assembly, validation, inclusion proofs, snapshots
src/cli.ts           keygen · record · seal · verify · show · prove · tamper · deploy · invoke · contracts · butterfly
src/demo.ts          End-to-end narrative walkthrough
```

**Verification status.** 51 tests across the crypto, Merkle, chaos, VM/contract, and ledger layers
(soundness and binding negative-tests included) pass; the end-to-end demo records
plain and committed actions from two agents, seals two linked blocks, proves inclusion,
validates the chain, then forges one historical byte and shows validation fail at
block #0 while measuring `λ > 0` divergence on the live block hash.

```bash
bun install && bun test        # 51/51
bun run src/demo.ts            # the full story, including the cascade
```

---

## 9. Conclusion

ButterflyLedger reframes a familiar structure — the hash chain — through the lens that
explains _why_ it works: it is a deterministic chaotic system, and the butterfly effect
is not a metaphor for its security but the mechanism of it. On that foundation it layers
exactly the cryptography an AI-accountability ledger needs and nothing more: SHA-256
commitments for integrity, Schnorr zero-knowledge proofs so agents are accountable
without being exposed, Pedersen commitments so records attest without surveilling, Merkle
proofs so single actions verify cheaply, and proof-of-work so history is expensive to
rewrite. Every action an AI takes leaves a wingbeat in the chain — and the chain
remembers the weather.

---

## References

1. E. N. Lorenz, _Deterministic Nonperiodic Flow_, Journal of the Atmospheric Sciences, 1963.
2. R. M. May, _Simple mathematical models with very complicated dynamics_, Nature, 1976. (The logistic map.)
3. C. P. Schnorr, _Efficient Signature Generation by Smart Cards_, Journal of Cryptology, 1991.
4. A. Fiat, A. Shamir, _How to Prove Yourself: Practical Solutions to Identification and Signature Problems_, CRYPTO '86.
5. T. P. Pedersen, _Non-Interactive and Information-Theoretic Secure Verifiable Secret Sharing_, CRYPTO '91.
6. R. C. Merkle, _A Digital Signature Based on a Conventional Encryption Function_, CRYPTO '87.
7. S. Nakamoto, _Bitcoin: A Peer-to-Peer Electronic Cash System_, 2008.
8. T. Kivinen, M. Kojo, _RFC 3526: More Modular Exponential (MODP) Diffie-Hellman groups for IKE_, 2003.
9. NIST, _FIPS PUB 180-4: Secure Hash Standard_, 2015.
