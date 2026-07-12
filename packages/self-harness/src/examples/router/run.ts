import { defaultHarness } from "../../harness.js";
import { selfHarness } from "../../loop.js";
import { runSuite } from "../../runner.js";
import type { Harness } from "../../types.js";
import { Router } from "./router-agent.js";
import { RouterProposer } from "./router-proposer.js";
import { SPECIALISTS } from "./specialists.js";
import { buildRouterSuite } from "./tasks.js";

/**
 * Reproduces the TinyRouter result offline: a tiny router whose whole policy is a
 * handful of learned routing rules beats every individual specialist by smart
 * routing — and every routing rule is regression-gated, so learning to route one
 * domain never misroutes a domain that already worked.
 */
export async function runRouterDemo(): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  const agent = new Router();
  const tasks = buildRouterSuite();

  log("TinyRouter → Self-Harness learns a regression-gated routing policy\n");
  log(`roster: ${SPECIALISTS.map((s) => s.name).join(", ")}`);

  // Each specialist "used alone" = routing everything to it. The best single
  // model still only covers its own domain.
  let bestSingle = 0;
  let bestName = "-";
  for (const s of SPECIALISTS) {
    const solo = await withRoutes(defaultHarness(), [`route:*=${s.id}`]);
    const rate = (await runSuite(agent, solo, tasks)).passRate;
    if (rate > bestSingle) {
      bestSingle = rate;
      bestName = s.name;
    }
  }
  log(`best single model: ${bestName} at ${pct(bestSingle)}\n`);

  // The router learns the policy, gated.
  const result = await selfHarness({
    agent,
    proposer: new RouterProposer(),
    tasks,
    initialHarness: defaultHarness(),
    onEvent: (e) => {
      if (e.type === "gate" && !e.decision.accepted && e.decision.regressions.length > 0) {
        log(
          `  gate rejected a greedy catch-all route: it would misroute ${e.decision.regressions.join(", ")}`,
        );
      }
    },
  });

  log(`\nrouter accuracy: ${pct(result.initialPassRate)} → ${pct(result.finalPassRate)}`);
  log(`learned routing policy: ${result.finalHarness.rules.join(", ")}`);
  log(
    `\nthe tiny router (${result.finalHarness.rules.length} routing rules) beats the best single ` +
      `model, ${pct(result.finalPassRate)} vs ${pct(bestSingle)} — smart routing, not brute force`,
  );
}

async function withRoutes(base: Harness, routes: string[]): Promise<Harness> {
  return { ...base, rules: [...base.rules, ...routes] };
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

// Executed directly: run.ts
if ((import.meta as { main?: boolean }).main) {
  runRouterDemo().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
