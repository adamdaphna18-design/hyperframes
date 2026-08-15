import type { Agent, Harness, Task, ToolCall, Trajectory } from "../../types.js";
import { bollinger, macd, rsi, sma } from "./indicators.js";
import { HARMFUL_RULE, type Signal, type TaScenario } from "./scenarios.js";

/** A task bound to one trading scenario. */
export interface TaTask extends Task {
  scenario: TaScenario;
}

/** The structured call the agent reports (parsed by the verifier). */
export interface TaResult {
  signal: Signal;
  indicator: string;
  reading: number;
}

/**
 * A technical-analysis agent. It computes the real indicator for the scenario and
 * makes the disciplined call **only when the harness enables that indicator** —
 * without the rule it defaults to a naive "buy the move", which is wrong for every
 * non-trivial setup. The `chase-momentum` rule buys on any positive MACD, which is
 * right for a momentum setup but wrong for a calm day that happens to be trending
 * up (e.g. `neutral-40`, whose disciplined call is hold) — and because that calm
 * setup already passes at baseline, buying it is the regression the gate catches.
 */
export class TaAgent implements Agent {
  async run(harness: Harness, task: Task): Promise<Trajectory> {
    const { scenario } = task as TaTask;
    const rules = new Set(harness.rules);
    const { signal, indicator, reading } = decide(scenario, rules);
    const passed = signal === scenario.correct;

    const toolCalls: ToolCall[] = [
      { name: "indicator.compute", args: `${indicator}=${reading.toFixed(2)}`, ok: true },
      { name: "signal.emit", args: signal, ok: passed },
    ];
    const result: TaResult = { signal, indicator, reading };
    return {
      taskId: scenario.id,
      toolCalls,
      output: JSON.stringify(result),
      failureSignals: passed ? [] : [scenario.pattern],
    };
  }
}

function decide(
  scenario: TaScenario,
  rules: Set<string>,
): { signal: Signal; indicator: string; reading: number } {
  const prices = scenario.window;

  // The over-aggressive rule fires first: buy on any positive momentum. It buys
  // the momentum setups (right) but also a calm, baseline-passing "hold" day that
  // happens to be trending up (wrong) — the regression the gate must catch.
  if (rules.has(HARMFUL_RULE)) {
    const m = macd(prices).histogram;
    if (m > 0) return { signal: "buy", indicator: "macd-hist(chase)", reading: m };
  }

  // Neutral setups need no rule — the disciplined call is to stand pat.
  if (!scenario.requiredRule) {
    return { signal: scenario.correct, indicator: "none", reading: 0 };
  }

  // With the right indicator rule, make the disciplined, correct call.
  if (rules.has(scenario.requiredRule)) {
    return {
      signal: scenario.correct,
      indicator: indicatorFor(scenario),
      reading: readingFor(scenario),
    };
  }

  // Without the indicator, the naive agent gets it wrong — chasing a breakout it
  // shouldn't or missing one it should.
  return { signal: opposite(scenario.correct), indicator: "naive", reading: 0 };
}

function opposite(signal: Signal): Signal {
  return signal === "buy" ? "hold" : "buy";
}

function indicatorFor(s: TaScenario): string {
  return {
    overbought: "rsi",
    "macd-bullish": "macd-hist",
    "golden-cross": "sma-50/200",
    "bollinger-breakout": "bollinger",
    neutral: "none",
  }[s.pattern];
}

function readingFor(s: TaScenario): number {
  const p = s.window;
  switch (s.pattern) {
    case "overbought":
      return rsi(p);
    case "macd-bullish":
      return macd(p).histogram;
    case "golden-cross":
      return sma(p, 50) - sma(p, 200);
    case "bollinger-breakout":
      return (p.at(-1) ?? 0) - bollinger(p).upper;
    default:
      return 0;
  }
}
