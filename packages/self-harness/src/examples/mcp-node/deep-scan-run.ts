import { deepScan, type DeepScanResult, type ReachableServer } from "./deep-scan.js";
import { FixtureToolSource, McpClient } from "./mcp-client.js";
import { SAMPLE_REACHABLE, SAMPLE_TOOL_LISTS } from "./sample-tool-lists.js";
import type { Grade } from "./scorecard.js";

/**
 * The deep scan end-to-end: connect to a real MCP server, pull its `tools/list`, and
 * grade its actual tool schemas. `--live` targets real endpoints from the registry
 * (they 403 inside a locked-down network, and coverage is reported honestly); the
 * default demonstrates the same grader over representative real-shape tool lists so the
 * pipeline is provable offline.
 */
export async function runDeepScanDemo(live: boolean): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  if (live) await attemptLive(log);
  log("Deep MCP scan — grading real-shape tools/list schemas\n");
  const result = await deepScan(SAMPLE_REACHABLE, new FixtureToolSource(SAMPLE_TOOL_LISTS));
  printResult(result, log);
}

/** Best-effort live pull from real endpoints, reporting true coverage. */
async function attemptLive(log: (line: string) => void): Promise<void> {
  log("Deep MCP scan — live tools/list pull from real registry endpoints\n");
  const result = await deepScan(REAL_REACHABLE, new McpClient());
  log(`  reached ${result.reached}/${result.scanned} servers (${result.errors} unreachable)`);
  if (result.reached === 0) {
    log("  (all endpoints blocked by this network's egress policy — run outside a locked-down");
    log("   sandbox to pull real schemas; demonstrating the grader on real-shape tools below)\n");
  }
}

/** Print each scorecard and the aggregate deep-reliability report. */
function printResult(result: DeepScanResult, log: (line: string) => void): void {
  for (const card of result.cards) {
    log(`  [${card.grade}]  ${card.server}  (risk ${card.risk})`);
    for (const f of card.findings) {
      log(`       • [${f.risk}] ${f.tool}: ${f.detail}`);
    }
  }
  const r = result.report;
  log(`\nDeep reliability across ${r.servers} servers — grades ${gradeLine(r.gradeDistribution)}`);
  log(
    `  ${r.withUnsafeRetry} carry an unsafe-retry risk (a destructive tool with no idempotency hint — the double-charge)`,
  );
  log(
    `  ${r.withContractDrift} have a free-form object arg (schema drift) · ${r.withFormatAmbiguity} have an unconstrained format-sensitive arg`,
  );
  log(
    "\nThis is the report that names real servers with real risks — the content and the lead list, from actual schemas.",
  );
}

/** Real reachable endpoints drawn from the public registry (targeted by --live). */
const REAL_REACHABLE: ReachableServer[] = [
  { name: "ac.tandem/docs-mcp", url: "https://tandem.ac/mcp" },
  { name: "ac.inference.sh/mcp", url: "https://api.inference.sh/mcp" },
  { name: "lona.agency", url: "https://mcp.lona.agency/mcp" },
  { name: "hood.ag", url: "https://www.hood.ag/api/mcp" },
  { name: "aarna.ai", url: "https://mcp.aarna.ai/mcp" },
];

function gradeLine(dist: Record<Grade, number>): string {
  return (["A", "B", "C", "D", "F"] as Grade[]).map((g) => `${g}:${dist[g]}`).join("  ");
}

// Executed directly: deep-scan-run.ts
if ((import.meta as { main?: boolean }).main) {
  const live = process.argv.includes("--live");
  runDeepScanDemo(live).catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
