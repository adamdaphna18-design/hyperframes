import type { CompanyTask, OsResult } from "./os-agent.js";
import { VERTICALS, type Vertical } from "./verticals.js";

/** Build the operating-system task suite: one task per specialist vertical. */
export function buildCompanySuite(): CompanyTask[] {
  return VERTICALS.map(toTask);
}

function toTask(vertical: Vertical): CompanyTask {
  return {
    id: vertical.id,
    prompt: `Run the ${vertical.name} vertical: read the brain and reach ${vertical.metric} ≥ ${vertical.threshold}.`,
    vertical,
    check(output: string) {
      const result = parseResult(output);
      if (!result || !result.shipped) {
        return { passed: false, detail: result?.blocked || "did not ship" };
      }
      const metric = result.metric ?? 0;
      const passed = metric >= vertical.threshold;
      return {
        passed,
        detail: `${vertical.metric}=${metric} ${passed ? "≥" : "<"} ${vertical.threshold}`,
      };
    },
  };
}

function parseResult(output: string): OsResult | null {
  try {
    const parsed: unknown = JSON.parse(output);
    if (parsed && typeof parsed === "object" && typeof (parsed as OsResult).shipped === "boolean") {
      return parsed as OsResult;
    }
  } catch {
    // not an OsResult envelope
  }
  return null;
}
