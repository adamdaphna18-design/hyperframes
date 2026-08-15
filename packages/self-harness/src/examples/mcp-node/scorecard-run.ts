import { SAMPLE_SERVERS } from "./sample-manifests.js";
import { ecosystemReport, scoreServer, type Grade } from "./scorecard.js";

/**
 * The growth demo: scan the public MCP ecosystem as data. Each server's manifest is
 * graded on the reliability risks the self-correcting node fixes; one scan is a free
 * lead magnet, the aggregate is a "State of MCP Reliability" report, and the low
 * grades are a lead list — every one is a server that needs what the node ships. A
 * live drop-in points `scoreServer` at manifests fetched from the real MCP registry.
 */
export function runScorecardDemo(): void {
  const log = (line: string) => process.stdout.write(line + "\n");
  const cards = SAMPLE_SERVERS.map(scoreServer);

  log("MCP Reliability Scan — public servers as growth data\n");
  for (const card of cards) {
    log(`  ${grade(card.grade)}  ${card.server}  (risk ${card.risk})`);
    for (const f of card.findings) {
      log(`       • [${f.risk}] ${f.tool}: ${f.detail}`);
    }
  }

  const report = ecosystemReport(cards);
  log(`\nState of MCP Reliability — ${report.servers} servers scanned`);
  log(`  grades: ${gradeLine(report.gradeDistribution)}`);
  log(
    `  ${report.withUnsafeRetry}/${report.servers} carry an unsafe-retry risk (a write that double-executes on blind retry)`,
  );
  log(
    `  ${report.withContractDrift}/${report.servers} have schema-drift exposure · ${report.withFormatAmbiguity}/${report.servers} have format ambiguity · ${report.withRateLimitRisk}/${report.servers} document no rate limits`,
  );
  log(
    `\nThe ${report.withUnsafeRetry} unsafe-retry server(s) are your lead list — the exact double-execution the node's gate prevents.`,
  );
}

function grade(g: Grade): string {
  return `[${g}]`;
}

function gradeLine(dist: Record<Grade, number>): string {
  return (["A", "B", "C", "D", "F"] as Grade[]).map((g) => `${g}:${dist[g]}`).join("  ");
}

// Executed directly: scorecard-run.ts
if ((import.meta as { main?: boolean }).main) {
  try {
    runScorecardDemo();
  } catch (err: unknown) {
    console.error(err);
    process.exitCode = 1;
  }
}
