import { defaultHarness } from "../../harness.js";
import { selfHarness } from "../../loop.js";
import { AnthropicModel } from "../../models/anthropic.js";
import { ModelProposer } from "../../proposer.js";
import type { Proposer } from "../../types.js";
import { FinfinAgent } from "./finfin-agent.js";
import { finfinScriptedModel } from "./finfin-model.js";
import { FinfinHeuristicProposer } from "./finfin-proposer.js";
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
