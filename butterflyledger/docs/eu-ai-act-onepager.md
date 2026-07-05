# ButterflyLedger × EU AI Act

## Tamper-evident agent logging for Regulation (EU) 2024/1689

**The clock:** the AI Act entered into force on 1 August 2024. The bulk of the
high-risk obligations — including record-keeping and log retention — apply from
**2 August 2026**. If you deploy AI systems in finance, healthcare, HR,
insurance, credit, or critical infrastructure (Annex III), your logging
obligations are no longer a roadmap item.

---

## The gap ButterflyLedger closes

The Act does not merely ask you to *have* logs. It asks for logs that can
support market-surveillance investigations, serious-incident reconstruction,
and conformity assessment — which means logs whose **integrity is defensible**.
A Splunk index or Postgres table is mutable by its owner; the first question in
any dispute is "who could have edited this?" ButterflyLedger's answer is
*nobody, and here is the mathematics*: every agent action is a transaction on
an append-only SHA-256 hash chain, signed with a zero-knowledge authorship
proof, sealed under proof-of-work, and validated by re-execution.

## Article mapping

| AI Act provision | Requirement (abridged) | ButterflyLedger capability |
| --- | --- | --- |
| **Art. 12 — Record-keeping** | High-risk AI systems must technically allow automatic recording of events (logs) over the system's lifetime, ensuring traceability appropriate to the intended purpose | The SDK's `wrapTool()` / callback handler records every tool call, decision and error automatically, with hashes of inputs/outputs and parent-run linkage for full trace reconstruction |
| **Art. 19 & Art. 26(6) — Log retention** | Providers and deployers must keep automatically generated logs (≥ 6 months, longer where other law requires) | Append-only chain with JSON snapshot export; deletion or edit of any historical record is cryptographically detectable at the exact block |
| **Art. 14 — Human oversight** | Systems must be designed so natural persons can effectively oversee them, including the ability to intervene or interrupt | On-chain policy contracts enforce hard limits (spend caps, permitted actions) *before* execution — oversight becomes a machine-enforced guarantee, and every enforcement decision is itself on the record |
| **Art. 15 — Accuracy, robustness, cybersecurity** | Protection against attempts to alter use, outputs or performance; logging resilient to tampering | SHA-256 avalanche chaining + Merkle roots + PoW sealing: one forged byte breaks validation at the tampered block ("butterfly cascade"); Schnorr proofs make action forgery equivalent to breaking discrete log |
| **Art. 73 — Serious-incident reporting** | Report serious incidents (deadlines as short as 2–15 days) with the information needed to investigate | `validate()` pinpoints the first divergent block; Merkle inclusion proofs let you hand an authority evidence of a specific action without disclosing the rest of the ledger |
| **Art. 72 — Post-market monitoring** | Systematically collect and analyse data on system behaviour in use | The chain *is* the dataset: complete, ordered, verifiable action history per agent identity |

## Privacy is built in, not bolted on

Regulators want traceability; your customers want confidentiality; GDPR wants
data minimisation. ButterflyLedger records **proof of action, not content**:
inputs and outputs land on-chain as SHA-256 hashes by default, sensitive values
as Pedersen commitments (perfectly hiding, selectively openable to an auditor
later). You can demonstrate *that* an action happened, *who* performed it and
*that policy allowed it* — without a data lake of raw prompts.

## Deployment fit

- Drop-in TypeScript SDK: wrap agent tools or attach the LangChain callback
  handler — no changes to agent logic.
- One demo, 60 seconds: policy deployed on-chain → violating transfer blocked
  before execution → chain sealed → tamper attempt caught
  (`bun run examples/finance-agent.ts`).
- Reference implementation is open source (MIT); production hardening path
  (elliptic curves, federated verification, managed retention) documented in
  the whitepaper.

## Honest scope

ButterflyLedger is technical infrastructure that *supports* AI Act compliance;
it does not by itself make a system compliant, and this document is not legal
advice. The ledger proves integrity and authorship of records — the semantic
accuracy of what an agent reports remains the responsibility of the recording
harness. Map your system's risk classification with counsel; bring us the
logging and enforcement requirements that fall out.

---

*ButterflyLedger — your AI acted. Prove it, without exposing it.*
