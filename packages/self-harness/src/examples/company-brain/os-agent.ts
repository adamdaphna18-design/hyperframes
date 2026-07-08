import type { Agent, Harness, Task, ToolCall, Trajectory } from "../../types.js";
import type { CompanyBrain } from "./brain.js";
import type { Vertical } from "./verticals.js";

/** A task bound to one specialist vertical. */
export interface CompanyTask extends Task {
  vertical: Vertical;
}

/** The structured result a vertical reports (parsed by the task verifier). */
export interface OsResult {
  shipped: boolean;
  metric?: number;
  blocked?: string;
}

/**
 * A specialist agent for the operating-system layer. It reads the brain for its
 * vertical, then acts under the harness: it hits the target metric only when its
 * playbook rule is present, no brand-unsafe rule sabotages it, and the tool-call
 * budget is enough. Deterministic — a real drop-in swaps in an LLM-backed
 * specialist that reads the same brain context and produces a real deliverable.
 */
export class CompanyAgent implements Agent {
  constructor(private readonly brain: CompanyBrain) {}

  async run(harness: Harness, task: Task): Promise<Trajectory> {
    const { vertical } = task as CompanyTask;
    const rules = new Set(harness.rules);
    const context = this.brain.context(vertical.id);

    if (context.length === 0) {
      return outcome(
        vertical,
        false,
        vertical.baselineMetric,
        "no brain context — nothing ingested",
      );
    }
    if (vertical.requiredPlaybook && !rules.has(vertical.requiredPlaybook)) {
      return outcome(vertical, false, vertical.baselineMetric, vertical.id);
    }
    const sabotage = vertical.sensitiveTo.find((r) => rules.has(r));
    if (sabotage) {
      return outcome(vertical, false, vertical.baselineMetric, `brand-safety:${sabotage}`);
    }
    if (harness.limits.maxToolCalls < vertical.steps) {
      return outcome(vertical, false, vertical.baselineMetric, "budget-exhausted");
    }
    return outcome(
      vertical,
      true,
      vertical.targetMetric,
      null,
      this.brain.context(vertical.id).length,
    );
  }
}

function outcome(
  vertical: Vertical,
  shipped: boolean,
  metric: number,
  signal: string | null,
  reads = 1,
): Trajectory {
  const result: OsResult = shipped
    ? { shipped, metric }
    : { shipped, metric, blocked: signal ?? "" };
  const toolCalls: ToolCall[] = [
    { name: "brain.read", args: vertical.id, ok: true, note: `${reads} page(s)` },
    { name: "vertical.run", args: vertical.id, ok: shipped },
  ];
  return {
    taskId: vertical.id,
    toolCalls,
    output: JSON.stringify(result),
    failureSignals: signal ? [signal] : [],
  };
}
