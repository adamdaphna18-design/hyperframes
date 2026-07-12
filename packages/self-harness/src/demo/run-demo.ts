import { SimulatedAgent } from "../agents/simulated.js";
import { defaultHarness } from "../harness.js";
import { selfHarness, type LoopEvent } from "../loop.js";
import { HeuristicProposer } from "../proposer.js";
import { buildDemoSuite } from "./pathologies.js";

/**
 * Runnable end-to-end demo of the Self-Harness loop, fully offline and
 * deterministic. Reproduces the paper's core phenomenon: an agent starting from
 * a naive harness discovers its own recurring failure patterns, proposes
 * minimal edits, and the regression gate keeps every edit from breaking what
 * already worked. Run with `bun run demo`.
 */
export async function runDemo(): Promise<void> {
  const agent = new SimulatedAgent();
  const proposer = new HeuristicProposer();
  const tasks = buildDemoSuite();

  const log = (line: string) => process.stdout.write(line + "\n");

  const result = await selfHarness({
    agent,
    proposer,
    tasks,
    initialHarness: defaultHarness(),
    onEvent: (event) => log(describeEvent(event)),
  });

  log("\n════════ Self-Harness summary ════════");
  log(`pass rate: ${pct(result.initialPassRate)} → ${pct(result.finalPassRate)}`);
  log("final harness limits: " + JSON.stringify(result.finalHarness.limits));
  log("harness fingerprint (learned rules):");
  for (const rule of result.finalHarness.rules) log(`  - ${rule}`);
}

/** Render one loop event as a single log line. */
export function describeEvent(event: LoopEvent): string {
  switch (event.type) {
    case "round-start":
      return `\n── round ${event.round} — pass rate ${pct(event.passRate)} ──`;
    case "cluster":
      return `  cluster: "${event.cluster.pattern}" × ${event.cluster.count} (${event.cluster.taskIds.join(", ")})`;
    case "gate":
      return `  gate ${event.decision.patch.id}: ${event.decision.reason}`;
    case "accept":
      return `  ✓ committed ${event.decision.patch.id}: ${event.diff.join("; ")}`;
    case "stuck":
      return `  ✗ stuck on "${event.pattern}" — no candidate survived the gate`;
    case "done":
      return `\ndone: ${event.reason}`;
  }
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

// Executed directly (bun run src/demo/run-demo.ts).
if ((import.meta as { main?: boolean }).main) {
  runDemo().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
