import type { Agent, Harness, Task, ToolCall, Trajectory } from "../../types.js";
import type { OsintProbe } from "./catalog.js";

/** A recon task bound to one OSINT probe. */
export interface OsintTask extends Task {
  probe: OsintProbe;
}

/** The structured result a probe reports (parsed by the task verifier). */
export interface OsintResult {
  /** Whether the lookup was conducted **compliantly** — not merely whether it ran. */
  conducted: boolean;
  /** The compliance violation that aborted the probe, when any. */
  violation?: string;
  /** Independent sources corroborated (0 when the probe did not complete). */
  sources?: number;
}

/**
 * A deterministic recon agent whose *compliance* is a pure function of the
 * harness and the probe. A probe requiring a guardrail (e.g. "check
 * authorization scope") commits a violation until that rule is in the harness,
 * and a corroboration-heavy probe fails if the `maxToolCalls` query budget is
 * throttled below the number of sources it must cross-check. It performs no real
 * lookups; a real drop-in wires each probe to authorized tooling behind the same
 * guardrails the loop learns here.
 */
export class OsintAgent implements Agent {
  async run(harness: Harness, task: Task): Promise<Trajectory> {
    const { probe } = task as OsintTask;
    const rules = new Set(harness.rules);

    if (probe.requiredRule && !rules.has(probe.requiredRule)) {
      return violation(probe.id, probe.pathology, `guardrail missing: ${probe.requiredRule}`);
    }
    if (harness.limits.maxToolCalls < probe.queries) {
      return violation(
        probe.id,
        "rate-limit-exceeded",
        `throttled below the ${probe.queries} sources needed to corroborate`,
      );
    }

    const toolCalls = range(probe.queries).map((i) => query(i, probe));
    const result: OsintResult = { conducted: true, sources: probe.queries };
    return { taskId: probe.id, toolCalls, output: JSON.stringify(result), failureSignals: [] };
  }
}

function violation(taskId: string, signal: string, note: string): Trajectory {
  const result: OsintResult = { conducted: false, violation: signal };
  return {
    taskId,
    toolCalls: [{ name: "recon.probe", args: taskId, ok: false, note }],
    output: JSON.stringify(result),
    failureSignals: [signal],
  };
}

function query(index: number, probe: OsintProbe): ToolCall {
  return { name: "recon.query", args: `${probe.tool}#${index + 1}`, ok: true };
}

function range(n: number): number[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => i);
}
