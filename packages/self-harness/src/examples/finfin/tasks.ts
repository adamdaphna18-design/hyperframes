import { DECISIONS } from "./catalog.js";
import type { FinfinTask, TradeResult } from "./finfin-agent.js";

/** Build the finfin decision suite from the decision catalog. */
export function buildFinfinSuite(): FinfinTask[] {
  return DECISIONS.map((decision) => ({
    id: decision.id,
    prompt: `Decide on: ${decision.setup}. Take it only if governance allows.`,
    decision,
    check(output: string) {
      const result = parseResult(output);
      if (!result || !result.governed) {
        return { passed: false, detail: result?.breach ?? "no result" };
      }
      return {
        passed: true,
        detail: `governed decision across ${result.confirmations ?? 0} confirmation(s)`,
      };
    },
  }));
}

function parseResult(output: string): TradeResult | null {
  try {
    const parsed: unknown = JSON.parse(output);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as TradeResult).governed === "boolean"
    ) {
      return parsed as TradeResult;
    }
  } catch {
    // not a TradeResult envelope
  }
  return null;
}
