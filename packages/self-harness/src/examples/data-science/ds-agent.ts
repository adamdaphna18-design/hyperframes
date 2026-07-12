import type { Agent, Harness, Task, ToolCall, Trajectory } from "../../types.js";
import type { DsProject } from "./projects.js";

/** A task bound to one data-science project. */
export interface DsTask extends Task {
  project: DsProject;
}

/** The structured result a run reports (parsed by the task verifier). */
export interface DsResult {
  ran: boolean;
  metric?: number;
  error?: string;
}

/**
 * A deterministic data-science agent. Whether it produces a passing model is a
 * pure function of the harness and the project: a project with a required
 * practice (e.g. "fit transforms on train only") fails until that rule is in the
 * harness, and a heavy deep-learning project fails if the `maxToolCalls` compute
 * budget is smaller than the steps it needs. Swap this for a real
 * notebook-executing agent where Python + Jupyter are available.
 */
export class DsAgent implements Agent {
  async run(harness: Harness, task: Task): Promise<Trajectory> {
    const { project } = task as DsTask;
    const rules = new Set(harness.rules);

    if (project.requiredRule && !rules.has(project.requiredRule)) {
      return fail(project.id, project.pathology, `missing practice: ${project.requiredRule}`);
    }
    if (harness.limits.maxToolCalls < project.computeSteps) {
      return fail(project.id, "compute-budget-exhausted", `needs ${project.computeSteps} steps`);
    }

    const toolCalls = range(project.computeSteps).map((i) => step(i, project));
    const result: DsResult = { ran: true, metric: project.targetMetric };
    return { taskId: project.id, toolCalls, output: JSON.stringify(result), failureSignals: [] };
  }
}

function fail(taskId: string, signal: string, note: string): Trajectory {
  const result: DsResult = { ran: false, error: signal };
  return {
    taskId,
    toolCalls: [{ name: "notebook.run", args: taskId, ok: false, note }],
    output: JSON.stringify(result),
    failureSignals: [signal],
  };
}

function step(index: number, project: DsProject): ToolCall {
  return { name: "notebook.cell", args: `${project.id}#${index + 1}`, ok: true };
}

function range(n: number): number[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => i);
}
