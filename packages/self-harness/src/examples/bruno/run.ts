import { defaultHarness } from "../../harness.js";
import { selfHarness } from "../../loop.js";
import { describeEvent } from "../../demo/run-demo.js";
import { FetchHttpClient } from "../public-apis/http-client.js";
import { HttpAgent } from "../public-apis/http-agent.js";
import { HttpHeuristicProposer } from "../public-apis/http-proposer.js";
import { buildBrunoSuite, demoCollectionDir, loadBrunoCollection } from "./collection.js";

/**
 * Drives the Self-Harness loop against a real Bruno collection. Each `.bru`
 * request becomes a task, and its `assert` block becomes the task's verifier —
 * so the harness is tuned against exactly the requests and expectations a
 * developer already wrote in Bruno. Offline (recorded client) by default; pass
 * `{ live: true }` to fire the real requests where network is allowed.
 */
export async function runBrunoDemo(options: { live?: boolean } = {}): Promise<void> {
  const dir = demoCollectionDir();
  const requests = loadBrunoCollection(dir, { environment: "demo" });
  const tasks = buildBrunoSuite(dir, { environment: "demo" });
  const agent = new HttpAgent(options.live ? new FetchHttpClient() : undefined, { envelope: true });
  const log = (line: string) => process.stdout.write(line + "\n");

  log(`loaded ${requests.length} request(s) from the Bruno collection:`);
  for (const req of requests) {
    log(`  ${req.method} ${req.name} — ${req.assertions.length} assertion(s)`);
  }

  const result = await selfHarness({
    agent,
    proposer: new HttpHeuristicProposer(),
    tasks,
    initialHarness: defaultHarness(),
    onEvent: (event) => log(describeEvent(event)),
  });

  log("\n════════ Self-Harness (Bruno collection) summary ════════");
  log(`pass rate: ${pct(result.initialPassRate)} → ${pct(result.finalPassRate)}`);
  log("learned harness rules (fingerprint):");
  for (const rule of result.finalHarness.rules) log(`  - ${rule}`);
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

// Executed directly (bun run src/examples/bruno/run.ts [--live]).
if ((import.meta as { main?: boolean }).main) {
  runBrunoDemo({ live: process.argv.includes("--live") }).catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
