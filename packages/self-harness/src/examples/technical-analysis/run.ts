import { defaultHarness } from "../../harness.js";
import { selfHarness } from "../../loop.js";
import { AAPL_END_DATE, AAPL_START_DATE, AAPL_CLOSES } from "./prices.js";
import { TaAgent } from "./ta-agent.js";
import { TaProposer } from "./ta-proposer.js";
import { buildTaSuite } from "./tasks.js";

/**
 * Drives the Self-Harness loop over real-price trading scenarios. Under the naive
 * harness the agent chases every move; the loop learns one indicator rule per
 * pattern (respect-rsi, use-macd, use-trend-cross, use-bollinger) — and the
 * regression gate rejects the over-aggressive "chase every positive move" rule
 * that would buy the overbought setups. The indicators are real, computed on a
 * genuine AAPL series; the same loop that learns DS practices learns TA discipline.
 */
export async function runTechnicalAnalysisDemo(): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  const agent = new TaAgent();
  const tasks = buildTaSuite();

  log(`Technical analysis → Self-Harness on real AAPL prices`);
  log(`${AAPL_CLOSES.length} daily closes (${AAPL_START_DATE} → ${AAPL_END_DATE})\n`);

  const result = await selfHarness({
    agent,
    proposer: new TaProposer(),
    tasks,
    initialHarness: defaultHarness(),
    onEvent: (e) => {
      if (e.type === "gate" && !e.decision.accepted && e.decision.regressions.length > 0) {
        log(
          `  gate rejected 'chase-momentum': it would buy the overbought setup(s) ${e.decision.regressions.join(", ")}`,
        );
      }
    },
  });

  log(`\ncorrect calls: ${pct(result.initialPassRate)} → ${pct(result.finalPassRate)}`);
  log(`learned indicator rules: ${result.finalHarness.rules.join(", ")}`);
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

// Executed directly: run.ts
if ((import.meta as { main?: boolean }).main) {
  runTechnicalAnalysisDemo().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
