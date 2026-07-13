import {
  fetchRegistryLive,
  latestOnly,
  registryReport,
  scoreReadiness,
  type ReadinessRisk,
  type RegistryServer,
} from "./registry.js";
import { REGISTRY_SNAPSHOT } from "./registry-snapshot.js";
import type { Grade } from "./scorecard.js";

/**
 * Scans the real public MCP registry as growth data. By default it reads a vendored
 * real snapshot (deterministic, offline); `--live` pages the live API and falls back
 * to the snapshot if the network is unavailable. It grades each server's deploy
 * readiness, prints the "State of the MCP Registry" report, and surfaces the reachable
 * servers — the list that feeds the deep, arg-level reliability scan.
 */
export async function runRegistryDemo(live: boolean): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  const servers = await loadServers(live, log);
  const latest = latestOnly(servers);
  const cards = latest.map(scoreReadiness);
  const report = registryReport(cards, latest);

  log(`\nState of the MCP Registry — ${report.servers} servers (deduped to latest)`);
  log(`  grades: ${gradeLine(report.gradeDistribution)}`);
  log(
    `  installable: ${pct(report.installable, report.servers)} · with source repo: ${pct(report.withSource, report.servers)} · active: ${pct(report.active, report.servers)}`,
  );
  log(`  reachable (active + a remote endpoint): ${report.reachable}/${report.servers}`);

  const gaps = topGaps(cards);
  log(`\nBiggest readiness gaps across the registry:`);
  for (const [risk, count] of gaps) {
    log(`  ${count} servers — ${describe(risk)}`);
  }

  log(
    `\nThe ${report.reachable} reachable servers are the discovery list — pull each one's tools/list and run the deep reliability scan (demo:scan) to grade its arg-level risks.`,
  );
}

async function loadServers(live: boolean, log: (line: string) => void): Promise<RegistryServer[]> {
  if (!live) {
    log("MCP Registry scan — vendored real snapshot (offline, deterministic)");
    return REGISTRY_SNAPSHOT;
  }
  try {
    log("MCP Registry scan — live pull from registry.modelcontextprotocol.io");
    return await fetchRegistryLive({ pages: 1 });
  } catch (err: unknown) {
    log(`  live pull failed (${String(err)}); falling back to the vendored snapshot`);
    return REGISTRY_SNAPSHOT;
  }
}

function topGaps(cards: ReturnType<typeof scoreReadiness>[]): Array<[ReadinessRisk, number]> {
  const counts = new Map<ReadinessRisk, number>();
  for (const card of cards) {
    for (const f of card.findings) counts.set(f.risk, (counts.get(f.risk) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function describe(risk: ReadinessRisk): string {
  return {
    "no-install": "not installable (no remote endpoint, no package)",
    "no-source": "no source repository to audit",
    inactive: "not marked active",
    undocumented: "little or no description",
  }[risk];
}

function gradeLine(dist: Record<Grade, number>): string {
  return (["A", "B", "C", "D", "F"] as Grade[]).map((g) => `${g}:${dist[g]}`).join("  ");
}

function pct(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : "0%";
}

// Executed directly: registry-run.ts
if ((import.meta as { main?: boolean }).main) {
  const live = process.argv.includes("--live");
  runRegistryDemo(live).catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
