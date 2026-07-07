import { defaultHarness } from "../../harness.js";
import { selfHarness } from "../../loop.js";
import { describeEvent } from "../../demo/run-demo.js";
import { HttpAgent } from "./http-agent.js";
import { FetchHttpClient } from "./http-client.js";
import { HttpHeuristicProposer } from "./http-proposer.js";
import { buildPublicApiSuite } from "./tasks.js";

/**
 * Runs the Self-Harness loop against the curated public-apis endpoints. Offline
 * and deterministic by default (the recorded client); pass `{ live: true }` to
 * drive the identical loop against the real APIs where network is allowed.
 *
 * From a naive harness the agent times out on slow APIs, gives up on 429s, and
 * fails HTTPS-only endpoints. It clusters those, and the gate tunes the harness
 * — raising the timeout, enabling retry, following redirects — while refusing a
 * retry fix that would starve the paged endpoint's attempt budget.
 */
export async function runPublicApiDemo(options: { live?: boolean } = {}): Promise<void> {
  const agent = new HttpAgent(options.live ? new FetchHttpClient() : undefined);
  const log = (line: string) => process.stdout.write(line + "\n");

  const result = await selfHarness({
    agent,
    proposer: new HttpHeuristicProposer(),
    tasks: buildPublicApiSuite(),
    initialHarness: defaultHarness(),
    onEvent: (event) => log(describeEvent(event)),
  });

  log("\n════════ Self-Harness (public-apis) summary ════════");
  log(`pass rate: ${pct(result.initialPassRate)} → ${pct(result.finalPassRate)}`);
  log(`attempt budget (maxToolCalls): ${result.finalHarness.limits.maxToolCalls}`);
  log("learned harness rules (fingerprint):");
  for (const rule of result.finalHarness.rules) log(`  - ${rule}`);
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

// Executed directly (bun run src/examples/public-apis/run.ts [--live]).
if ((import.meta as { main?: boolean }).main) {
  runPublicApiDemo({ live: process.argv.includes("--live") }).catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
