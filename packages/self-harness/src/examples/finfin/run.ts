import { defaultHarness } from "../../harness.js";
import { selfHarness } from "../../loop.js";
import { AnthropicModel } from "../../models/anthropic.js";
import { ModelProposer } from "../../proposer.js";
import { runSuite } from "../../runner.js";
import type { Proposer } from "../../types.js";
import {
  FinfinAgent,
  paperBook,
  renderReasoning,
  type PaperTrade,
  type TradeResult,
} from "./finfin-agent.js";
import { finfinScriptedModel } from "./finfin-model.js";
import { FinfinHeuristicProposer } from "./finfin-proposer.js";
import { LIVE_PRICES, LIVE_PRICES_ASOF } from "./marks-fixture.js";
import { markBook } from "./marks.js";
import { buildFinfinSuite } from "./tasks.js";

export interface FinfinDemoOptions {
  /** Let the model author the governance rules (ModelProposer) instead of the heuristic. */
  useModel?: boolean;
  /** With `useModel`, drive the proposer with a live model instead of the offline stand-in. */
  live?: boolean;
}

/**
 * Drives the Self-Harness loop over a finfin decision suite: the agent trips
 * each real governance pitfall (fighting the regime, oversizing, chasing,
 * skipping the rug gate, cointegrating returns) and the loop learns the minimal
 * rule that fixes it — with the regression gate REJECTING the over-broad
 * "halt all trading" throttle that would starve the legitimate,
 * confirmation-heavy trades. The same loop that learns data-science practice and
 * OSINT guardrails learns finfin's governance rails: the framework is
 * domain-agnostic; the pathologies here are the ones a real session hit.
 */
export async function runFinfinDemo(options: FinfinDemoOptions = {}): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  const agent = new FinfinAgent();
  const tasks = buildFinfinSuite();
  const proposer = selectProposer(options);
  const tag = options.useModel ? " — model proposer" : "";
  log(`finfin decision suite → Self-Harness learns governance rails${tag}\n`);

  let rejectedHalt = false;
  const result = await selfHarness({
    agent,
    proposer,
    tasks,
    initialHarness: defaultHarness(),
    onEvent: (e) => {
      if (e.type === "gate" && !e.decision.accepted && e.decision.regressions.length > 0) {
        rejectedHalt = true;
        log(
          `  gate rejected an over-broad fix: it would regress ` +
            `${e.decision.regressions.length} legitimate trade(s)`,
        );
      }
    },
  });

  log(`\ngoverned-decision rate: ${pct(result.initialPassRate)} → ${pct(result.finalPassRate)}`);
  log("learned governance rails: " + (result.finalHarness.rules.join(", ") || "-"));
  log(`confirmation budget preserved: maxToolCalls = ${result.finalHarness.limits.maxToolCalls}`);
  if (rejectedHalt) {
    log("(the halt-all-trading fix was rejected — risk edits are still gated against regressions)");
  }

  await printExecution(log, agent, tasks, result.finalHarness);
}

/** Run the suite under the final governed harness and print each decision's reasoning + the paper book. */
async function printExecution(
  log: (line: string) => void,
  agent: FinfinAgent,
  tasks: ReturnType<typeof buildFinfinSuite>,
  finalHarness: Parameters<typeof runSuite>[1],
): Promise<void> {
  const final = await runSuite(agent, finalHarness, tasks);
  log("\n── decisions under the final governed harness (each explains itself) ──");
  for (const r of final.results) log("  " + renderReasoning(r.trajectory));

  // Mark the EXECUTED book to live prices → real P&L.
  const trades = paperBook(final.results.map((r) => r.trajectory));
  const pnl = markBook(trades, LIVE_PRICES);
  log(`\n── executed paper book, marked to live prices (${LIVE_PRICES_ASOF}) ──`);
  for (const m of pnl.marked) {
    log(
      `  ${m.direction.padEnd(7)} ${m.ticker.padEnd(7)} $${String(m.notionalUsd).padStart(4)} ` +
        `@ ${m.entry} → ${m.mark}  ${signPct(m.returnPct)}  P&L ${signUsd(m.pnlUsd)}`,
    );
  }
  log(
    `  ── book P&L: ${signUsd(pnl.totalPnlUsd)} on $${pnl.totalNotional} (${signPct(pnl.totalReturnPct)})`,
  );

  // Mark what the VETOES declined → the P&L governance avoided.
  const declined = declinedTrades(final.results.map((r) => r.trajectory));
  const avoided = markBook(declined, LIVE_PRICES);
  log(`\n── what the governance vetoes DECLINED (avoided P&L) ──`);
  for (const m of avoided.marked) {
    log(
      `  ${m.ticker.padEnd(7)} would-be ${signPct(m.returnPct)} → avoided P&L ${signUsd(-m.pnlUsd)}`,
    );
  }
  log(
    `  ── vetoes changed the book by ${signUsd(-avoided.totalPnlUsd)} ` +
      `(declining ${avoided.marked.length} trades that would have netted ${signUsd(avoided.totalPnlUsd)})`,
  );
}

/** The trades the veto rails DECLINED (STAND_ASIDE with a recorded would-be trade), for avoided-P&L marking. */
function declinedTrades(trajectories: { output: string }[]): PaperTrade[] {
  const out: PaperTrade[] = [];
  for (const t of trajectories) {
    const r = JSON.parse(t.output) as TradeResult;
    if (r.action === "STAND_ASIDE" && r.declined) out.push(r.declined);
  }
  return out;
}

function signPct(x: number): string {
  return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;
}

function signUsd(x: number): string {
  return `${x >= 0 ? "+" : "−"}$${Math.abs(x).toFixed(2)}`;
}

function selectProposer(options: FinfinDemoOptions): Proposer {
  if (!options.useModel) return new FinfinHeuristicProposer();
  return new ModelProposer(options.live ? new AnthropicModel() : finfinScriptedModel());
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

// Executed directly: run.ts [--model] [--live]
if ((import.meta as { main?: boolean }).main) {
  runFinfinDemo({
    useModel: process.argv.includes("--model"),
    live: process.argv.includes("--live"),
  }).catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
