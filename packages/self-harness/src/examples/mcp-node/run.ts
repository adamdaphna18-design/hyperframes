import { defaultHarness } from "../../harness.js";
import { selfHarness } from "../../loop.js";
import { McpNode } from "./node-agent.js";
import { RepairProposer } from "./node-proposer.js";
import { buildMcpSuite } from "./tasks.js";

/**
 * Drives the Self-Harness loop over a self-correcting MCP node. Under the naive
 * harness the node breaks the three ways every MCP integration breaks — a drifted
 * field, a bad argument format, a rate limit. The loop clusters each failure and
 * promotes its repair into a permanent rule, so what a blueprint node would pay a
 * micro-LLM to re-fix on every call, this node handles for free forever. The gate
 * rejects the blanket `retry:all` "repair" because it double-executes a payment
 * charge — the exact footgun a self-healing loop without a gate would ship.
 */
export async function runMcpNodeDemo(): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  const agent = new McpNode();
  const tasks = buildMcpSuite();

  log("self-correcting MCP node → Self-Harness");
  log("messy enterprise env: a drifted field, a bad date format, a rate limit.\n");

  const result = await selfHarness({
    agent,
    proposer: new RepairProposer(),
    tasks,
    initialHarness: defaultHarness(),
    onEvent: (e) => {
      if (e.type === "gate" && !e.decision.accepted && e.decision.regressions.length > 0) {
        log(
          `  gate rejected 'retry:all': it double-executes ${e.decision.regressions.join(", ")} (a charge)`,
        );
      }
    },
  });

  const learned = result.finalHarness.rules;
  log(`\ncalls handled correctly: ${pct(result.initialPassRate)} → ${pct(result.finalPassRate)}`);
  log(`learned repairs (now free, no per-call LLM fix): ${learned.join(", ")}`);
  log(
    `\n${learned.length} recurring failure classes converted from per-call LLM repairs into permanent gated rules.`,
  );
  log("The runtime repairer stays only for the novel long tail — the common cases are learned.");
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

// Executed directly: run.ts
if ((import.meta as { main?: boolean }).main) {
  runMcpNodeDemo().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
