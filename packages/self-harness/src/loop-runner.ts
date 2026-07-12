import { diffHarness } from "./harness.js";
import { selfHarness, type RoundLog } from "./loop.js";
import { runSuite } from "./runner.js";
import type { Agent, Harness, Proposer, Task } from "./types.js";

/**
 * Outer, self-pacing loop around {@link selfHarness}. Where `selfHarness` runs
 * one campaign of improvement rounds over a fixed task suite, this runner
 * repeats such campaigns — carrying the learned harness (rules + limits)
 * forward as accumulated *skills*, optionally growing the suite to harden
 * against new pathologies, and stopping on an explicit set of rules
 * (convergence, an iteration budget, or a caller predicate).
 *
 * The six-part loop anatomy maps cleanly onto this module:
 *   1. Trigger    — the `for` loop that repeats campaigns until a stop rule.
 *   2. Execution  — each iteration calls `selfHarness` on the current suite.
 *   3. Verifier   — reused as-is: the regression gate inside `selfHarness`.
 *   4. Stop Rules — converged / maxIterations / caller `shouldStop` (below).
 *   5. Memory     — the accumulated harness + {@link renderMemory} markdown.
 *   6. Skills     — the accumulated rules, replayed as the next iteration's
 *                   starting harness.
 */
export interface SelfHarnessLoopConfig {
  agent: Agent;
  proposer: Proposer;
  /** The harness the first iteration starts from. */
  initialHarness: Harness;
  /** The task suite present from iteration 1 onward. */
  initialTasks: Task[];
  /**
   * Optional per-iteration hook returning *additional* tasks to harden
   * against. Tasks whose id is already present are ignored (deduped). Defaults
   * to adding nothing, in which case the loop simply re-confirms convergence.
   */
  growSuite?: (iteration: number, harness: Harness) => Task[];
  /** Hard cap on outer iterations. Clamped to at least 1. */
  maxIterations: number;
  /**
   * Number of *consecutive* iterations with no newly-learned rule and no new
   * failing task required to declare convergence. Clamped to at least 1.
   */
  convergenceRounds: number;
  /** Optional caller stop rule, evaluated after each iteration. */
  shouldStop?: (context: LoopStopContext) => boolean;
  /** Optional progress callback for logging / UIs. */
  onIteration?: (iteration: LoopIteration) => void;
}

/** Why the outer loop halted. */
export type LoopStopReason = "converged" | "reached maxIterations" | "shouldStop predicate";

/** Context handed to a caller-supplied {@link SelfHarnessLoopConfig.shouldStop}. */
export interface LoopStopContext {
  iteration: number;
  harness: Harness;
  iterations: LoopIteration[];
}

/** The record of one outer iteration (one `selfHarness` campaign). */
export interface LoopIteration {
  iteration: number;
  /** Total tasks in the suite this iteration ran against. */
  tasksRun: number;
  /** Task ids introduced by `growSuite` this iteration (deduped). */
  addedTaskIds: string[];
  /** Of the added tasks, those already failing under the starting harness. */
  newlyFailingTaskIds: string[];
  /** Rules present in the final harness that were absent when the iteration began. */
  learnedRules: string[];
  /** Tasks that the gate flipped from failing to passing this iteration. */
  newlyPassingTaskIds: string[];
  initialPassRate: number;
  finalPassRate: number;
  /** Human-readable diff of the harness across this iteration. */
  harnessDiff: string[];
  /** Why the inner `selfHarness` campaign stopped. */
  campaignStoppedBecause: string;
  /** True iff a rule was learned or a new failing task appeared. */
  madeProgress: boolean;
}

/** Everything {@link renderMemory} needs to produce the progress markdown. */
export interface LoopMemory {
  finalHarness: Harness;
  iterations: LoopIteration[];
  stoppedBecause: LoopStopReason;
}

/** Structured outcome of {@link runSelfHarnessLoop}. */
export interface SelfHarnessLoopResult {
  finalHarness: Harness;
  iterations: LoopIteration[];
  memoryMarkdown: string;
  stoppedBecause: LoopStopReason;
}

