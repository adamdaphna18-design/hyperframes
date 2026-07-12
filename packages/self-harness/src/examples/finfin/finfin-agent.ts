import type { Agent, Harness, Task, ToolCall, Trajectory } from "../../types.js";
import type { FinfinProbe } from "./catalog.js";

/** A trade decision bound to one finfin probe. */
export interface FinfinTask extends Task {
  decision: FinfinProbe;
}

/** The structured result a decision reports (parsed by the task verifier). */
export interface TradeResult {
  /** Whether the trade was taken GOVERNED — not merely whether it was taken. */
  governed: boolean;
  /** The governance breach that vetoed the trade, when any. */
  breach?: string;
  /** Confirmations cross-checked before deciding (0 when starved by a throttle). */
  confirmations?: number;
}

/**
 * A deterministic decision agent whose GOVERNANCE is a pure function of the
 * harness and the setup. A setup carrying a pathology (a trade against the
 * regime, an oversized bet, a chase, an unverified rug, a returns-based pair)
 * breaches governance until the matching rule is in the harness; a healthy,
 * confirmation-heavy trade breaches if `maxToolCalls` is throttled below the
 * confirmations it must cross-check. It executes no real trade — a real drop-in
 * wires each decision to the finfin organs behind the rules the loop learns.
 */
export class FinfinAgent implements Agent {
  async run(harness: Harness, task: Task): Promise<Trajectory> {
    const { decision } = task as FinfinTask;
    const rules = new Set(harness.rules);

    if (decision.requiredRule && !rules.has(decision.requiredRule)) {
      return breach(
        decision.id,
        decision.pathology,
        `governance rule missing: ${decision.requiredRule}`,
      );
    }
    if (harness.limits.maxToolCalls < decision.confirmations) {
      return breach(
        decision.id,
        "starved-confirmations",
        `throttled below the ${decision.confirmations} confirmations this trade needs`,
      );
    }

    const toolCalls = range(decision.confirmations).map((i) => confirm(i, decision));
    const result: TradeResult = { governed: true, confirmations: decision.confirmations };
    return { taskId: decision.id, toolCalls, output: JSON.stringify(result), failureSignals: [] };
  }
}

function breach(taskId: string, signal: string, note: string): Trajectory {
  const result: TradeResult = { governed: false, breach: signal };
  return {
    taskId,
    toolCalls: [{ name: "finfin.decide", args: taskId, ok: false, note }],
    output: JSON.stringify(result),
    failureSignals: [signal],
  };
}

function confirm(index: number, decision: FinfinProbe): ToolCall {
  const lens = ["structure", "entry", "discipline", "regime", "rug"][index] ?? `check-${index + 1}`;
  return { name: "finfin.confirm", args: `${decision.id}:${lens}`, ok: true };
}

function range(n: number): number[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => i);
}
