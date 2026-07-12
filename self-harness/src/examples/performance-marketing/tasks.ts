import { PROBES, type PmProbe } from "./catalog.js";
import type { PmResult, PmTask } from "./pm-agent.js";

/** Build the full performance-marketing task suite from the probe catalog. */
export function buildPmSuite(): PmTask[] {
  return PROBES.map(toTask);
}

function toTask(probe: PmProbe): PmTask {
  return {
    id: probe.id,
    prompt: `Apply "${probe.action}" (${probe.feature}) safely and within policy.`,
    probe,
    check(output: string) {
      const result = parseResult(output);
      if (!result || !result.executed) {
        return { passed: false, detail: result?.violation ?? "no result" };
      }
      return { passed: true, detail: "executed within policy" };
    },
  };
}

function parseResult(output: string): PmResult | null {
  try {
    const parsed: unknown = JSON.parse(output);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as PmResult).executed === "boolean"
    ) {
      return parsed as PmResult;
    }
  } catch {
    // not a PmResult envelope
  }
  return null;
}
