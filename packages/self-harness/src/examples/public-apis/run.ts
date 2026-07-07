import { defaultHarness } from "../../harness.js";
import { selfHarness } from "../../loop.js";
import { describeEvent } from "../../demo/run-demo.js";
import { AnthropicModel } from "../../models/anthropic.js";
import { ModelProposer } from "../../proposer.js";
import type { Proposer } from "../../types.js";
import { HttpAgent } from "./http-agent.js";
import { FetchHttpClient } from "./http-client.js";
import { httpScriptedModel } from "./http-model.js";
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
 *
 * `useModel` swaps the heuristic proposer for the {@link ModelProposer}, so the
 * model itself proposes the harness rules (offline via a scripted stand-in, or
 * against a live model when combined with `live`).
 */
export async function runPublicApiDemo(
  options: { live?: boolean; useModel?: boolean } = {},
): Promise<void> {
  const agent = new HttpAgent(options.live ? new FetchHttpClient() : undefined);
  const proposer = selectProposer(options);
  const log = (line: string) => process.stdout.write(line + "\n");

  const result = await selfHarness({
    agent,
    proposer,
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

function selectProposer(options: { live?: boolean; useModel?: boolean }): Proposer {
  if (!options.useModel) return new HttpHeuristicProposer();
  // The same model runs the tasks and proposes the fixes; offline it's a
  // deterministic scripted stand-in, live it's a real Anthropic model.
  return new ModelProposer(options.live ? new AnthropicModel() : httpScriptedModel());
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

// Executed directly (bun run src/examples/public-apis/run.ts [--live] [--model]).
if ((import.meta as { main?: boolean }).main) {
  runPublicApiDemo({
    live: process.argv.includes("--live"),
    useModel: process.argv.includes("--model"),
  }).catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
