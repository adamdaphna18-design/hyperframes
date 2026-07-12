import type { Agent, Harness, Task, ToolCall, Trajectory } from "../../types.js";
import { OVERBROAD_FREEZE_RULE, type PmProbe } from "./catalog.js";

/** A performance-marketing task bound to one probe. */
export interface PmTask extends Task {
  probe: PmProbe;
}

/** The structured result a probe reports (parsed by the task verifier). */
export interface PmResult {
  /** Whether the action was executed **safely** — not merely whether it ran. */
  executed: boolean;
  /** The guardrail violation that aborted the action, when any. */
  violation?: string;
}

/**
 * A deterministic ad-budget agent whose *safety* is a pure function of the
 * harness and the probe. A probe requiring a guardrail (e.g. "cap daily budget
 * change") commits its violation until that rule is in the harness. The
 * over-broad `freeze-all-budget-changes` rule, if present, blocks **every**
 * budget-touching action — including the legitimate ones — which is exactly the
 * regression the gate exists to catch. The agent touches no real ad account; a
 * real drop-in wires each action to the platform APIs behind these same rails.
 */
export class PmAgent implements Agent {
  async run(harness: Harness, task: Task): Promise<Trajectory> {
    const { probe } = task as PmTask;
    const rules = new Set(harness.rules);

    // Over-broad guardrail: a blanket freeze breaks legitimate in-cap actions.
    if (probe.touchesBudget && rules.has(OVERBROAD_FREEZE_RULE)) {
      return violation(probe.id, "frozen", "all budget changes frozen — legitimate action blocked");
    }

    // The specific guardrail this pathology needs is not yet in the harness.
    if (probe.requiredRule && !rules.has(probe.requiredRule)) {
      return violation(probe.id, probe.pathology, `guardrail missing: ${probe.requiredRule}`);
    }

    const toolCalls: ToolCall[] = [{ name: "ads.apply", args: probe.action, ok: true }];
    const result: PmResult = { executed: true };
    return { taskId: probe.id, toolCalls, output: JSON.stringify(result), failureSignals: [] };
  }
}

function violation(taskId: string, signal: string, note: string): Trajectory {
  const result: PmResult = { executed: false, violation: signal };
  return {
    taskId,
    toolCalls: [{ name: "ads.apply", args: taskId, ok: false, note }],
    output: JSON.stringify(result),
    failureSignals: [signal],
  };
}
