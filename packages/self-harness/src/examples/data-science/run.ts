import { defaultHarness } from "../../harness.js";
import { selfHarness } from "../../loop.js";
import { runSelfHarnessLoop } from "../../loop-runner.js";
import { AnthropicModel } from "../../models/anthropic.js";
import { ModelProposer } from "../../proposer.js";
import { RefiningModelProposer, renderRefinements } from "../../refining-proposer.js";
import type { Agent, Proposer, Task } from "../../types.js";
import { AgenticDsAgent, RuleAwareModel } from "./agentic-agent.js";
import { CommitteeProposer, renderCourtRecords } from "./committee.js";
import { DsAgent } from "./ds-agent.js";
import { dsScriptedModel, refiningDsScriptedModel } from "./ds-model.js";
import { DsHeuristicProposer } from "./ds-proposer.js";
import { buildDsSuite, dsTasksAtLevel, growByLevel } from "./tasks.js";

export interface DataScienceDemoOptions {
  /** Use the staged, model-governed agent instead of the deterministic one. */
  agentic?: boolean;
  /** Let the model author the harness rules (ModelProposer) instead of the heuristic. */
  useModel?: boolean;
  /** With `useModel`, drive the proposer with a live model instead of the offline stand-in. */
  live?: boolean;
  /** Review every proposed edit with the SR / R&D / DR-Venus committee. */
  committee?: boolean;
  /** Let the model self-correct rejected edits via the regression-gate oracle. */
  refine?: boolean;
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
  if (options.committee) return runCommitteeDemo(options);
  if (options.refine) return runRefiningDemo(options);
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

/**
 * Runs one Self-Harness campaign over the whole DS suite, prints the before/after
 * pass rate and learned rules, then appends a proposer-specific transcript. The
 * `build` callback wires the concrete proposer and how to render its record.
 */
async function runCampaign(
  options: DataScienceDemoOptions,
  banner: string,
  build: (agent: Agent, tasks: Task[]) => { proposer: Proposer; renderTail: () => string },
): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  const agent: Agent = options.agentic ? new AgenticDsAgent(new RuleAwareModel()) : new DsAgent();
  const tasks = buildDsSuite(4);
  const { proposer, renderTail } = build(agent, tasks);
  log(banner + "\n");

  const result = await selfHarness({ agent, proposer, tasks, initialHarness: defaultHarness() });

  log(`pass rate: ${pct(result.initialPassRate)} → ${pct(result.finalPassRate)}`);
  log("learned rules: " + (result.finalHarness.rules.join(", ") || "-"));
  log("\n" + renderTail());
}

/**
 * Runs one Self-Harness campaign over the whole DS suite where every proposed
 * edit must pass the SR / R&D / DR-Venus committee before the gate sees it, then
 * prints the committee's court records — showing the aggressive compute-clamp
 * candidate vetoed on empirical and architectural grounds.
 */
function runCommitteeDemo(options: DataScienceDemoOptions): Promise<void> {
  return runCampaign(
    options,
    "Data-science suite reviewed by the SR / R&D / DR-Venus committee",
    (agent, tasks) => {
      const committee = new CommitteeProposer({ inner: selectProposer(options), agent, tasks });
      return {
        proposer: committee,
        renderTail: () => renderCourtRecords(committee.courtRecords()),
      };
    },
  );
}

/**
 * Runs one Self-Harness campaign where a {@link RefiningModelProposer} authors
 * each edit and self-corrects the ones the gate rejects. The transcript shows the
 * model's first reflex for "runaway-training" — the blunt compute clamp — being
 * rejected for regressing the heavy projects, then its refined `use-early-stopping`
 * rule being accepted: learning from the rejection instead of giving up on it.
 */
function runRefiningDemo(options: DataScienceDemoOptions): Promise<void> {
  return runCampaign(
    options,
    "Data-science suite with a self-correcting (refining) model proposer",
    (agent, tasks) => {
      const model = options.live ? new AnthropicModel() : refiningDsScriptedModel();
      const proposer = new RefiningModelProposer({ model, agent, tasks });
      return { proposer, renderTail: () => renderRefinements(proposer.refinements()) };
    },
  );
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

// Executed directly: run.ts [--agentic] [--model] [--live] [--committee] [--refine]
if ((import.meta as { main?: boolean }).main) {
  runDataScienceDemo({
    agentic: process.argv.includes("--agentic"),
    useModel: process.argv.includes("--model"),
    live: process.argv.includes("--live"),
    committee: process.argv.includes("--committee"),
    refine: process.argv.includes("--refine"),
  }).catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
