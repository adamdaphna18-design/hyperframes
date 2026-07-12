import { PROBES, type OsintProbe } from "./catalog.js";
import type { OsintResult, OsintTask } from "./osint-agent.js";

/** Build the full recon task suite from the probe catalog. */
export function buildOsintSuite(): OsintTask[] {
  return PROBES.map(toTask);
}

function toTask(probe: OsintProbe): OsintTask {
  return {
    id: probe.id,
    prompt: `Run the ${probe.tool} lookup (${probe.category}) and conduct it within policy.`,
    probe,
    check(output: string) {
      const result = parseResult(output);
      if (!result || !result.conducted) {
        return { passed: false, detail: result?.violation ?? "no result" };
      }
      return {
        passed: true,
        detail: `conducted in-policy across ${result.sources ?? 0} source(s)`,
      };
    },
  };
}

function parseResult(output: string): OsintResult | null {
  try {
    const parsed: unknown = JSON.parse(output);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as OsintResult).conducted === "boolean"
    ) {
      return parsed as OsintResult;
    }
  } catch {
    // not an OsintResult envelope
  }
  return null;
}
