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

## Real-world example: public-apis

`src/examples/public-apis/` drives the loop against a curated slice of real
entries from [public-apis/public-apis](https://github.com/public-apis/public-apis)
(all no-auth, HTTPS). The `HttpAgent` is real — it calls endpoints with `fetch`,
governed by the harness: a timeout rule, a follow-redirects rule, a
retry-on-429 rule, and the `maxToolCalls` attempt budget. Failures cluster by
their real HTTP cause and the gate tunes the harness accordingly.

```bash
bun run --filter @hyperframes/self-harness demo:apis         # heuristic proposer
bun run --filter @hyperframes/self-harness demo:apis:model   # model proposes the rules
```

`demo:apis:model` runs the same loop with the `ModelProposer`, so the model
itself authors each harness rule (offline via a deterministic scripted
stand-in; drop in `AnthropicModel` to have a live model propose them). Every
committed patch is then a `model-patch`, not a heuristic one.

```
── round 1 — pass rate 33% ──   cluster: "request-timeout" × 2
  gate http-patch-1: rejected: no net improvement (nothing newly passing)
  ✓ committed http-patch-2: + rule: timeout-ms=2000
── round 2 — pass rate 56% ──   cluster: "http-429-no-retry" × 2
  gate http-patch-3: rejected: regressed 1 passing task(s): rest-countries
  ✓ committed http-patch-4: + rule: retry-on-429
── round 3 — pass rate 78% ──   ✓ committed http-patch-5: + rule: follow-redirects
pass rate: 33% → 100%   fingerprint: [timeout-ms=2000, retry-on-429, follow-redirects]
```

Both gate rejections are real: a candidate that raises the timeout too little
(no improvement), and a retry fix that also clamps `maxToolCalls` and would
starve the one paged endpoint (regression). Because outbound network in most
sandboxes is locked down, the demo defaults to a **recorded** HTTP client that
replays each endpoint's behavior deterministically; swap in `FetchHttpClient`
(or `runPublicApiDemo({ live: true })`) to run the identical loop live:

```ts
import {
  HttpAgent,
  FetchHttpClient,
  HttpHeuristicProposer,
  buildPublicApiSuite,
  selfHarness,
  defaultHarness,
} from "@hyperframes/self-harness";

await selfHarness({
  agent: new HttpAgent(new FetchHttpClient()), // real fetch against live APIs
  proposer: new HttpHeuristicProposer(),
  tasks: buildPublicApiSuite(),
  initialHarness: defaultHarness(),
});
```

## Real-world example: Bruno collections

`src/examples/bruno/` turns a real [Bruno](https://github.com/usebruno/bruno)
collection into a Self-Harness task suite. Bruno stores each API request as a
`.bru` file with an `assert` block — and that `assert` block _is_ a task
verifier. So a collection a developer already wrote becomes the loop's tasks and
their success criteria, with no extra work.

```bash
bun run --filter @hyperframes/self-harness demo:bruno   # offline (recorded client)
```

```
loaded 6 request(s) from the Bruno collection:
  GET Agify — 3 assertion(s)   GET Cat Facts — 3 assertion(s)   ...
── round 1 — 50% ──  ✓ committed: + rule: timeout-ms=2000
── round 2 — 67% ──  gate rejected: regressed rest-countries → committed: + rule: retry-on-429
── round 3 — 83% ──  ✓ committed: + rule: follow-redirects
pass rate: 50% → 100%
```

What ships:

- `bru-parser.ts` — a real `.bru` parser (block tokenizer with brace matching, so
  JSON bodies and disabled `~entries` parse correctly).
- `assertions.ts` — parses and evaluates `assert` expressions
  (`res.status: eq 200`, `res.body.name: isDefined`, nested/indexed paths,
  `eq`/`gt`/`contains`/… operators) against a response.
- `environment.ts` — parses a `.bru` environment's `vars` and interpolates
  `{{var}}` (the demo's Agify request resolves `{{name}}` from `demo.bru`).
- `collection.ts` — loads every `.bru` request under a directory and maps each to
  a task whose `check` runs its assertions.

The `HttpAgent` gains an `envelope` mode so the response's real HTTP status
reaches the assertions (`res.status: eq 200`). Point `loadBrunoCollection` at any
Bruno collection on disk to tune a harness against your own requests.

## Real-world example: data-science projects

`src/examples/data-science/` turns a curated catalog of 31 beginner/portfolio
data-science projects (drawn from
[tkarim45/Beginner-Data-Science-Projects](https://github.com/tkarim45/Beginner-Data-Science-Projects)
and similar corpora, across four difficulty levels) into a task suite. Each
project is a task — the objective is the prompt, a **metric threshold is the
verifier** — and the recurring DS pitfalls become the harness rules the loop
learns:

| Failure cluster    | Learned harness rule           |
| ------------------ | ------------------------------ |
| `data-leakage`     | `fit-transforms-on-train-only` |
| `non-determinism`  | `seed-everything`              |
| `unhandled-nan`    | `handle-missing-values`        |
| `class-imbalance`  | `handle-class-imbalance`       |
| `runaway-training` | `use-early-stopping`           |

It uses the outer `loop-runner` to grow the suite one difficulty tier at a time
— Level 1 → 4. Rules learned on Level 1 **transfer**: harder projects that share
a pitfall pass the moment they're added, and only genuinely new pathologies cost
a new rule. The heavy deep-learning projects (which legitimately need a large
compute budget) are what force the gate to reject the runaway-training fix that
would clamp `maxToolCalls`.

```bash
bun run --filter @hyperframes/self-harness demo:ds
```

```
iteration 1: +0 tasks, pass 27% → 100%, learned [fit-transforms-on-train-only, seed-everything, handle-missing-values]
iteration 2: +9 tasks, pass 85% → 100%, learned [handle-class-imbalance]
iteration 3: +6 tasks, pass 92% → 100%, learned [use-early-stopping]
iteration 4: +5 tasks, pass 100% → 100%, learned [-]   ← Level 4 passes on arrival: the rules generalize
iteration 5: converged → 5-rule "DS-agent" harness fingerprint
```

The behavior is modeled deterministically so it runs offline; the same suite
drives a real notebook-executing agent where Python + Jupyter are available.

**Agentic agent path.** `AgenticDsAgent` (inspired by
[K-Dense-AI/agentic-data-scientist](https://github.com/K-Dense-AI/agentic-data-scientist))
is a real, staged, **model-governed** agent: it walks the DS workflow
(`load → clean → feature → resample → split → train → evaluate`) and, at the
stage where a pitfall lives, asks a model whether it will apply the relevant
practice — reading the harness's rules from its own system prompt. So the
harness literally steers a model-driven pipeline, and the same failure signals
flow into the loop. Offline it runs on `RuleAwareModel` (a deterministic
stand-in that follows the rendered rules); drop in `AnthropicModel` for a live
agent.

```bash
bun run --filter @hyperframes/self-harness demo:ds:agentic
```

**Rule-creator path.** By default a `DsHeuristicProposer` maps each cluster to a
known best practice. Swap it for the `ModelProposer` and the model itself
_authors_ the rule from the failure cluster — the loop goes from a rule _runner_
to a rule _creator_, with the regression gate validating every rule the model
writes. Offline it uses `dsScriptedModel` (a deterministic stand-in); drop in
`AnthropicModel` for a live model.

```bash
bun run --filter @hyperframes/self-harness demo:ds:model   # model writes the rules
# combine: --agentic --model → a model-governed agent whose rules a model also authors
```

**Committee path.** `CommitteeProposer` puts every proposed edit before a
three-voice panel before the gate sees it — inspired by
[SR-Scientist](https://github.com/GAIR-NLP/SR-Scientist),
[R&D-Agent](https://github.com/microsoft/RD-Agent), and
[DR-Venus](https://github.com/inclusionAI/DR-Venus):

| Judge            | Voice        | What it checks                                                                       |
| ---------------- | ------------ | ------------------------------------------------------------------------------------ |
| `EmpiricalJudge` | SR-Scientist | **Runs** the candidate; vetoes anything with no measurable gain or a regression      |
| `ArchitectJudge` | R&D-Agent    | Structure/scalability — a declarative rule is clean, a hard compute clamp is a smell |
| `EconomistJudge` | DR-Venus     | Resource cost — cheap edits score high; raising the budget is expensive              |

The gate guarantees _correctness_; the committee raises the bar to
_Pareto-optimal_ (proven, clean, cheap). A candidate is accepted only with no
veto and an average ≥ 7.5, and every verdict is written to a `renderCourtRecords`
markdown log.

```bash
bun run --filter @hyperframes/self-harness demo:ds:committee
```

```
## ds-patch-5 (runaway-training) — VETOED, avg 4.0
- SR-Scientist (empiricist): 0/10 · VETO — regresses 26 passing project(s)
- R&D-Agent (architect):     4/10 · VETO — clamps the compute budget, won't scale
- DR-Venus (economist):      8/10 — caps compute — cheap to run          ← the Pareto tension
## ds-patch-6 (runaway-training) — ACCEPTED, avg 8.7  (the clean early-stopping rule)
```

**Refining path.** The committee _rejects_ a bad edit; `RefiningModelProposer`
makes the model _learn_ from the rejection. It is the feedback edge the plain
`ModelProposer` lacks: a rejected candidate no longer just dies. The proposer
treats the regression gate as an **oracle** — it proposes, gate-checks the
candidate itself, and on rejection hands the model the exact reason (which
passing tasks it broke) and asks for a tighter edit, up to `maxAttempts` rounds.
The loop's own gate still has the final say on what is committed.

```bash
bun run --filter @hyperframes/self-harness demo:ds:refine
```

```
## runaway-training · attempt 1 — REJECTED
- proposed: [{"op":"setLimit","key":"maxToolCalls","value":3}]
- gate: rejected: regressed 26 passing task(s): boston-house-prices, …
## runaway-training · attempt 2 — ACCEPTED          ← the model self-corrected
- proposed: [{"op":"addRule","text":"use-early-stopping"}]
- gate: accepted: +1 passing, 0 regressions
```

Every other pattern is fixed on the first attempt — refinement only kicks in when
the gate actually pushes back. Swap the offline `refiningDsScriptedModel()` for
`new AnthropicModel()` (`--refine --live`) to have a live model do the
self-correction from the same rejection feedback.

## Real-world example: OSINT recon compliance

`src/examples/osint/` takes a public OSINT tool map (email / username / domain /
IP / phone / social-media tools like holehe, sherlock, Maigret, Unfurl) and runs
the **same loop against a completely different rule domain**. The pathologies here
are not modeling mistakes — they are the operational-security and compliance
failures an _authorized_ recon agent must learn to avoid, each mapping to a
minimal harness **guardrail**:

| Failure cluster          | Learned guardrail            |
| ------------------------ | ---------------------------- |
| `out-of-scope`           | `check-authorization-scope`  |
| `rate-limit-abuse`       | `respect-rate-limits`        |
| `pii-exposure`           | `minimize-and-redact-pii`    |
| `unverified-attribution` | `corroborate-across-sources` |
| `no-provenance`          | `record-source-provenance`   |

The point is that **one loop learns two utterly different rule domains** — DS
best-practices _and_ recon guardrails — with no change to the engine: the
framework is domain-agnostic. The Pareto tension transfers too. A naive "throttle
every source" guardrail stops the rate-limit abuse but **regresses every
legitimate multi-source lookup**, so the gate rejects it and forces the clean
`respect-rate-limits` rule. Safety edits are still edits.

```bash
bun run --filter @hyperframes/self-harness demo:osint
```

```
  gate rejected an over-broad guardrail: it would regress 8 in-scope lookup(s)
safe-conduct rate: 32% → 100%
learned guardrails: record-source-provenance, check-authorization-scope, respect-rate-limits, minimize-and-redact-pii, corroborate-across-sources
query budget preserved: maxToolCalls = 1000
```

**Compliance-Officer committee.** `demo:osint:committee` reviews every proposed
guardrail with a two-voice panel: the `EmpiricalJudge` (does it work, no
regression?) and a `ComplianceJudge` — a **Compliance Officer** that rewards
edits strengthening the privacy/authorization posture and **vetoes any edit that
raises the query budget** (more budget = more data collected on individuals). The
two are in honest tension: the Officer _endorses_ the throttle-everything
candidate ("collects less") that the Empiricist _vetoes_ for breaking legitimate
lookups — so only a targeted guardrail satisfies both.

> This example models compliance **outcomes** deterministically and performs no
> real lookups. It is the inverse of the invasive tools in the source map: it
> teaches the tradecraft/ethics rails (stay in scope, throttle, minimize PII,
> corroborate, keep provenance) that keep recon lawful. A real drop-in wires each
> probe to authorized tooling behind the very guardrails the loop learns here.

## The system: an AI-ready company brain

`src/examples/company-brain/` is the largest example — the whole three-layer
"AI-ready company" blueprint, end to end and offline, with the Self-Harness loop
as its spine:

```
sources ─▶ INGEST ─▶ the company brain ─▶ operating system ─▶ you approve ─▶ results
(md)      tag +      wiki + search       Self-Harness learns   review        write back
          cross-link (one memory)        the playbooks, gated                 ↺ compounds
```

- **Layer 1 — sources** (`sources.ts`): calls / chats / docs / transcripts. `ingest.ts` tags each and binds them by shared tags into a cross-linked wiki.
- **Layer 2 — warehouse** (`warehouse.ts`): the numbers, behind a `Warehouse` interface — in-memory offline, SQLite/Postgres as a drop-in.
- **The brain** (`brain.ts`): sources + data as one searchable memory. `search()` is lexical offline; the `Retriever` interface takes an embeddings drop-in. Agents `context(vertical)` it before acting; results `writeBack()` into it.
- **Layer 3 — operating system**: an `Orchestrator` routes each vertical (SEO / CONTENT / PR / PAID / CRO) to its specialist `CompanyAgent`, which reads the brain and acts under the harness.

The point is what makes the diagram's "results write back, it compounds" arrow
**safe**. Naive write-back lets any result mutate the brain; here the Self-Harness
**regression gate** is the spine — a playbook only compounds if it breaks nothing.
The SEO cluster's aggressive candidate lifts organic sessions by stuffing
keywords, which **regresses the CONTENT vertical's brand voice**, so the gate
rejects it and forces the clean, targeted playbook.

```bash
bun run --filter @hyperframes/self-harness demo:brain
```

```
INGEST: 6 sources → brain (10 cross-links)
OPERATING SYSTEM: Self-Harness learns the playbooks (regression-gated)
  gate rejected an aggressive SEO edit: it would regress content
  performing verticals: 20% → 100%
  learned playbooks: target-intent-keywords, lead-with-the-proof, cap-cac-to-ltv, test-one-change-at-a-time
YOU review + approve; approved deliverables file back into the brain:
  ✓ ship seo … ✓ ship content … ✓ ship pr … ✓ ship paid … ✓ ship cro
BRAIN COMPOUNDED: 6 → 10 pages   organic-sessions 0.4 → 0.9,  roas 0.5 → 0.85, …
```

Everything real is behind an interface (`Warehouse`, `Retriever`), so the offline
deterministic run and a live drop-in (SQLite + embeddings + LLM specialists)
share one pipeline — the same contract every other example holds.

## Real-world example: TinyRouter (learned, gated routing)

`src/examples/router/` reproduces the [TinyRouter](https://github.com/harrrshall/tinyrouter)
idea — a tiny model that routes each question to the specialist that fits it,
beating any single model by smart routing — with one twist: **the router's whole
policy is a harness the Self-Harness loop learns and regression-gates.**

Every other example gates the agent's _capability_; this one gates the _dispatch
decision_, which brings a failure mode none of the others have — **misrouting**.
The gate tension is a greedy catch-all: `route:*=math-pro` fixes the math
questions but **misroutes the knowledge questions** the generalist was already
answering, so the gate rejects it and forces the targeted `route:math=math-pro`.

```bash
bun run --filter @hyperframes/self-harness demo:router
```

```
roster: Generalist, Math specialist, Code specialist, Reasoning specialist
best single model: Generalist at 25%
  gate rejected a greedy catch-all route: it would misroute know-1, know-2, know-3, know-4
router accuracy: 25% → 100%
learned routing policy: route:math=math-pro, route:code=code-pro, route:reasoning=reason-pro
the tiny router (3 routing rules) beats the best single model, 100% vs 25% — smart routing, not brute force
```

The whole "intelligence" of the router is three learned routing rules — and each
one is regression-gated, so learning to route one domain provably never misroutes
a domain that already worked. A real drop-in routes to actual models behind the
same policy.

**On real data.** `demo:router:real` runs the router over **160 real problems**
vendored from public benchmarks — [HumanEval](https://github.com/openai/human-eval)
(code, MIT), [GSM8K](https://github.com/openai/grade-school-math) (math, MIT), and
[BIG-bench](https://github.com/google/BIG-bench) logical-fallacy detection
(reasoning) and general-knowledge (knowledge), both Apache-2.0. The router
**classifies each problem from its text** (a deterministic keyword classifier
offline; an embeddings/LLM classifier as a drop-in) and routes on that
prediction — so a misclassification is a real misroute, not a pre-tagged lookup.

```bash
bun run --filter @hyperframes/self-harness demo:router:real
```

```
160 real problems (HumanEval, GSM8K, BIG-bench), classified from text and routed
  code       40/40 routed correctly
  math       40/40 routed correctly
  reasoning  39/40 routed correctly
  knowledge  24/40 routed correctly
router accuracy:      89%  (143/160)
best single model:    25%  (Code specialist alone)
honest misroutes (17) — where the keyword classifier collides:
  bbench-know-1    knowledge → math      ("How many legs do horses have?")
the tiny router beats the best single model on real data, 89% vs 25%
```

This is deliberately **not** a suspicious 100%: the knowledge set overlaps math
("How many legs…" scores on the math features), so the keyword classifier
genuinely misroutes 17 of 160 — and those failures are printed, not hidden.

**A no-API learned classifier.** You don't need a key to beat the keyword rule —
`BayesClassifier` is a multinomial Naive Bayes model that **trains on the problems
themselves** (no network, no API) and is evaluated **held-out** (5-fold, no
leakage), so the number is honest:

```bash
bun run --filter @hyperframes/self-harness demo:router:real:bayes
```

```
Naive Bayes, trained on the data, 5-fold held-out (no leakage):
  code 40/40   math 35/40   reasoning 37/40   knowledge 37/40
Naive Bayes (no API):   93%  held-out  (149/160)
keyword classifier:     89%  hand-tuned
best single model:      25%  (Code specialist alone)
```

The learned model lifts **knowledge from 24/40 → 37/40**: weighing every word, it
reads `legs`/`horses`/`have` as knowledge where the keyword rule sees only "how
many" → math. A leave-one-out test confirms it on a genuinely held-out "How many
legs…" item — the collision resolved with **zero API dependency**.

**The API drop-in too.** `ModelClassifier` implements the same `DomainClassifier`
interface with a real LLM (`demo:router:real:live`, needs `@anthropic-ai/sdk` + a
key); an oracle test shows the router hits **100%** with a perfect classifier, so
the remaining gap is purely classifier quality. Three classifiers, one interface:
keyword (deterministic default), Naive Bayes (no-API learned), LLM (live).

## Real-world example: technical analysis

`src/examples/technical-analysis/` runs the loop over **real AAPL prices** (506
daily closes, 2015–2017, vendored from Plotly's public finance dataset). The
indicators are the real thing — Wilder RSI, EMA-based MACD, SMA cross, Bollinger
Bands — computed deterministically on the price series, and each trading scenario
is a window whose pattern is **verified against that exact indicator code** (a
test re-asserts, e.g., that the "overbought" window really reads RSI > 70). So the
labels come from real readings, not invented ones.

Under the naive harness the agent chases every move; the loop learns one indicator
rule per pattern. The gate tension is over-fitting: for the momentum cluster the
proposer offers a `chase-momentum` rule that buys on any positive MACD — right for
momentum setups, but it **buys the calm/overbought days too**, regressing a
setup that already read correctly. The gate rejects it.

```bash
bun run --filter @hyperframes/self-harness demo:ta
```

```
506 daily closes (2015-02-17 → 2017-02-16)
  gate rejected 'chase-momentum': it would buy the overbought setup(s) neutral-40
correct calls: 30% → 100%
learned indicator rules: use-bollinger-breakout, use-macd-confirmation, respect-rsi-overbought, use-trend-cross
```

Same loop, a sixth domain — the "harness" here is a set of **indicator rules**,
and the fingerprint it converges to is exactly the disciplined TA a trader would
codify. A real drop-in swaps the vendored series for a live OHLC feed behind the
same `number[]` shape.

## Real-world example: the LLM cost-router (the money one)

`src/examples/cost-router/` points the same loop at a spend problem: a mixed LLM
workload (faq, classify, summarize, extract, code, reason, analyze) over four
model tiers (nano → haiku → sonnet → opus) priced from a representative list.
Quality is a step function of capability — a request is served acceptably iff its
tier clears the class's minimum viable tier. The **harness _is_ the routing
policy**: one `route:<class>:<tier>` rule per class.

The cautious default every team reaches for — send _everything_ to the top tier
so nothing under-performs — is the single most expensive way to run the workload.
The loop starts cost-greedy instead (unrouted classes fall to haiku), clusters
the under-served classes, and learns the **cheapest tier that still clears
quality** for each. The gate tension is the obvious "cut the bill" move: for the
busiest cluster the proposer offers a `force-cheapest-tier` rule that slams the
whole workload onto the cheapest tier. It does cut cost — and it under-serves
every class already routed correctly, so the gate rejects it. Cutting cost by
breaking quality is disqualified.

```bash
bun run --filter @hyperframes/self-harness demo:cost
```

```
  gate rejected 'force-cheapest-tier': it under-serves 12 already-correct requests
quality (served acceptably): 52% → 100%
learned routes: route:code:sonnet, route:extract:sonnet, route:reason:opus, route:analyze:opus
cost per batch — all-opus: $1.26   learned: $0.63
saved per batch: $0.63 (50% of the bill), same 100% quality
projected monthly saving @ 1M requests: $27289.13
```

The payoff is money, not a pass rate: **identical quality to the all-opus default,
at roughly half the spend** — and the gate is exactly what makes that safe to
sell, since it certifies no downgrade ever regressed a request. `reason` and
`analyze` correctly _stay_ on opus (no phantom savings). The delta is the recurring
bill you cut, and the number a "share of the savings" contract is written against.
A real drop-in swaps the token-profile quality oracle for live model calls behind
the same `Routing` interface.

### Turning the savings into revenue

Saving a customer money is a _product_; charging for it is the _business_.
`billing.ts` is the revenue layer on top of the router — you resell the ~50%
savings and keep a share. Here the harness is the **pricing policy** (one
`price:<segment>:<rate>` rule per segment) and the failures the loop clusters are
**lost accounts**: a customer churns when the take-rate exceeds the share of
savings its segment will happily pay. The gate protects retained revenue, so the
greedy "grab the maximum from everyone" move — which pumps revenue-per-deal but
churns the book — is rejected. Pricing you can't keep isn't revenue.

```bash
bun run --filter @hyperframes/self-harness demo:money
```

```
  gate rejected 'maximize-take-rate': it churns 1 account(s) already won
retained accounts: 1/10 → 10/10
learned pricing: price:startup:0.2, price:midmarket:0.3
MRR — naive flat pricing: $28,654   learned pricing: $44,208
ARR — naive: $343,843   learned: $530,501
revenue the loop unlocked: $15,555/mo ($186,658/yr)
```

A naive flat take-rate retains only the one enterprise account (tolerant of a
higher cut) and churns the other nine. The loop learns a fair price per segment
and retains the whole book — lifting ARR from ~$344k to ~$531k — while the gate
stops the greedy 0.9 take-rate that would churn even the enterprise back toward
zero. The MRR figures are grounded in the router's _real_ per-request savings
(`billing.ts` derives them from `savingsReport`), so this is the same loop, one
more domain: the "harness" is your price sheet, and the fingerprint it converges
to is the segmented pricing a disciplined founder would land on.

## Real-world example: the self-correcting MCP node

`src/examples/mcp-node/` is what makes the cost-router survive a real, messy
enterprise: a **self-correcting MCP node**. A standard [MCP](https://modelcontextprotocol.io)
node breaks when a database renames a field (schema drift), an API wants a
different argument format, or a tool rate-limits. The common blueprint answer is a
"reflection & repair" loop that pays a fast LLM to re-fix each broken call at
runtime — _forever_. This node does better: it repairs, then **promotes the
recurring repair into a permanent, gated rule**, so the next thousand calls are
handled for free. The harness _is_ the learned repair set (`map:*` renames,
`coerce:*` format fixes, `backoff:*` rate-limit rules).

The gate is what makes auto-repair safe. The tempting blanket fix — "429? just
retry everything" — is a `retry:all` rule that re-executes _every_ call. Harmless
for an idempotent read; but it **double-executes a payment charge**. The gate
rejects it because it regresses the charge guard. A self-healing loop _without_ the
gate ships the double-charge.

```bash
bun run --filter @hyperframes/self-harness demo:mcp
```

```
  gate rejected 'retry:all': it double-executes charge-guard (a charge)
calls handled correctly: 33% → 100%
learned repairs (now free, no per-call LLM fix): map:user:userId, coerce:date:iso-date, backoff:orders.search
```

This is the reliability layer the [10,000+ public MCP servers](https://modelcontextprotocol.io)
all need and none ship: the same regression-gated loop, pointed at live tool
traffic, turning per-call LLM repairs into free learned rules while _certifying_ it
never double-executes a write. A live drop-in swaps `callTool` for a real MCP
`CallToolRequest` and keeps a runtime repairer only for the novel long tail.

### The public MCP ecosystem as growth data

Rather than build a ninth self-healing server to compete in a crowded field,
`scorecard.ts` turns the ecosystem into a funnel. It statically analyzes a server's
**public tool manifest** (the `tools/list` schema anyone can fetch) for the exact
risks the node fixes — a non-idempotent mutation (double-charge on retry), a
free-form object arg (schema drift), a format-sensitive string with no constraint,
no documented rate limits — and grades it. It scrapes nothing and fabricates no
runtime data; it's a linter for MCP reliability over public schemas.

```bash
bun run --filter @hyperframes/self-harness demo:scan
```

```
  [D]  payments-mcp  (risk 6)
       • [unsafe-retry] charge.create: mutation with no idempotency key — a blind retry double-executes
       • [format-ambiguity] charge.create: 'amount' looks format-sensitive but is an unconstrained string
  [A]  well-built-mcp  (risk 0)

State of MCP Reliability — 5 servers scanned
  grades: A:1  B:2  C:0  D:2  F:0
  2/5 carry an unsafe-retry risk (a write that double-executes on blind retry)
```

One scan is a **free lead magnet** (the visibility wedge, for reliability); the
aggregate is a **"State of MCP Reliability" report** (content that positions you as
the authority); and every low grade is a **prospect** who needs exactly what the
node ships.

The discovery half is **live and real**. `registry.ts` pages the actual public MCP
registry (`registry.modelcontextprotocol.io/v0/servers`) and grades each server's
_deploy readiness_ from the metadata that's really there — installable? source
auditable? active? documented? A vendored **real snapshot** keeps the demo offline
and deterministic; `--live` pulls fresh.

```bash
bun run --filter @hyperframes/self-harness demo:registry          # vendored real snapshot
bun run --filter @hyperframes/self-harness demo:registry -- --live # live pull
```

```
State of the MCP Registry — 62 servers (deduped to latest)
  grades: A:36  B:25  C:1  D:0  F:0
  installable: 98% · with source repo: 61% · active: 100%
  reachable (active + a remote endpoint): 52/62
Biggest readiness gaps across the registry:
  24 servers — no source repository to audit
```

The registry list gives metadata, not per-tool schemas — so the readiness scan is
honest about what it can see, and the **reachable** servers become the discovery
list that feeds the deep, arg-level reliability scan (`demo:scan`) once each one's
`tools/list` is pulled. Real data, real growth loop, no fabricated scores.

### The deep scan: real `tools/list`, real schemas

`mcp-client.ts` is a real MCP streamable-http client — it runs the protocol
handshake (`initialize` → `notifications/initialized` → `tools/list`) and returns a
server's actual tool schemas (JSON-Schema `inputSchema` + the 2025 tool annotations
`readOnlyHint` / `destructiveHint` / `idempotentHint`). `deep-scan.ts` maps those into
the grader and scores real risks: a **destructive tool with no idempotency hint** is
the double-charge exposure, a **free-form object arg** is drift, an **unconstrained
format-sensitive arg** is coercion bait.

```bash
bun run --filter @hyperframes/self-harness demo:deep           # grade real-shape schemas
bun run --filter @hyperframes/self-harness demo:deep -- --live # pull from real endpoints
```

```
  [D]  payments-mcp  (risk 6)
       • [unsafe-retry] charge.create: mutation with no idempotency key — a blind retry double-executes
  [A]  search-mcp  (risk 0)
Deep reliability across 4 servers — grades A:1  B:1  C:0  D:2  F:0
  2 carry an unsafe-retry risk (a destructive tool with no idempotency hint — the double-charge)
```

The client is genuinely functional against any open MCP endpoint (the protocol
handshake and SSE framing are unit-tested through an injected `fetch`). Inside a
locked-down network the endpoints 403 and `--live` reports true coverage — `reached
0/5` — rather than faking it; the default demonstrates the grader on representative
real-shape tool lists so the pipeline is provable offline. This is the report that
names real servers with real risks, from actual schemas — the content and the lead
list the whole growth loop was built to produce.

## The outer loop (`loop-runner`)

`selfHarness()` runs one _campaign_ of improvement rounds over a fixed suite.
`runSelfHarnessLoop()` wraps it into an outer, self-pacing loop that maps 1:1
onto the six-part loop-engineering anatomy — and closes the framework's biggest
gap versus that model: a **persistent markdown memory** (`renderMemory` emits the
`progress.md` the loop guide prescribes).

| Loop anatomy   | In `runSelfHarnessLoop`                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| **Trigger**    | the outer `for` loop that repeats campaigns until a stop rule                                                |
| **Execution**  | each iteration calls `selfHarness()` on the current suite                                                    |
| **Verifier**   | reused as-is — the regression gate inside `selfHarness`                                                      |
| **Stop Rules** | explicit: `shouldStop` predicate → converged (`convergenceRounds` quiet iterations) → `maxIterations` budget |
| **Memory**     | the accumulated harness + `renderMemory()` progress markdown                                                 |
| **Skills**     | the learned `rules[]`, carried forward as the next iteration's start                                         |

```bash
bun run --filter @hyperframes/self-harness demo:loop
```

```
# Self-Harness Loop — progress.md
**Stopped because:** converged   **Iterations:** 4   **Learned rules (skills):** 2
### Iteration 1  tasks run: 2 (added: explore-audit)  pass 50% -> 100%  + rule: Stop exploring …
### Iteration 2  tasks run: 3 (added: env-token)      pass 67% -> 100%  + rule: Persist env …
### Iteration 3  (no change)  made progress: false
### Iteration 4  (no change)  made progress: false → converged
```

`growSuite(iteration, harness)` lets each iteration introduce new tasks to
harden against; the loop tunes the carried-forward harness until nothing new is
learned for `convergenceRounds` iterations. A `shouldStop` predicate and a
`maxIterations` budget bound it explicitly.

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

| File                           | Responsibility                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `types.ts`                     | Core interfaces (`Harness`, `Task`, `Agent`, `Proposer`, `Model`, `PatchOp`)        |
| `harness.ts`                   | Harness defaults, `applyPatch`, `diffHarness`, `patchSize`                          |
| `runner.ts`                    | Run an agent over a task suite                                                      |
| `cluster.ts`                   | Group failures into recurring patterns                                              |
| `proposer.ts`                  | `HeuristicProposer` + `ModelProposer` (+ `parseOps`)                                |
| `refining-proposer.ts`         | `RefiningModelProposer` — re-proposes using the gate's rejection as feedback        |
| `gate.ts`                      | The regression acceptance criterion                                                 |
| `loop.ts`                      | The orchestrator (`selfHarness`)                                                    |
| `agents/`                      | `SimulatedAgent` (deterministic world) + `LlmAgent` (real)                          |
| `models/`                      | `ScriptedModel` (offline) + `AnthropicModel` (real)                                 |
| `demo/`                        | The runnable pathology suite + `runDemo`                                            |
| `examples/public-apis/`        | Real `HttpAgent` over public-apis endpoints (recorded + live clients)               |
| `examples/bruno/`              | Parse a Bruno `.bru` collection → tasks; `assert` blocks become verifiers           |
| `examples/data-science/`       | 31 curated DS projects → level-graded suite; DS pitfalls → harness rules            |
| `examples/osint/`              | OSINT tool map → recon compliance guardrails (+ Compliance-Officer judge)           |
| `examples/company-brain/`      | Three-layer "AI-ready company": sources → brain → gated operating system            |
| `examples/router/`             | TinyRouter: a tiny router whose routing policy the loop learns and gates            |
| `examples/technical-analysis/` | Real AAPL prices → RSI/MACD/Bollinger; the loop learns gated TA rules               |
| `examples/cost-router/`        | LLM cost-router: learns the cheapest safe model tier per class; gated on quality    |
| `examples/cost-router/billing` | Revenue layer: resell the savings, learn gated per-segment pricing → retained MRR   |
| `examples/mcp-node/`           | Self-correcting MCP node: promotes drift/format/rate-limit repairs into gated rules |
