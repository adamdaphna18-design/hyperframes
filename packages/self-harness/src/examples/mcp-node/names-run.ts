import { adviseServers, renderHighStakes, type NamedFinding } from "./advisor.js";
import { fetchRegistryLive, latestOnly, type RegistryServer } from "./registry.js";
import { REGISTRY_SNAPSHOT } from "./registry-snapshot.js";

/**
 * Names names: real MCP servers from the live registry, ranked by the readiness gaps
 * that are verifiable from public metadata, each with a suggestion. `--live` pulls the
 * whole registry (thousands of servers) and falls back to the vendored snapshot when
 * the network is closed. Honest by construction: a low grade means missing
 * source/docs/install — a fact; the double-charge risk is flagged as a candidate that a
 * `tools/list` deep-scan confirms.
 */
export async function runNamesDemo(live: boolean): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  const servers = latestOnly(await load(live, log));
  const { ranked, highStakes } = adviseServers(servers);

  log(
    `\nScanned ${servers.length} real servers · ${ranked.length} scored below A (the named lead list).\n`,
  );

  log("Top named findings (worst grade first):");
  for (const f of ranked.slice(0, 12)) log(render(f));

  log(`\nHigh-stakes subset — ${highStakes.length} money/write servers with no auditable source:`);
  for (const f of highStakes.slice(0, 10)) {
    for (const line of renderHighStakes(f)) log(line);
  }

  log(
    "\nVerifiable now from metadata: missing source/docs/install. The arg-level double-charge risk needs a",
  );
  log(
    "live tools/list pull (demo:deep) — the high-stakes list is exactly where that scan is worth running.",
  );
}

async function load(live: boolean, log: (line: string) => void): Promise<RegistryServer[]> {
  if (!live) {
    log("Named MCP scan — vendored real snapshot (offline, deterministic)");
    return REGISTRY_SNAPSHOT;
  }
  try {
    log("Named MCP scan — live full-registry pull");
    return await fetchRegistryLive({ pages: 100 });
  } catch (err: unknown) {
    log(`  live pull failed (${String(err)}); falling back to the vendored snapshot`);
    return REGISTRY_SNAPSHOT;
  }
}

function render(f: NamedFinding): string {
  const stakes = f.highStakes ? " ⚠ high-stakes" : "";
  return `  [${f.grade}] ${f.server} (${f.domain})${stakes} — ${f.suggestions[0] ?? "improve readiness"}`;
}

// Executed directly: names-run.ts
if ((import.meta as { main?: boolean }).main) {
  const live = process.argv.includes("--live");
  runNamesDemo(live).catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
