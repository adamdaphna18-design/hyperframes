import type { TaResult, TaTask } from "./ta-agent.js";
import { SCENARIOS, type TaScenario } from "./scenarios.js";

/** Build the task suite from the real-price trading scenarios. */
export function buildTaSuite(): TaTask[] {
  return SCENARIOS.map(toTask);
}

function toTask(scenario: TaScenario): TaTask {
  return {
    id: scenario.id,
    prompt: `On the ${scenario.pattern} setup (${scenario.window.length} days of AAPL), make the disciplined call.`,
    scenario,
    check(output: string) {
      const result = parseResult(output);
      if (!result) return { passed: false, detail: "no signal" };
      const passed = result.signal === scenario.correct;
      return {
        passed,
        detail: passed
          ? `${result.signal} (${result.indicator}) ✓`
          : `${result.signal} ≠ ${scenario.correct} (${scenario.pattern})`,
      };
    },
  };
}

function parseResult(output: string): TaResult | null {
  try {
    const parsed: unknown = JSON.parse(output);
    if (parsed && typeof parsed === "object" && typeof (parsed as TaResult).signal === "string") {
      return parsed as TaResult;
    }
  } catch {
    // not a TaResult envelope
  }
  return null;
}