/** Bundle of the mutable state threaded through the outer loop. */
interface LoopState {
  harness: Harness;
  taskMap: Map<string, Task>;
  iterations: LoopIteration[];
  quietStreak: number;
}

/**
 * Run the self-pacing outer loop. See {@link SelfHarnessLoopConfig} for the
 * knobs. Returns the final (accumulated) harness, a per-iteration log, the
 * rendered progress markdown, and the explicit stop reason.
 */
export async function runSelfHarnessLoop(
  config: SelfHarnessLoopConfig,
): Promise<SelfHarnessLoopResult> {
  const maxIterations = Math.max(1, config.maxIterations);
  const convergenceRounds = Math.max(1, config.convergenceRounds);
  const grow = config.growSuite ?? (() => []);

  const state: LoopState = {
    harness: config.initialHarness,
    taskMap: seedTasks(config.initialTasks),
    iterations: [],
    quietStreak: 0,
  };

  let stoppedBecause: LoopStopReason = "reached maxIterations";

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const addedTaskIds = accumulate(state.taskMap, grow(iteration, state.harness));
    const { log, finalHarness } = await runIteration(config, state, iteration, addedTaskIds);

    state.harness = finalHarness;
    state.iterations.push(log);
    config.onIteration?.(log);

    if (config.shouldStop?.({ iteration, harness: state.harness, iterations: state.iterations })) {
      stoppedBecause = "shouldStop predicate";
      break;
    }

    state.quietStreak = log.madeProgress ? 0 : state.quietStreak + 1;
    if (state.quietStreak >= convergenceRounds) {
      stoppedBecause = "converged";
      break;
    }
  }

  const memory: LoopMemory = {
    finalHarness: state.harness,
    iterations: state.iterations,
    stoppedBecause,
  };
  return {
    finalHarness: state.harness,
    iterations: state.iterations,
    memoryMarkdown: renderMemory(memory),
    stoppedBecause,
  };
}

/** The summary of one campaign plus the harness to carry into the next iteration. */
interface IterationOutcome {
  log: LoopIteration;
  finalHarness: Harness;
}

/** Run one inner `selfHarness` campaign and summarize it into a {@link LoopIteration}. */
async function runIteration(
  config: SelfHarnessLoopConfig,
  state: LoopState,
  iteration: number,
  addedTaskIds: string[],
): Promise<IterationOutcome> {
  const tasks = [...state.taskMap.values()];
  const startHarness = state.harness;

  const before = await runSuite(config.agent, startHarness, tasks);
  const failingBefore = failingIds(before);
  const newlyFailingTaskIds = addedTaskIds.filter((id) => failingBefore.has(id));

  const campaign = await selfHarness({
    agent: config.agent,
    proposer: config.proposer,
    tasks,
    initialHarness: startHarness,
  });

  const learnedRules = newRules(startHarness.rules, campaign.finalHarness.rules);
  const newlyPassingTaskIds = collectNewlyPassing(campaign.rounds);
  const harnessDiff = diffHarness(startHarness, campaign.finalHarness);

  const log: LoopIteration = {
    iteration,
    tasksRun: tasks.length,
    addedTaskIds,
    newlyFailingTaskIds,
    learnedRules,
    newlyPassingTaskIds,
    initialPassRate: campaign.initialPassRate,
    finalPassRate: campaign.finalPassRate,
    harnessDiff,
    campaignStoppedBecause: campaign.stoppedBecause,
    // Progress is *any* harness change (a learned rule OR a limit-only fix) or
    // newly-added tasks still to work on — not just new rules, which would score
    // a limit-only fix as "quiet" and converge the outer loop prematurely.
    madeProgress: harnessDiff.length > 0 || newlyFailingTaskIds.length > 0,
  };
  return { log, finalHarness: campaign.finalHarness };
}

