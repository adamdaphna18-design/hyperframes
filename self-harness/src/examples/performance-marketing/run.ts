import { defaultHarness } from "../../harness.js";
import { selfHarness } from "../../loop.js";
import { PmAgent } from "./pm-agent.js";
import { PmHeuristicProposer } from "./pm-proposer.js";
import { buildPmSuite } from "./tasks.js";

/**
 * Drives the Self-Harness loop over the ad-budget suite: the agent trips each
 * fundamental-feature failure (over-cap budget changes, ungrounded
 * recommendations, self-approved executions, action without a trigger, unlogged
 * actions) and the loop learns the minimal guardrail that fixes it — with the
 * regression gate rejecting the over-broad "freeze all budget changes" candidate
 * that would block legitimate in-cap actions. The learned harness is a
 * fingerprint of exactly the rails the ButterflyLedger + Chapter 3.3 design call
 * for.
 */
export async function runPmDemo(): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  const agent = new PmAgent();
  const tasks = buildPmSuite();
  const proposer = new PmHeuristicProposer();
  log("Performance-marketing suite → Self-Harness learns the ad-budget guardrails\n");

  let rejectedFreeze = false;
  const result = await selfHarness({
    agent,
    proposer,
    tasks,
    initialHarness: defaultHarness(),
    onEvent: (e) => {
      if (e.type === "gate" && !e.decision.accepted && e.decision.regressions.length > 0) {
        rejectedFreeze = true;
        log(
          `  gate rejected an over-broad guardrail: it would regress ` +
            `${e.decision.regressions.length} legitimate action(s)`,
        );
      }
    },
  });

  log(`\nsafe-action rate: ${pct(result.initialPassRate)} → ${pct(result.finalPassRate)}`);
  log("learned guardrails: " + (result.finalHarness.rules.join(", ") || "-"));
  if (rejectedFreeze) {
    log(
      "(the freeze-everything fix was rejected — safety edits are still gated against regressions)",
    );
  }
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

// Executed directly: run.ts
if ((import.meta as { main?: boolean }).main) {
  runPmDemo().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
