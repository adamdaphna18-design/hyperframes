import { defaultHarness } from "../../harness.js";
import { runSelfHarnessLoop } from "../../loop-runner.js";
import { DsAgent } from "./ds-agent.js";
import { DsHeuristicProposer } from "./ds-proposer.js";
import { dsTasksAtLevel } from "./tasks.js";
import type { DsLevel } from "./projects.js";

/**
 * Drives the outer Self-Harness loop across the four difficulty levels of the
 * Beginner-Data-Science-Projects suite. It starts on Level 1, learns the harness
 * rules that fix each recurring pitfall, then grows the suite one level at a
 * time — Level 2/3/4 projects that share a pitfall pass immediately (the learned
 * rules transfer), while new pathologies trigger new rules. It converges once a
 * level adds nothing left to learn, and prints the resulting `progress.md`.
 */
export async function runDataScienceDemo(): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  log("Beginner-Data-Science-Projects → Self-Harness suite (grows Level 1 → 4)\n");

  const result = await runSelfHarnessLoop({
    agent: new DsAgent(),
    proposer: new DsHeuristicProposer(),
    initialHarness: defaultHarness(),
    initialTasks: dsTasksAtLevel(1),
    growSuite: (iteration) => {
      // Iteration 1 runs Level 1 (the initial tasks); each later iteration adds
      // the next level, so the suite grows one difficulty tier at a time.
      const level = iteration as DsLevel;
      return level >= 2 && level <= 4 ? dsTasksAtLevel(level) : [];
    },
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

// Executed directly (bun run src/examples/data-science/run.ts).
if ((import.meta as { main?: boolean }).main) {
  runDataScienceDemo().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
