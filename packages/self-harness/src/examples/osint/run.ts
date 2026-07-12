import { defaultHarness } from "../../harness.js";
import { selfHarness } from "../../loop.js";
import { AnthropicModel } from "../../models/anthropic.js";
import { ModelProposer } from "../../proposer.js";
import type { Proposer } from "../../types.js";
import {
  CommitteeProposer,
  EmpiricalJudge,
  renderCourtRecords,
} from "../data-science/committee.js";
import { ComplianceJudge } from "./compliance-judge.js";
import { OsintAgent } from "./osint-agent.js";
import { osintScriptedModel } from "./osint-model.js";
import { OsintHeuristicProposer } from "./osint-proposer.js";
import { buildOsintSuite } from "./tasks.js";

export interface OsintDemoOptions {
  /** Let the model author the guardrails (ModelProposer) instead of the heuristic. */
  useModel?: boolean;
  /** With `useModel`, drive the proposer with a live model instead of the offline stand-in. */
  live?: boolean;
  /** Review every proposed edit with the Empiricist + Compliance-Officer committee. */
  committee?: boolean;
}

/**
 * Drives the Self-Harness loop over the recon suite: the agent trips each
 * operational-security pitfall (out-of-scope queries, rate-limit abuse, PII
 * exposure, single-source attribution, missing provenance) and the loop learns
 * the minimal guardrail that fixes it — with the regression gate rejecting the
 * over-broad "throttle everything" candidate that would starve legitimate
 * in-scope lookups. The same loop that learns data-science practices learns
 * operational-security guardrails: the framework is domain-agnostic.
 */
export async function runOsintDemo(options: OsintDemoOptions = {}): Promise<void> {
  if (options.committee) return runOsintCommitteeDemo(options);
  const log = (line: string) => process.stdout.write(line + "\n");
  const agent = new OsintAgent();
  const tasks = buildOsintSuite();
  const proposer = selectProposer(options);
  const tag = options.useModel ? " — model proposer" : "";
  log(`OSINT recon suite → Self-Harness learns operational guardrails${tag}\n`);

  let rejectedThrottle = false;
  const result = await selfHarness({
    agent,
    proposer,
    tasks,
    initialHarness: defaultHarness(),
    onEvent: (e) => {
      if (e.type === "gate" && !e.decision.accepted && e.decision.regressions.length > 0) {
        rejectedThrottle = true;
        log(
          `  gate rejected an over-broad guardrail: it would regress ` +
            `${e.decision.regressions.length} in-scope lookup(s)`,
        );
      }
    },
  });

  log(`\nsafe-conduct rate: ${pct(result.initialPassRate)} → ${pct(result.finalPassRate)}`);
  log("learned guardrails: " + (result.finalHarness.rules.join(", ") || "-"));
  log(`query budget preserved: maxToolCalls = ${result.finalHarness.limits.maxToolCalls}`);
  if (rejectedThrottle) {
    log(
      "(the throttle-everything fix was rejected — safety edits are still gated against regressions)",
    );
  }
}

function selectProposer(options: OsintDemoOptions): Proposer {
  if (!options.useModel) return new OsintHeuristicProposer();
  return new ModelProposer(options.live ? new AnthropicModel() : osintScriptedModel());
}

/**
 * Runs the recon campaign with every proposed guardrail reviewed by the
 * Empiricist and the Compliance Officer before the gate sees it, then prints the
 * court records — the Officer endorsing privacy-strengthening rules while the
 * Empiricist vetoes the throttle that breaks legitimate lookups.
 */
async function runOsintCommitteeDemo(options: OsintDemoOptions): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  const agent = new OsintAgent();
  const tasks = buildOsintSuite();
  const committee = new CommitteeProposer({
    inner: selectProposer(options),
    agent,
    tasks,
    judges: [new EmpiricalJudge(), new ComplianceJudge()],
    threshold: 7,
  });
  log("OSINT recon suite reviewed by the Empiricist + Compliance-Officer committee\n");

  const result = await selfHarness({
    agent,
    proposer: committee,
    tasks,
    initialHarness: defaultHarness(),
  });

  log(`safe-conduct rate: ${pct(result.initialPassRate)} → ${pct(result.finalPassRate)}`);
  log("learned guardrails: " + (result.finalHarness.rules.join(", ") || "-"));
  log("\n" + renderCourtRecords(committee.courtRecords()));
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

// Executed directly: run.ts [--model] [--live] [--committee]
if ((import.meta as { main?: boolean }).main) {
  runOsintDemo({
    useModel: process.argv.includes("--model"),
    live: process.argv.includes("--live"),
    committee: process.argv.includes("--committee"),
  }).catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
