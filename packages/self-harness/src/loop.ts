import { clusterFailures } from "./cluster.js";
import { regressionGate, type GateDecision } from "./gate.js";
import { cloneHarness, diffHarness } from "./harness.js";
import { runSuite } from "./runner.js";
import type { Agent, FailureCluster, Harness, Proposer, SuiteResult, Task } from "./types.js";

export interface SelfHarnessConfig {
  agent: Agent;
  proposer: Proposer;
  tasks: Task[];
  initialHarness: Harness;
  /** Safety bound on the number of improvement rounds. */
  maxRounds?: number;
  /** Optional progress callback for logging / UIs. */
  onEvent?: (event: LoopEvent) => void;
}

export type LoopEvent =
  | { type: "round-start"; round: number; passRate: number }
  | { type: "cluster"; round: number; cluster: FailureCluster }
  | { type: "gate"; round: number; decision: GateDecision }
  | { type: "accept"; round: number; decision: GateDecision; diff: string[] }
  | { type: "stuck"; round: number; pattern: string }
  | { type: "done"; reason: string };

export interface RoundLog {
  round: number;
  before: SuiteResult;
  targetedPattern: string;
  gateDecisions: GateDecision[];
  acceptedPatchId: string | null;
  diff: string[];
}

export interface SelfHarnessResult {
  initialHarness: Harness;
  finalHarness: Harness;
  initialPassRate: number;
  finalPassRate: number;
  rounds: RoundLog[];
  stoppedBecause: string;
}

/**
 * The Self-Harness loop. Each round: run the suite, cluster the failures, and
 * for the largest un-stuck cluster ask the proposer for candidate edits. Each
 * candidate goes through the regression gate; the first that is accepted is
 * committed to the harness. A cluster whose every candidate is rejected is
 * marked stuck so the loop moves on rather than spinning. The final harness is a
 * fingerprint of exactly which pathologies this agent tripped over.
 */
export async function selfHarness(config: SelfHarnessConfig): Promise<SelfHarnessResult> {
  const { agent, proposer, tasks, onEvent } = config;
  const maxRounds = config.maxRounds ?? 12;

  let harness = cloneHarness(config.initialHarness);
  const initial = await runSuite(agent, harness, tasks);
  const initialPassRate = initial.passRate;

  const rounds: RoundLog[] = [];
  const stuckPatterns = new Set<string>();
  let stoppedBecause = "reached max rounds";

  for (let round = 1; round <= maxRounds; round++) {
    const before = await runSuite(agent, harness, tasks);
    onEvent?.({ type: "round-start", round, passRate: before.passRate });

    if (before.failed === 0) {
      stoppedBecause = "all tasks pass";
      break;
    }

    const clusters = clusterFailures(before).filter((c) => !stuckPatterns.has(c.pattern));
    if (clusters.length === 0) {
      stoppedBecause = "no actionable failure clusters remain";
      break;
    }

    const cluster = clusters[0] as FailureCluster;
    onEvent?.({ type: "cluster", round, cluster });

    const candidates = await proposer.propose(harness, cluster, before);
    const gateDecisions: GateDecision[] = [];
    let acceptedPatchId: string | null = null;
    let diff: string[] = [];

    for (const patch of candidates) {
      const decision = await regressionGate(agent, harness, patch, tasks, before);
      gateDecisions.push(decision);
      onEvent?.({ type: "gate", round, decision });
      if (decision.accepted) {
        diff = diffHarness(harness, decision.candidateHarness);
        harness = decision.candidateHarness;
        acceptedPatchId = patch.id;
        onEvent?.({ type: "accept", round, decision, diff });
        // The harness just changed, so a pattern marked stuck earlier (its only
        // fix depended on a rule we hadn't learned yet) may now be fixable.
        // Re-open every stuck pattern. This terminates: each accept strictly
        // grows the passing set, so accepts — and therefore clears — are bounded.
        stuckPatterns.clear();
        break;
      }
    }

    if (acceptedPatchId === null) {
      stuckPatterns.add(cluster.pattern);
      onEvent?.({ type: "stuck", round, pattern: cluster.pattern });
    }

    rounds.push({
      round,
      before,
      targetedPattern: cluster.pattern,
      gateDecisions,
      acceptedPatchId,
      diff,
    });
  }

  const final = await runSuite(agent, harness, tasks);
  onEvent?.({ type: "done", reason: stoppedBecause });

  return {
    initialHarness: config.initialHarness,
    finalHarness: harness,
    initialPassRate,
    finalPassRate: final.passRate,
    rounds,
    stoppedBecause,
  };
}
