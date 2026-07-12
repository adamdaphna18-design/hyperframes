import type { Agent, Harness, HarnessLimits, Task, ToolCall, Trajectory } from "../types.js";

/**
 * The pathologies this simulated world models — each mirrors a fix a real model
 * made to its own harness in the Self-Harness experiment: MiniMax capping
 * runaway tool-call loops, Qwen refusing to repeat a failed command, GLM
 * persisting environment across sessions. `healthy` tasks have no pathology and
 * exist so the regression gate has something to protect.
 */
export type Pathology =
  | "healthy"
  | "repeated-failed-command"
  | "lost-env-var"
  | "runaway-exploration";

export interface SimTask extends Task {
  pathology: Pathology;
  /** Legitimate tool calls a well-behaved run of this task needs. */
  legitToolCalls: number;
}

/** Build a simulated task whose success depends on the harness's capabilities. */
export function makeSimTask(
  id: string,
  pathology: Pathology,
  prompt: string,
  legitToolCalls = 4,
): SimTask {
  return {
    id,
    prompt,
    pathology,
    legitToolCalls,
    check(output: string) {
      return { passed: output === "DONE", detail: output };
    },
  };
}

function isSimTask(task: Task): task is SimTask {
  return "pathology" in task && "legitToolCalls" in task;
}

const ok = (name: string, args: string, note?: string): ToolCall => ({
  name,
  args,
  ok: true,
  note,
});
const fail = (name: string, args: string, note?: string): ToolCall => ({
  name,
  args,
  ok: false,
  note,
});

/** Partial trajectory (everything but the task id) produced by one pathology. */
interface Run {
  toolCalls: ToolCall[];
  output: string;
  failureSignals: string[];
}

function runHealthy(limits: HarnessLimits, need: number): Run {
  if (limits.maxToolCalls >= need) {
    const toolCalls = range(need).map((i) => ok("bash", `step-${i + 1}`));
    return { toolCalls, output: "DONE", failureSignals: [] };
  }
  const toolCalls = range(limits.maxToolCalls).map((i) => ok("bash", `step-${i + 1}`));
  return {
    toolCalls,
    output: `GAVE UP: hit tool-call cap (${limits.maxToolCalls}) before finishing (needed ${need})`,
    failureSignals: ["tool-budget-exhausted"],
  };
}

function runRepeatedFailedCommand(limits: HarnessLimits): Run {
  const first = fail("bash", "build", "exit 1");
  if (limits.avoidRepeatedFailures) {
    return {
      toolCalls: [first, ok("bash", "build --fallback", "exit 0")],
      output: "DONE",
      failureSignals: [],
    };
  }
  const repeats = Math.min(limits.maxToolCalls, 20);
  const toolCalls = [first, ...range(repeats - 1).map(() => fail("bash", "build", "exit 1"))];
  return {
    toolCalls,
    output: "GAVE UP: repeated a failing command without trying another approach",
    failureSignals: range(repeats - 1).map(() => "repeated-failed-command"),
  };
}

function runLostEnvVar(limits: HarnessLimits): Run {
  const set = ok("bash", "export TOKEN=secret");
  if (limits.persistEnvAcrossSessions) {
    return {
      toolCalls: [set, ok("bash", "echo $TOKEN", "secret")],
      output: "DONE",
      failureSignals: [],
    };
  }
  return {
    toolCalls: [set, fail("bash", "echo $TOKEN", "empty — TOKEN not set")],
    output: "GAVE UP: TOKEN was lost between sessions",
    failureSignals: ["lost-env-var"],
  };
}

function runRunawayExploration(limits: HarnessLimits): Run {
  if (limits.maxToolCalls <= 100) {
    const explore = Math.min(limits.maxToolCalls - 1, 5);
    const toolCalls = [
      ...range(explore).map((i) => ok("read", `explore-${i + 1}`)),
      ok("write", "report.md"),
    ];
    return { toolCalls, output: "DONE", failureSignals: [] };
  }
  const explored = Math.min(limits.maxToolCalls, 40);
  return {
    toolCalls: range(explored).map((i) => ok("read", `explore-${i + 1}`)),
    output: "GAVE UP: explored without producing the required artifact",
    failureSignals: range(explored).map(() => "runaway-exploration"),
  };
}

function range(n: number): number[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => i);
}

const PATHOLOGY_RUNS: Record<Pathology, (limits: HarnessLimits, task: SimTask) => Run> = {
  healthy: (limits, task) => runHealthy(limits, task.legitToolCalls),
  "repeated-failed-command": (limits) => runRepeatedFailedCommand(limits),
  "lost-env-var": (limits) => runLostEnvVar(limits),
  "runaway-exploration": (limits) => runRunawayExploration(limits),
};

/**
 * A deterministic agent whose success on each task is a pure function of the
 * task's pathology and the harness's capabilities. This makes the whole
 * Self-Harness loop runnable and testable end-to-end with no network: failing
 * tasks cluster by pathology, the matching harness edit flips them to passing,
 * and an over-aggressive edit visibly regresses a healthy task at the gate.
 */
export class SimulatedAgent implements Agent {
  async run(harness: Harness, task: Task): Promise<Trajectory> {
    if (!isSimTask(task)) {
      throw new Error(`SimulatedAgent can only run SimTask (got "${task.id}")`);
    }
    const run = PATHOLOGY_RUNS[task.pathology](harness.limits, task);
    return {
      taskId: task.id,
      toolCalls: run.toolCalls,
      output: run.output,
      failureSignals: run.failureSignals,
    };
  }
}
