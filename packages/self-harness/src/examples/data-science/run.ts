import { defaultHarness } from "../../harness.js";
import { runSelfHarnessLoop } from "../../loop-runner.js";
import { AnthropicModel } from "../../models/anthropic.js";
import { ModelProposer } from "../../proposer.js";
import type { Agent, Proposer } from "../../types.js";
import { AgenticDsAgent, RuleAwareModel } from "./agentic-agent.js";
import { DsAgent } from "./ds-agent.js";
import { dsScriptedModel } from "./ds-model.js";
import { DsHeuristicProposer } from "./ds-proposer.js";
import { dsTasksAtLevel, growByLevel } from "./tasks.js";

export interface DataScienceDemoOptions {
  /** Use the staged, model-governed agent instead of the deterministic one. */
  agentic?: boolean;
  /** Let the model author the harness rules (ModelProposer) instead of the heuristic. */
  useModel?: boolean;
  /** With `useModel`, drive the proposer with a live model instead of the offline stand-in. */
  live?: boolean;
}

/**
 * Drives the outer Self-Harness loop across the four difficulty levels of the
 * Beginner-Data-Science-Projects suite. It starts on Level 1, learns the harness
 * rules that fix each recurring pitfall, then grows the suite one level at a
 * time — Level 2/3/4 projects that share a pitfall pass immediately (the learned
 * rules transfer), while new pathologies trigger new rules. It converges once a
 * level adds nothing left to learn, and prints the resulting `progress.md`.
 *
 * `useModel` swaps the heuristic proposer for the {@link ModelProposer}, so the
 * model itself authors each best-practice rule from the failure cluster — the
 * "rule creator" path — with the regression gate validating every rule it writes.
 */
export async function runDataScienceDemo(options: DataScienceDemoOptions = {}): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  const agent: Agent = options.agentic ? new AgenticDsAgent(new RuleAwareModel()) : new DsAgent();
  const proposer = selectProposer(options);
  const tags = [
    options.agentic ? "agentic agent" : null,
    options.useModel ? "model proposer" : null,
  ]
    .filter(Boolean)
    .join(" + ");
  log(
    `Beginner-Data-Science-Projects → Self-Harness suite (grows Level 1 → 4)` +
      (tags ? ` — ${tags}\n` : "\n"),
  );

  const result = await runSelfHarnessLoop({
    agent,
    proposer,
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

function selectProposer(options: DataScienceDemoOptions): Proposer {
  if (!options.useModel) return new DsHeuristicProposer();
  return new ModelProposer(options.live ? new AnthropicModel() : dsScriptedModel());
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

// Executed directly: bun run src/examples/data-science/run.ts [--agentic] [--model] [--live]
if ((import.meta as { main?: boolean }).main) {
  runDataScienceDemo({
    agentic: process.argv.includes("--agentic"),
    useModel: process.argv.includes("--model"),
    live: process.argv.includes("--live"),
  }).catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
