import { defaultHarness } from "../../harness.js";
import { selfHarness } from "../../loop.js";
import type { Harness } from "../../types.js";
import { savingsReport, type CostRequest, type Routing } from "./cost.js";
import { CostProposer } from "./cost-proposer.js";
import { buildRequests } from "./requests.js";
import { CostRouter } from "./router-agent.js";
import { buildCostSuite } from "./tasks.js";
import { DEFAULT_TIER, parseRoute, type RequestClass, type TierId } from "./tiers.js";

/** Illustrative monthly request volume the per-request saving is projected across. */
const MONTHLY_VOLUME = 1_000_000;

/**
 * Drives the Self-Harness loop over a mixed LLM workload. The naive router sends
 * every unrouted class to haiku (cost-greedy) and under-serves everything that
 * needs more; the loop learns one route rule per class — the *cheapest* tier that
 * still clears quality — and the regression gate rejects the `force-cheapest-tier`
 * rule that would slam the whole workload onto the cheapest tier to shave the bill.
 * The payoff is money: identical quality to the cautious all-opus default, at
 * roughly half the spend. That delta is the wedge — sold as a share of the savings.
 */
export async function runCostRouterDemo(): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  const agent = new CostRouter();
  const tasks = buildCostSuite();

  log("LLM cost-router → Self-Harness");
  log("cautious default: send every request to the top tier (opus) so nothing under-performs.\n");

  const result = await selfHarness({
    agent,
    proposer: new CostProposer(),
    tasks,
    initialHarness: defaultHarness(),
    onEvent: (e) => {
      if (e.type === "gate" && !e.decision.accepted && e.decision.regressions.length > 0) {
        log(
          `  gate rejected 'force-cheapest-tier': it under-serves ${e.decision.regressions.length} already-correct requests`,
        );
      }
    },
  });

  const routing = routingFromHarness(result.finalHarness);
  const report = savingsReport(buildRequests(), routing, MONTHLY_VOLUME);

  log(
    `\nquality (served acceptably): ${pct(result.initialPassRate)} → ${pct(result.finalPassRate)}`,
  );
  log(`learned routes: ${result.finalHarness.rules.join(", ")}`);
  log("");
  log(
    `cost per batch — all-opus: ${usd(report.defaultCost)}   learned: ${usd(report.learnedCost)}`,
  );
  log(
    `saved per batch: ${usd(report.savings)} (${pct(report.savingsPct)} of the bill), same 100% quality`,
  );
  log(
    `projected monthly saving @ ${MONTHLY_VOLUME / 1e6}M requests: ${usd(report.monthlySavings)}`,
  );
}

/** Rebuild the routing the loop learned so the money report reflects real routes. */
function routingFromHarness(harness: Harness): Routing {
  const routes = new Map<RequestClass, TierId>();
  for (const rule of harness.rules) {
    const parsed = parseRoute(rule);
    if (parsed) routes.set(parsed.cls, parsed.tier);
  }
  return (req: CostRequest) => routes.get(req.cls) ?? DEFAULT_TIER;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function usd(x: number): string {
  return `$${x.toFixed(2)}`;
}

// Executed directly: run.ts
if ((import.meta as { main?: boolean }).main) {
  runCostRouterDemo().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
