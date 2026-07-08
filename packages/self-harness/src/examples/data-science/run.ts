import { defaultHarness } from "../../harness.js";
import { runSelfHarnessLoop } from "../../loop-runner.js";
import type { Agent } from "../../types.js";
import { AgenticDsAgent, RuleAwareModel } from "./agentic-agent.js";
import { DsAgent } from "./ds-agent.js";
import { DsHeuristicProposer } from "./ds-proposer.js";
import { dsTasksAtLevel, growByLevel } from "./tasks.js";

/**
 * Drives the outer Self-Harness loop across the four difficulty levels of the
 * Beginner-Data-Science-Projects suite. It starts on Level 1, learns the harness
 * rules that fix each recurring pitfall, then grows the suite one level at a
 * time — Level 2/3/4 projects that share a pitfall pass immediately (the learned
 * rules transfer), while new pathologies trigger new rules. It converges once a
 * level adds nothing left to learn, and prints the resulting `progress.md`.
 */
export async function runDataScienceDemo(options: { agentic?: boolean } = {}): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  const agent: Agent = options.agentic ? new AgenticDsAgent(new RuleAwareModel()) : new DsAgent();
  log(
    `Beginner-Data-Science-Projects → Self-Harness suite (grows Level 1 → 4)` +
      (options.agentic ? " — agentic (model-governed) agent\n" : "\n"),
  );

  const result = await runSelfHarnessLoop({
    agent,
    proposer: new DsHeuristicProposer(),
    initialHarness: defaultHarness(),
    initialTasks: dsTasksAtLevel(1),
    growSuite: growByLevel,
    maxIterations: 8,
    convergenceRounds: 2,
    onIteration: (it) =>
      log(
        `iteration ${it.iteration}: +${it.addedTaskIds.length} tasks, ` +
          `pass ${pct(it.initialPassRate)} → ${pct(it.finalPassRate)}, ` +
          `learned [${it.learnedRules.join(", ") || "-"}]`,
      ),
  });

  log("\n" + result.memoryMarkdown);
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

// Executed directly (bun run src/examples/data-science/run.ts [--agentic]).
if ((import.meta as { main?: boolean }).main) {
  runDataScienceDemo({ agentic: process.argv.includes("--agentic") }).catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