/** Seed the accumulated task map from the initial suite, deduped by id. */
function seedTasks(initial: Task[]): Map<string, Task> {
  const map = new Map<string, Task>();
  for (const task of initial) {
    if (!map.has(task.id)) map.set(task.id, task);
  }
  return map;
}

/** Fold newly grown tasks into the accumulated map; return the ids actually added. */
function accumulate(taskMap: Map<string, Task>, grown: Task[]): string[] {
  const added: string[] = [];
  for (const task of grown) {
    if (!taskMap.has(task.id)) {
      taskMap.set(task.id, task);
      added.push(task.id);
    }
  }
  return added;
}

/** Ids of tasks that failed in a suite result. */
function failingIds(suite: { results: { taskId: string; passed: boolean }[] }): Set<string> {
  const ids = new Set<string>();
  for (const result of suite.results) {
    if (!result.passed) ids.add(result.taskId);
  }
  return ids;
}

/** Rules in `after` that were not in `before`. */
function newRules(before: string[], after: string[]): string[] {
  const known = new Set(before);
  return after.filter((rule) => !known.has(rule));
}

/** Union of every accepted gate decision's newly-passing tasks across a campaign. */
function collectNewlyPassing(rounds: RoundLog[]): string[] {
  const ids = new Set<string>();
  for (const round of rounds) {
    for (const decision of round.gateDecisions) {
      if (decision.accepted) {
        for (const id of decision.newlyPassing) ids.add(id);
      }
    }
  }
  return [...ids].sort();
}

/**
 * Render the accumulated loop memory as a markdown progress file — the
 * "progress.md" the loop guide prescribes: a checkable, roll-back-able record
 * of what the loop has learned and where each iteration moved the pass rate.
 */
export function renderMemory(memory: LoopMemory): string {
  const { finalHarness, iterations, stoppedBecause } = memory;
  const ruleCount = finalHarness.rules.length;
  const lines: string[] = [
    "# Self-Harness Loop — progress.md",
    "",
    `**Stopped because:** ${stoppedBecause}`,
    `**Iterations:** ${iterations.length}`,
    `**Learned rules (skills carried forward):** ${ruleCount}`,
    "",
    "## Current harness",
    `- maxToolCalls: ${finalHarness.limits.maxToolCalls}`,
    `- avoidRepeatedFailures: ${finalHarness.limits.avoidRepeatedFailures}`,
    `- persistEnvAcrossSessions: ${finalHarness.limits.persistEnvAcrossSessions}`,
    "",
    "### Rules (skills)",
    ...renderRules(finalHarness.rules),
    "",
    "## Iteration log",
  ];
  for (const iteration of iterations) {
    lines.push(...renderIteration(iteration));
  }
  return lines.join("\n");
}

/** Bulleted rules, or an explicit empty marker. */
function renderRules(rules: string[]): string[] {
  if (rules.length === 0) return ["- (none learned yet)"];
  return rules.map((rule) => `- ${rule}`);
}

/** Render one iteration block of the progress markdown. */
function renderIteration(iteration: LoopIteration): string[] {
  const added = list(iteration.addedTaskIds);
  const passed = list(iteration.newlyPassingTaskIds);
  const diff =
    iteration.harnessDiff.length === 0 ? "(no change)" : iteration.harnessDiff.join("; ");
  return [
    "",
    `### Iteration ${iteration.iteration}`,
    `- tasks run: ${iteration.tasksRun} (added: ${added})`,
    `- pass rate: ${pct(iteration.initialPassRate)} -> ${pct(iteration.finalPassRate)}`,
    `- newly learned rules: ${list(iteration.learnedRules)}`,
    `- newly passing tasks: ${passed}`,
    `- harness diff: ${diff}`,
    `- campaign stopped: ${iteration.campaignStoppedBecause}`,
    `- made progress: ${iteration.madeProgress}`,
  ];
}

/** Join a string list for display, or a dash when empty. */
function list(items: string[]): string {
  return items.length === 0 ? "-" : items.join(", ");
}

/** Format a 0..1 ratio as a rounded percentage. */
function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
