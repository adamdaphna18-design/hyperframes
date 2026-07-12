import { makeSimTask, SimulatedAgent } from "../agents/simulated.js";
import { defaultHarness } from "../harness.js";
import { runSelfHarnessLoop } from "../loop-runner.js";
import { HeuristicProposer } from "../proposer.js";

/**
 * Runnable demo of the outer self-pacing loop ({@link runSelfHarnessLoop}).
 * Each iteration grows the task suite with a new pathology, the loop tunes the
 * carried-forward harness against it, and once two iterations pass with nothing
 * left to learn it declares convergence — then prints the `progress.md` memory.
 * Run with `bun run demo:loop`.
 */
export async function runLoopDemo(): Promise<void> {
  const result = await runSelfHarnessLoop({
    agent: new SimulatedAgent(),
    proposer: new HeuristicProposer(),
    initialHarness: defaultHarness(),
    initialTasks: [makeSimTask("healthy-deploy", "healthy", "Deploy the service.", 12)],
    growSuite: (iteration) => {
      if (iteration === 1) {
        return [
          makeSimTask("explore-audit", "runaway-exploration", "Audit and write findings.md."),
        ];
      }
      if (iteration === 2) {
        return [
          makeSimTask("env-token", "lost-env-var", "Set a token, then call the API with it."),
        ];
      }
      return [];
    },
    maxIterations: 8,
    convergenceRounds: 2,
  });

  process.stdout.write(result.memoryMarkdown + "\n");
}

// Executed directly (bun run src/demo/run-loop.ts).
if ((import.meta as { main?: boolean }).main) {
  runLoopDemo().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
