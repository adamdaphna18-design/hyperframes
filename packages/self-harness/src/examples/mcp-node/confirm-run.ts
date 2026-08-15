import { writeFileSync } from "node:fs";
import { scanTargets } from "./advisor.js";
import {
  confirmServer,
  summarize,
  toCsv,
  type ScanTarget,
  type ServerConfirmation,
} from "./confirm.js";
import { McpClient } from "./mcp-client.js";
import { fetchRegistryLive, latestOnly } from "./registry.js";
import { REGISTRY_SNAPSHOT } from "./registry-snapshot.js";

/**
 * The laptop runner: from an open network, connect to the high-stakes servers over the
 * real streamable-http MCP protocol, classify their tools from actual annotations, and
 * write an honest CSV. `--live` pulls the whole registry and extracts targets with real
 * endpoint URLs; without it, it runs the vendored snapshot (whose entries carry no URLs,
 * so it's a dry run that proves the pipeline). Inside a locked-down sandbox every target
 * is unreachable — reported as such, never faked.
 */
const OUT = "honest_leads.csv";
const POLITE_DELAY_MS = 1000;

export async function runConfirmDemo(live: boolean): Promise<void> {
  const log = (line: string) => process.stdout.write(line + "\n");
  const targets = await loadTargets(live, log);
  log(`\nConfirming ${targets.length} high-stakes endpoints over streamable-http MCP…\n`);

  const client = new McpClient();
  const confirmations: ServerConfirmation[] = [];
  for (const target of targets) {
    const confirmation = await confirmServer(target, client);
    confirmations.push(confirmation);
    log(`  ${statusMark(confirmation.status)} ${target.server} — ${describe(confirmation)}`);
    await delay(POLITE_DELAY_MS);
  }

  writeFileSync(OUT, toCsv(confirmations));
  printSummary(confirmations, log);
}

async function loadTargets(live: boolean, log: (line: string) => void): Promise<ScanTarget[]> {
  if (!live) {
    log("Confirm scan — vendored snapshot (dry run; snapshot carries no endpoint URLs)");
    return scanTargets(latestOnly(REGISTRY_SNAPSHOT));
  }
  try {
    log("Confirm scan — live registry pull for real endpoint URLs");
    return scanTargets(latestOnly(await fetchRegistryLive({ pages: 100 })));
  } catch (err: unknown) {
    log(`  live pull failed (${String(err)}); nothing to confirm`);
    return [];
  }
}

function printSummary(confirmations: ServerConfirmation[], log: (line: string) => void): void {
  const s = summarize(confirmations);
  log(
    `\nHonest coverage — reached ${s.serversReached}, auth-required ${s.authRequired}, unreachable ${s.unreachable}`,
  );
  log(
    `  candidates (destructive + no idempotency hint): ${s.candidates} · idempotent-safe: ${s.idempotentSafe} · unannotated (cannot classify): ${s.unannotated}`,
  );
  log(
    `  wrote ${OUT} — one row per tool, with evidence. 'candidate' ≠ 'confirmed'; it flags a manifest gap to verify.`,
  );
}

function describe(c: ServerConfirmation): string {
  if (c.status !== "reached") return c.status;
  const candidates = c.verdicts.filter((v) => v.kind === "candidate").length;
  return `${c.verdicts.length} tools, ${candidates} candidate(s)`;
}

function statusMark(status: ServerConfirmation["status"]): string {
  if (status === "reached") return "✓";
  if (status === "auth-required") return "🔒";
  return "·";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Executed directly: confirm-run.ts
if ((import.meta as { main?: boolean }).main) {
  const live = process.argv.includes("--live");
  runConfirmDemo(live).catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
