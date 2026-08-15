import { regressionGate } from "./gate.js";
import { makePatch } from "./patch-factory.js";
import { parseOps } from "./proposer.js";
import type {
  Agent,
  FailureCluster,
  Harness,
  HarnessPatch,
  Model,
  Proposer,
  SuiteResult,
  Task,
} from "./types.js";

/**
 * The feedback edge the plain {@link ModelProposer} is missing. When the gate
 * rejects a model-authored edit, the plain proposer's candidate simply dies and
 * the loop moves on. This proposer instead treats the regression gate as an
 * *oracle*: it proposes, gate-checks the candidate itself, and — if rejected —
 * hands the model the exact rejection reason (which passing tasks it broke) and
 * asks for a tighter edit, up to `maxAttempts` rounds.
 *
 * It reproduces the paper's iterative-refinement story: the model's first reflex
 * for "runaway-training" is the blunt compute clamp; the gate rejects it for
 * regressing the heavy projects; the model, shown that, re-proposes the clean
 * `use-early-stopping` rule that fixes the cluster without collateral damage.
 *
 * The proposer's internal gate run is only a pre-check to steer refinement; the
 * loop's own gate remains the single source of truth on what is committed.
 */
export interface RefiningConfig {
  model: Model;
  /** Needed to run the gate oracle that steers each refinement. */
  agent: Agent;
  tasks: Task[];
  /** Max propose→reject→re-propose rounds per cluster (default 3). */
  maxAttempts?: number;
  onAttempt?: (attempt: RefineAttempt) => void;
}

/** One propose→gate step in a refinement, recorded for the transcript. */
export interface RefineAttempt {
  cluster: string;
  attempt: number;
  patch: HarnessPatch | null;
  accepted: boolean;
  reason: string;
  regressions: string[];
}

export class RefiningModelProposer implements Proposer {
  private readonly history: RefineAttempt[] = [];

  constructor(private readonly config: RefiningConfig) {}

  async propose(
    harness: Harness,
    cluster: FailureCluster,
    suite: SuiteResult,
  ): Promise<HarnessPatch[]> {
    // Clamp to ≥1 so a stray maxAttempts of 0 or negative can't silently make
    // the loop never ask the model and mark the cluster stuck (matches the
    // Math.max(1, …) clamps the outer loop-runner already uses on its budgets).
    const maxAttempts = Math.max(1, this.config.maxAttempts ?? 3);
    const tried: HarnessPatch[] = [];
    let feedback: string | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const raw = await this.config.model.complete({
        system: REFINING_SYSTEM,
        user: buildRefinePrompt(harness, cluster, feedback),
      });
      const ops = parseOps(raw);

      if (ops.length === 0) {
        this.record({
          cluster: cluster.pattern,
          attempt,
          patch: null,
          accepted: false,
          reason: "model produced no valid ops",
          regressions: [],
        });
        feedback =
          "Your previous reply contained no valid ops. Reply with ONLY a JSON array of ops.";
        continue;
      }

      const patch = makePatch(
        "refined-patch",
        cluster.pattern,
        `Attempt ${attempt} by ${this.config.model.name} for "${cluster.pattern}".`,
        ops,
      );
      tried.push(patch);

      const decision = await regressionGate(
        this.config.agent,
        harness,
        patch,
        this.config.tasks,
        suite,
      );
      this.record({
        cluster: cluster.pattern,
        attempt,
        patch,
        accepted: decision.accepted,
        reason: decision.reason,
        regressions: decision.regressions,
      });

      if (decision.accepted) return [patch];
      feedback = renderFeedback(patch, decision.reason, decision.regressions);
    }

    // Exhausted without an accepted edit: hand the loop the attempts so its own
    // gate records the rejection and marks the pattern stuck.
    return tried;
  }

  /** The full propose→reject→re-propose transcript across every cluster. */
  refinements(): RefineAttempt[] {
    return this.history;
  }

  private record(attempt: RefineAttempt): void {
    this.history.push(attempt);
    this.config.onAttempt?.(attempt);
  }
}

/** Render the refinement transcript as a markdown log. */
export function renderRefinements(attempts: RefineAttempt[]): string {
  const lines: string[] = ["# Refinement transcript", "", `**Attempts:** ${attempts.length}`, ""];
  for (const a of attempts) {
    const ops = a.patch ? JSON.stringify(a.patch.ops) : "(no valid ops)";
    const verdict = a.accepted ? "ACCEPTED" : "REJECTED";
    lines.push(`## ${a.cluster} · attempt ${a.attempt} — ${verdict}`);
    lines.push(`- proposed: ${ops}`);
    lines.push(`- gate: ${a.reason}`);
    lines.push("");
  }
  return lines.join("\n");
}

const REFINING_SYSTEM = [
  "You improve your own agent harness. Given a recurring failure pattern, propose",
  "the SMALLEST edit that fixes it without changing unrelated behavior.",
  "A regression gate checks every edit: an edit that breaks a task which already",
  "passed is REJECTED even if it fixes the target failures. When you are shown a",
  "rejection, propose a smaller, more targeted edit — prefer a declarative rule",
  "over a hard resource limit, and never constrain the tasks you were told you broke.",
  "Reply with ONLY a JSON array of ops. Allowed ops:",
  '{"op":"addRule","text":string}',
  '{"op":"setLimit","key":"maxToolCalls","value":number}',
  '{"op":"setLimit","key":"avoidRepeatedFailures","value":boolean}',
  '{"op":"setLimit","key":"persistEnvAcrossSessions","value":boolean}',
].join("\n");

function buildRefinePrompt(
  harness: Harness,
  cluster: FailureCluster,
  feedback: string | null,
): string {
  const parts = [
    `Current limits: ${JSON.stringify(harness.limits)}`,
    `Current rules: ${JSON.stringify(harness.rules)}`,
    `Failure pattern "${cluster.pattern}" hit ${cluster.count} task(s).`,
    `Examples:\n${cluster.examples.map((e) => `  - ${e}`).join("\n")}`,
  ];
  if (feedback) parts.push(feedback);
  parts.push("Propose the minimal fix as a JSON array of ops.");
  return parts.join("\n");
}

function renderFeedback(patch: HarnessPatch, reason: string, regressions: string[]): string {
  const lines = [
    "Your previous edit was REJECTED by the regression gate.",
    `Previous ops: ${JSON.stringify(patch.ops)}`,
    `Reason: ${reason}`,
  ];
  if (regressions.length > 0) {
    lines.push(
      `It broke ${regressions.length} task(s) that were passing: ${regressions.join(", ")}.`,
      "Do NOT constrain those tasks — fix only the target pattern with a smaller, targeted edit.",
    );
  }
  return lines.join("\n");
}
