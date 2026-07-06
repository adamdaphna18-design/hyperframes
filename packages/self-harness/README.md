# @hyperframes/self-harness

A small, runnable framework for **Self-Harness optimization**: let an agent run a
suite of tasks, cluster its own recurring failures, propose _minimal_ edits to
its own harness (system prompt, behavioral rules, guardrails), and gate every
edit behind a regression check before accepting it.

The premise: most of us don't train base models — the leverage we have is the
**harness**, the layer wrapping the model. This package makes that layer a
mutable, optimizable artifact, and implements the loop that lets a model improve
its own harness from its own failure logs. A patch that fixes one task but breaks
a task that already worked is **rejected**, even if the aggregate score goes up.
That acceptance criterion is what keeps the loop from collapsing.

## The loop

```
run suite ─▶ cluster failures ─▶ propose minimal edits ─▶ regression gate ─▶ commit
   ▲                                                                             │
   └─────────────────────────── repeat until clean / stuck ──────────────────────┘
```

1. **Run** the agent over the task suite → pass/fail + trajectories.
2. **Cluster** the failures by recurring signal (largest cluster first).
3. **Propose** candidate harness edits for the top cluster (heuristic, or the
   model editing itself).
4. **Gate** each candidate: apply it, re-run the suite, accept **only** if it
   makes ≥1 failing task pass **and regresses nothing**.
5. **Commit** the first candidate that passes the gate; repeat.

The final harness is a _fingerprint_ of exactly which pathologies this agent
tripped over.

## Quick start

```bash
bun install
bun run --filter @hyperframes/self-harness demo   # offline, deterministic
bun run --filter @hyperframes/self-harness test
```

The demo starts from a naive harness and drives a mixed suite from a 25% to a
100% pass rate. It reproduces the paper's phenomenon end-to-end with **no
network** — including the regression gate rejecting an over-aggressive edit
before accepting a sound one:

```
── round 1 — pass rate 25% ──
  cluster: "runaway-exploration" × 2 (explore-audit, explore-report)
  gate patch-1: rejected: regressed 2 passing task(s): healthy-deploy, healthy-migrate
  gate patch-2: accepted: +2 passing, 0 regressions
  ✓ committed patch-2: limit maxToolCalls: 1000 -> 50; + rule: Stop exploring …
...
pass rate: 25% → 100%
final harness limits: {"maxToolCalls":50,"avoidRepeatedFailures":true,"persistEnvAcrossSessions":true}
```

## The three modeled pathologies

The offline world models the three fixes different models made to themselves in
the Self-Harness experiment — each is a real seam in the default harness:

| Pathology                 | Harness seam                         | The fix the loop discovers              |
| ------------------------- | ------------------------------------ | --------------------------------------- |
| `runaway-exploration`     | `maxToolCalls` effectively unbounded | cap tool-call loops                     |
| `repeated-failed-command` | failed commands may repeat           | don't re-run a failed command unchanged |
| `lost-env-var`            | env not persisted across sessions    | persist environment between sessions    |

`healthy` tasks (which legitimately need many tool calls) exist so the regression
gate has something to protect — an over-aggressive `maxToolCalls: 3` fixes the
runaway tasks but regresses the healthy ones, and the gate catches it.

## Wiring your own

Every piece is an interface. The offline demo uses `SimulatedAgent` +
`HeuristicProposer`; the real path swaps in an LLM-backed agent and lets the
**same model** propose edits to its own harness.

```ts
import {
  selfHarness,
  defaultHarness,
  ModelProposer,
  LlmAgent,
  AnthropicModel,
} from "@hyperframes/self-harness";

const model = new AnthropicModel({ model: "claude-opus-4-8" }); // needs @anthropic-ai/sdk
const result = await selfHarness({
  agent: new LlmAgent(model), // solves tasks under the harness
  proposer: new ModelProposer(model), // the model edits its own harness
  tasks: myTasks, // Task[] with your own verifiers
  initialHarness: defaultHarness(),
});
```

`AnthropicModel` loads `@anthropic-ai/sdk` lazily, so the core framework, the
tests, and the offline demo all run without it installed.

## Design

- **Harness as data.** `Harness` = system prompt + rules + typed limits + tools.
  Edits are serializable `PatchOp`s (`applyPatch` never mutates in place), so a
  patch is loggable, diffable, and measurably "minimal" (`patchSize`).
- **Pluggable everything.** `Agent`, `Proposer`, and `Model` are interfaces.
  Deterministic (`SimulatedAgent`, `HeuristicProposer`, `ScriptedModel`) and real
  (`LlmAgent`, `ModelProposer`, `AnthropicModel`) implementations share one loop.
- **The gate is the invariant.** `regressionGate` accepts a patch iff
  `newlyPassing > 0 && regressions === 0`. Net-positive is not sufficient.

## Module map

| File          | Responsibility                                                               |
| ------------- | ---------------------------------------------------------------------------- |
| `types.ts`    | Core interfaces (`Harness`, `Task`, `Agent`, `Proposer`, `Model`, `PatchOp`) |
| `harness.ts`  | Harness defaults, `applyPatch`, `diffHarness`, `patchSize`                   |
| `runner.ts`   | Run an agent over a task suite                                               |
| `cluster.ts`  | Group failures into recurring patterns                                       |
| `proposer.ts` | `HeuristicProposer` + `ModelProposer` (+ `parseOps`)                         |
| `gate.ts`     | The regression acceptance criterion                                          |
| `loop.ts`     | The orchestrator (`selfHarness`)                                             |
| `agents/`     | `SimulatedAgent` (deterministic world) + `LlmAgent` (real)                   |
| `models/`     | `ScriptedModel` (offline) + `AnthropicModel` (real)                          |
| `demo/`       | The runnable pathology suite + `runDemo`                                     |
