import { defaultHarness } from "../harness.js";
import type { Agent, Proposer, Task } from "../types.js";
import { BillingAgent } from "../examples/cost-router/billing-agent.js";
import { PricingProposer } from "../examples/cost-router/billing-proposer.js";
import { buildBillingSuite } from "../examples/cost-router/billing-tasks.js";
import { CostProposer } from "../examples/cost-router/cost-proposer.js";
import { CostRouter } from "../examples/cost-router/router-agent.js";
import { buildCostSuite } from "../examples/cost-router/tasks.js";
import { McpNode } from "../examples/mcp-node/node-agent.js";
import { RepairProposer } from "../examples/mcp-node/node-proposer.js";
import { buildMcpSuite } from "../examples/mcp-node/tasks.js";
import { TaAgent } from "../examples/technical-analysis/ta-agent.js";
import { TaProposer } from "../examples/technical-analysis/ta-proposer.js";
import { buildTaSuite } from "../examples/technical-analysis/tasks.js";
import { runWithPolicy, type AcceptancePolicy, type PolicyRunResult } from "./policy-loop.js";
import { buildSyntheticCampaign, type SyntheticConfig } from "./synthetic.js";

const POLICIES: AcceptancePolicy[] = ["greedy-first", "net-positive", "gated"];

interface Aggregate {
  policy: AcceptancePolicy;
  runs: number;
  avgFinalPassRate: number;
  totalRegressions: number;
  runsThatBrokeSomething: number;
  avgFixed: number;
}

function aggregate(policy: AcceptancePolicy, results: PolicyRunResult[]): Aggregate {
  const runs = results.length;
  const sum = (f: (r: PolicyRunResult) => number) => results.reduce((n, r) => n + f(r), 0);
  return {
    policy,
    runs,
    avgFinalPassRate: runs > 0 ? sum((r) => r.finalPassRate) / runs : 0,
    totalRegressions: sum((r) => r.regressions),
    runsThatBrokeSomething: results.filter((r) => !r.safe).length,
    avgFixed: runs > 0 ? sum((r) => r.fixed) / runs : 0,
  };
}

async function sweepSynthetic(seeds: number, cfg: SyntheticConfig): Promise<Aggregate[]> {
  const out: Aggregate[] = [];
  for (const policy of POLICIES) {
    const results: PolicyRunResult[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const { agent, proposer, tasks } = buildSyntheticCampaign(seed, cfg);
      results.push(
        await runWithPolicy({ agent, proposer, tasks, initialHarness: defaultHarness(), policy }),
      );
    }
    out.push(aggregate(policy, results));
  }
  return out;
}

interface RealCampaign {
  name: string;
  make: () => { agent: Agent; proposer: Proposer; tasks: Task[] };
}

const REAL: RealCampaign[] = [
  {
    name: "cost-router",
    make: () => ({
      agent: new CostRouter(),
      proposer: new CostProposer(),
      tasks: buildCostSuite(),
    }),
  },
  {
    name: "billing",
    make: () => ({
      agent: new BillingAgent(),
      proposer: new PricingProposer(),
      tasks: buildBillingSuite(),
    }),
  },
  {
    name: "mcp-node",
    make: () => ({ agent: new McpNode(), proposer: new RepairProposer(), tasks: buildMcpSuite() }),
  },
  {
    name: "technical-analysis",
    make: () => ({ agent: new TaAgent(), proposer: new TaProposer(), tasks: buildTaSuite() }),
  },
];

export async function runBenchmarkDemo(): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  const seeds = 400;
  const cfg: SyntheticConfig = {
    broken: 6,
    protectedTasks: 4,
    sideEffectProb: 0.25,
    bundleProb: 0.2,
    coupledProb: 0.15,
  };

  log("Gate benchmark — the difference vs the market, at scale");
  log(`${seeds} randomized campaigns × 3 acceptance policies, plus 4 real product campaigns.\n`);

  const syn = await sweepSynthetic(seeds, cfg);
  printSweep(syn, seeds, log);
  await printReal(log);

  const gated = syn.find((a) => a.policy === "gated");
  log(
    `\nBottom line: only the gate never breaks a working task (${gated?.runsThatBrokeSomething ?? 0}/${seeds} runs regressed).`,
  );
  log(
    "The market's net-positive criterion trades broken tasks for a little more coverage; the gate refuses that trade.",
  );
}

function printSweep(syn: Aggregate[], seeds: number, log: (line: string) => void): void {
  log(`Synthetic sweep (${seeds} campaigns each):`);
  log("  policy         avg-final-pass  runs-that-broke-something  total-regressions  avg-fixed");
  for (const a of syn) {
    log(
      `  ${a.policy.padEnd(13)}  ${pct(a.avgFinalPassRate).padStart(13)}  ${String(a.runsThatBrokeSomething).padStart(24)}  ${String(a.totalRegressions).padStart(17)}  ${a.avgFixed.toFixed(1).padStart(9)}`,
    );
  }
}

async function printReal(log: (line: string) => void): Promise<void> {
  log("\nReal product campaigns (regressions each policy introduces):");
  log("  campaign             greedy-first   net-positive   gated");
  for (const c of REAL) {
    const cells = await Promise.all(POLICIES.map((policy) => regressionsFor(c, policy)));
    log(
      `  ${c.name.padEnd(20)} ${cells[0]?.padStart(12)}   ${cells[1]?.padStart(12)}   ${cells[2]?.padStart(6)}`,
    );
  }
}

async function regressionsFor(c: RealCampaign, policy: AcceptancePolicy): Promise<string> {
  const { agent, proposer, tasks } = c.make();
  const r = await runWithPolicy({
    agent,
    proposer,
    tasks,
    initialHarness: defaultHarness(),
    policy,
  });
  return `${r.regressions} (${pct(r.finalPassRate)})`;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

// Executed directly: run.ts
if ((import.meta as { main?: boolean }).main) {
  runBenchmarkDemo().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
