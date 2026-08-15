import type { CostRequest } from "./cost.js";
import { buildRequests } from "./requests.js";
import type { CostResult, CostTask } from "./router-agent.js";
import { MIN_TIER_FOR_CLASS, tierById } from "./tiers.js";

/** Build the task suite from the representative workload batch. */
export function buildCostSuite(): CostTask[] {
  return buildRequests().map(toTask);
}

function toTask(request: CostRequest): CostTask {
  const minViable = MIN_TIER_FOR_CLASS[request.cls];
  return {
    id: request.id,
    prompt: `Serve a ${request.cls} request at acceptable quality for the least cost.`,
    request,
    check(output: string) {
      const result = parseResult(output);
      if (!result) return { passed: false, detail: "no route" };
      const passed = tierById(result.tier).capability >= tierById(minViable).capability;
      return {
        passed,
        detail: passed
          ? `${request.cls}@${result.tier} ✓`
          : `${request.cls}@${result.tier} < ${minViable} (under-served)`,
      };
    },
  };
}

function parseResult(output: string): CostResult | null {
  try {
    const parsed: unknown = JSON.parse(output);
    if (parsed && typeof parsed === "object" && typeof (parsed as CostResult).tier === "string") {
      return parsed as CostResult;
    }
  } catch {
    // not a CostResult envelope
  }
  return null;
}
