import { defaultHarness } from "../../harness.js";
import { selfHarness } from "../../loop.js";
import { buildDemoBrain } from "./fixture.js";
import { Orchestrator } from "./orchestrator.js";
import { CompanyAgent } from "./os-agent.js";
import { CompanyPlaybookProposer } from "./os-proposer.js";
import { buildCompanySuite } from "./tasks.js";
import { VERTICALS } from "./verticals.js";

/**
 * The full "AI-ready company" pipeline, end to end and offline:
 *
 *   sources → INGEST → the company brain → operating system (Self-Harness learns
 *   the playbooks, gated) → orchestrator ships the verticals → results file back
 *   into the brain and warehouse, so it compounds.
 *
 * The regression gate is the spine: it makes the "results write back" edge safe —
 * an SEO playbook that would lift organic sessions by wrecking brand voice is
 * rejected, so the brain only ever compounds improvements that break nothing.
 */
export async function runCompanyBrainDemo(): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");

  // Layer 1+2 → the brain: ingest sources, attach the warehouse.
  const brain = buildDemoBrain();
  const pages = brain.pages();
  const links = pages.reduce((n, p) => n + p.links.length, 0);
  log("How to make your company AI-ready — one brain, agents on top, results flow back\n");
  log(`INGEST: ${pages.length} sources → brain (${links} cross-links)`);
  log(
    `  semantic search "how do we lift conversions" → ${brain.search("lift conversions")[0]?.title ?? "-"}`,
  );

  // Layer 3 → operating system: the loop learns the playbooks, gated.
  const agent = new CompanyAgent(brain);
  log("\nOPERATING SYSTEM: Self-Harness learns the playbooks (regression-gated)");
  const result = await selfHarness({
    agent,
    proposer: new CompanyPlaybookProposer(),
    tasks: buildCompanySuite(),
    initialHarness: defaultHarness(),
    onEvent: (e) => {
      if (e.type === "gate" && !e.decision.accepted && e.decision.regressions.length > 0) {
        log(
          `  gate rejected an aggressive SEO edit: it would regress ${e.decision.regressions.join(", ")}`,
        );
      }
    },
  });
  log(`  performing verticals: ${pct(result.initialPassRate)} → ${pct(result.finalPassRate)}`);
  log(`  learned playbooks: ${result.finalHarness.rules.join(", ")}`);

  // Write-back: orchestrator ships, you approve, results compound into the brain.
  const before = brain.warehouse.snapshot();
  const orchestrator = new Orchestrator(brain, agent);
  const deliverables = await orchestrator.run(result.finalHarness);
  log("\nYOU review + approve; approved deliverables file back into the brain:");
  for (const d of deliverables) {
    log(`  ${d.shipped ? "✓ ship" : "· hold"} ${d.vertical.padEnd(8)} ${d.detail}`);
  }
  orchestrator.writeBack(result.finalHarness, deliverables, VERTICALS);

  log(
    `\nBRAIN COMPOUNDED: ${pages.length} → ${brain.pages().length} pages (playbooks written back)`,
  );
  log(`warehouse: ${fmt(before)}`);
  log(`        →  ${fmt(brain.warehouse.snapshot())}`);
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function fmt(snapshot: Record<string, number>): string {
  return Object.entries(snapshot)
    .map(([k, v]) => `${k}=${v}`)
    .join("  ");
}

// Executed directly: run.ts
if ((import.meta as { main?: boolean }).main) {
  runCompanyBrainDemo().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
