# ButterflyLedger

Tamper-evident, hash-chained, signed **action log** for the AI-agent layer of the
Performance Marketing OS.

Every recommendation the agents turn into an action — a budget change, a creative
rotation, a pause — is sealed here as an append-only entry, chained to its
predecessor (Merkle style) and signed with Ed25519. Outcomes are recorded as
**linked settlement entries**, never by editing history. The result:

- **Accountability** — when software touches million-dollar ad budgets, you get an
  audit trail that cannot be altered after the fact. Any edit, reorder, drop, or
  forgery is provable by anyone holding only the public keys.
- **Client trust** — "here is exactly what the system did, when, on whose approval,
  and what it predicted vs. what happened."
- **Learning signal** — the `predicted` vs. `actual` delta on each settled action is
  the dataset that trains the optimization policy in later roadmap phases.

This is the accountability backbone described in Chapter 3.4 of the technical
strategy: *not a real blockchain*, but a signed, append-only, hash-chained log
(tamper-evident by construction).

## Design

- **Per-tenant chains.** Each `orgId` has its own independent chain. Entry `seq`
  starts at 0; `prevHash` links to the prior entry's `hash`; genesis `prevHash` is
  64 zeros. Multi-tenant isolation is a first-class property, matching the
  RLS-per-tenant storage model.
- **Content-addressed.** An entry's `id` equals its `hash` — SHA-256 over the
  canonical (sorted-key, deterministic) form of its content plus `prevHash`.
- **Asymmetric signatures.** Ed25519. Auditors verify with public keys only; the
  signing key stays in a KMS/vault.
- **Append-only outcomes.** `settle()` writes a new entry referencing the original.
  History is immutable end to end.
- **Storage-agnostic.** The `LedgerStore` interface has one reference
  implementation (`InMemoryLedgerStore`); production is one append-only Postgres
  table keyed `(org_id, seq)` with RLS on `org_id`.
- **Zero runtime dependencies.** Node's built-in `crypto` only.

## Usage

```ts
import {
  ButterflyLedger,
  Ed25519Signer,
  Keyring,
  InMemoryLedgerStore,
} from "butterfly-ledger";

const signer = Ed25519Signer.generate("agent-signer-v1"); // prod: load from vault
const keyring = new Keyring().addSigner(signer);           // auditor: public keys only
const ledger = new ButterflyLedger({
  store: new InMemoryLedgerStore(),                        // prod: PostgresLedgerStore
  signer,
  keyring,
});

// 1. Seal a recommendation-turned-action.
const entry = await ledger.record("org_123", {
  trigger: "anomaly:roas concept_88 -22% over 72h",
  recommendation: "Cut ad set A budget 10% and rotate to angle_12.",
  decision: { by: "user_7", mode: "copilot", rationale: "approved in review" },
  action: "decrease_budget",
  params: { adSetId: "as_1", pct: -10 },
  predictedOutcome: { roas: 3.1 },
  lineage: { conceptId: "concept_88", angleId: "angle_12", icpId: "icp_dtc_owner" },
});

// 2. Later, record what actually happened (linked, not mutating).
await ledger.settle("org_123", entry.id, { roas: 3.25 }, "measured 72h");

// 3. Prove the chain is untampered.
await ledger.verify("org_123"); // { valid: true, entries: 2 }

// 4. Pull the learning signal: predicted vs actual.
await ledger.settledActions("org_123");
```

## API

| Method | Purpose |
| --- | --- |
| `record(orgId, action)` | Seal an action entry; returns the sealed `LedgerEntry`. |
| `settle(orgId, ref, actualOutcome, note?)` | Append a linked settlement for a prior action. |
| `verify(orgId)` | Re-derive hashes, check prev-links, validate signatures & references. |
| `chain(orgId)` | All entries for a tenant, ascending by seq. |
| `settledActions(orgId)` | Action↔outcome pairs (`predicted` vs `actual`). |

Verification catches: content edits (`hash mismatch`), forged/unknown signatures,
dropped or reordered entries (`prevHash` break / `seq gap`), and settlements
pointing at actions that don't exist.

## Develop

```bash
bun install       # dev types only; zero runtime deps
bun test          # 12 tests — sealing, verification, tamper detection, settlement, isolation
bun run typecheck # tsc --noEmit, strict
bun run demo      # end-to-end walkthrough incl. a caught tamper
```

## Production notes (next increments)

- **`PostgresLedgerStore`** implementing `LedgerStore` — append-only table, unique
  `(org_id, seq)`, RLS on `org_id`. Wrap `append` + head-read in one transaction
  (`SELECT ... FOR UPDATE` on the tenant's head) so concurrent records can't race
  the same `seq`.
- **Key management** — issue `signerKeyId` per environment/rotation; keep private
  keys in a KMS. `Keyring` already supports multiple key ids for rotation.
- **Periodic anchoring** (optional) — publish the periodic head hash somewhere
  external (or on-chain) if you ever want third-party-provable timestamps. The
  chain is designed to make that a drop-in, not a rebuild.
