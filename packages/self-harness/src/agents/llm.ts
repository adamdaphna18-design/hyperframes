import type { Agent, Harness, Model, Task, Trajectory } from "../types.js";

/**
 * A real, model-backed agent. It renders the harness (system prompt + rules +
 * limits) into the model's system prompt, so harness edits genuinely change how
 * tasks are solved — the same lever the loop optimizes. This is a single-turn
 * solver; a production agent would run a tool-execution loop here and record
 * real {@link Trajectory} tool calls and failure signals. Kept intentionally
 * small so it is honest about what it does.
 */
export class LlmAgent implements Agent {
  constructor(private readonly model: Model) {}

  async run(harness: Harness, task: Task): Promise<Trajectory> {
    const system = renderHarness(harness);
    const output = await this.model.complete({ system, user: task.prompt });
    return { taskId: task.id, toolCalls: [], output: output.trim(), failureSignals: [] };
  }
}

/** Turn a harness into the system prompt an LLM agent actually runs under. */
export function renderHarness(harness: Harness): string {
  const parts = [harness.systemPrompt];
  if (harness.rules.length > 0) {
    parts.push("Rules:\n" + harness.rules.map((r) => `- ${r}`).join("\n"));
  }
  parts.push(
    `Constraints: at most ${harness.limits.maxToolCalls} tool calls; ` +
      `avoid-repeated-failures=${harness.limits.avoidRepeatedFailures}; ` +
      `persist-env=${harness.limits.persistEnvAcrossSessions}.`,
  );
  parts.push(`Available tools: ${harness.tools.join(", ")}.`);
  return parts.join("\n\n");
}
