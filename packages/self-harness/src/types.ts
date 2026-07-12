/**
 * Core domain types for the Self-Harness optimization loop.
 *
 * The framework treats the *harness* — the layer wrapping a model (system
 * prompt, behavioral rules, numeric guardrails, tool surface) — as a mutable
 * artifact. The same model that runs the tasks proposes minimal edits to its
 * own harness in response to recurring failure patterns; every edit passes a
 * regression gate before it is accepted.
 */

/**
 * Numeric / boolean guardrails the harness enforces on the agent loop.
 *
 * These are the levers a model reaches for when it keeps tripping over the
 * same pathology: capping runaway tool-call loops, refusing to repeat a
 * command that already failed, persisting environment across sessions.
 */
export interface HarnessLimits {
  /** Hard cap on the length of a single tool-call loop. */
  maxToolCalls: number;
  /** When true, the agent must not re-run a command that already failed unchanged. */
  avoidRepeatedFailures: boolean;
  /** When true, environment variables set in one session survive into the next. */
  persistEnvAcrossSessions: boolean;
}

/** The mutable artifact the loop optimizes. */
export interface Harness {
  /** Base system prompt handed to the model. */
  systemPrompt: string;
  /** Human-readable behavioral rules injected alongside the system prompt. */
  rules: string[];
  /** Enforced guardrails. */
  limits: HarnessLimits;
  /** Tool names available to the agent. */
  tools: string[];
}

/** A single tool invocation within a trajectory. */
export interface ToolCall {
  name: string;
  args: string;
  ok: boolean;
  note?: string;
}

/** The record of one agent run over one task. */
export interface Trajectory {
  taskId: string;
  toolCalls: ToolCall[];
  /** Final text the agent produced (fed to the task verifier). */
  output: string;
  /**
   * Machine-readable tags describing *why* a run went wrong, keyed on by the
   * failure clusterer. Empty for a clean run.
   */
  failureSignals: string[];
}

/** Outcome of verifying one trajectory against its task. */
export interface TaskResult {
  taskId: string;
  passed: boolean;
  detail: string;
  trajectory: Trajectory;
}

/** Aggregate outcome of running a whole task suite once. */
export interface SuiteResult {
  results: TaskResult[];
  passed: number;
  failed: number;
  passRate: number;
}

/** A unit of work: a prompt plus a verifier. */
export interface Task {
  id: string;
  prompt: string;
  /** Verify the agent's final output. */
  check(output: string): { passed: boolean; detail: string };
}

/**
 * Anything that can run a task under a given harness and produce a trajectory.
 * The runner then verifies the trajectory's output against the task.
 */
export interface Agent {
  run(harness: Harness, task: Task): Promise<Trajectory>;
}

/** A single, minimal, serializable edit to a harness. */
export type PatchOp =
  | { op: "addRule"; text: string }
  | { op: "removeRule"; text: string }
  | { op: "setLimit"; key: "maxToolCalls"; value: number }
  | { op: "setLimit"; key: "avoidRepeatedFailures"; value: boolean }
  | { op: "setLimit"; key: "persistEnvAcrossSessions"; value: boolean }
  | { op: "setSystemPrompt"; text: string };

/** A candidate change to the harness, targeting one failure pattern. */
export interface HarnessPatch {
  id: string;
  /** The failure pattern this patch is meant to address. */
  targetPattern: string;
  /** Why the proposer believes this edit helps. */
  rationale: string;
  /** The minimal edit, as data. */
  ops: PatchOp[];
}

/** A recurring failure pattern extracted from a batch of failed runs. */
export interface FailureCluster {
  /** Stable identifier for the pattern, e.g. "runaway-exploration". */
  pattern: string;
  count: number;
  taskIds: string[];
  /** Representative log excerpts for the proposer / the human. */
  examples: string[];
}

/**
 * Proposes harness edits in response to a failure cluster. Two implementations
 * ship: a deterministic {@link HeuristicProposer} and a model-driven
 * {@link ModelProposer} (the "the model edits its own harness" path).
 */
export interface Proposer {
  propose(harness: Harness, cluster: FailureCluster, suite: SuiteResult): Promise<HarnessPatch[]>;
}

/** The pluggable text-completion surface used by the model-driven components. */
export interface Model {
  readonly name: string;
  complete(input: { system?: string; user: string }): Promise<string>;
}
