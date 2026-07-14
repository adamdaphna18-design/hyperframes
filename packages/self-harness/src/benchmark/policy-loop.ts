import { clusterFailures } from "../cluster.js";
import { regressionGate } from "../gate.js";
import { cloneHarness } from "../harness.js";
import { passingIds, runSuite } from "../runner.js";
import type { Agent, FailureCluster, Harness, HarnessPatch, Proposer, Task } from "../types.js";

/**
 * The three acceptance criteria under test:
 *  - `gated`        — ours: accept iff it breaks nothing AND fixes ≥1 (the moat).
 *  - `net-positive` — the market's optimizer criterion: accept iff it fixes more than it breaks.
 *  - `greedy-first` — a naive self-healer: apply the first fix offered, regressions be damned.
 */
export type AcceptancePolicy = "gated" | "net-positive" | "greedy-first";

interface Verdict {
  regressions: number;
  newlyPassing: number;
  index: number;
}

/** Whether a policy commits a candidate given its measured effect and its position in the list. */
export function accepts(policy: AcceptancePolicy, v: Verdict): boolean {
  if (policy === "gated") return v.regressions === 0 && v.newlyPassing > 0;
  if (policy === "net-positive") return v.newlyPassing > v.regressions;
  return v.index === 0 && (v.newlyPassing > 0 || v.regressions > 0); // greedy-first
}

export interface PolicyRunResult {
  policy: AcceptancePolicy;
  initialPassRate: number;
  finalPassRate: number;
  /** Tasks passing at baseline that the run ended up breaking. */
  regressions: number;
  /** Tasks failing at baseline that the run fixed. */
  fixed: number;
  safe: boolean;
}

/**
 * Run the self-harness loop under a given acceptance policy and measure the outcome
 * against the *original* baseline — including any working task the policy broke along
 * the way. The regression gate is reused purely as a measurement of each candidate's
 * effect; the policy decides whether to commit.
 */
export async function runWithPolicy(cfg: {
  agent: Agent;
  proposer: Proposer;
  tasks: Task[];
  initialHarness: Harness;
  policy: AcceptancePolicy;
  maxRounds?: number;
}): Promise<PolicyRunResult> {
  const { agent, proposer, tasks, policy } = cfg;
  const maxRounds = cfg.maxRounds ?? 30;
  let harness = cloneHarness(cfg.initialHarness);

  const baseline = await runSuite(agent, harness, tasks);
  const basePassing = passingIds(baseline);
  const stuck = new Set<string>();

  for (let round = 0; round < maxRounds; round++) {
    const before = await runSuite(agent, harness, tasks);
    if (before.failed === 0) break;
    const clusters = clusterFailures(before).filter((c) => !stuck.has(c.pattern));
    const cluster = clusters[0];
    if (!cluster) break;
    harness = await applyRound(agent, harness, proposer, cluster, tasks, before, policy, stuck);
  }

  const final = await runSuite(agent, harness, tasks);
  const finalPassing = passingIds(final);
  const regressions = [...basePassing].filter((id) => !finalPassing.has(id)).length;
  const fixed = [...finalPassing].filter((id) => !basePassing.has(id)).length;
  return {
    policy,
    initialPassRate: baseline.passRate,
    finalPassRate: final.passRate,
    regressions,
    fixed,
    safe: regressions === 0,
  };
}

async function applyRound(
  agent: Agent,
  harness: Harness,
  proposer: Proposer,
  cluster: FailureCluster,
  tasks: Task[],
  before: Awaited<ReturnType<typeof runSuite>>,
  policy: AcceptancePolicy,
  stuck: Set<string>,
): Promise<Harness> {
  const candidates: HarnessPatch[] = await proposer.propose(harness, cluster, before);
  for (let i = 0; i < candidates.length; i++) {
    const patch = candidates[i];
    if (!patch) continue;
    const decision = await regressionGate(agent, harness, patch, tasks, before);
    const verdict = {
      regressions: decision.regressions.length,
      newlyPassing: decision.newlyPassing.length,
      index: i,
    };
    if (accepts(policy, verdict)) {
      stuck.clear();
      return decision.candidateHarness;
    }
  }
  stuck.add(cluster.pattern);
  return harness;
}
