import { renderHarness } from "../../agents/llm.js";
import type { Agent, Harness, Model, Task, ToolCall, Trajectory } from "../../types.js";
import type { DsResult, DsTask } from "./ds-agent.js";
import type { DsPathology, DsProject } from "./projects.js";

/**
 * A staged, model-governed data-science agent, inspired by
 * K-Dense-AI/agentic-data-scientist. Instead of a flat pass/fail, it walks the
 * real DS workflow and, at the stage where a pitfall lives, asks the model
 * whether it will apply the relevant best practice. The model reads the
 * harness's rules from its system prompt (via {@link renderHarness}) — so the
 * harness genuinely steers a model-driven pipeline, and the same failure signals
 * flow into the existing clusterer / proposer / loop.
 *
 * Offline it is driven by {@link RuleAwareModel} (a deterministic stand-in that
 * follows the rendered rules); swap in `AnthropicModel` for a live agent.
 */
const WORKFLOW = [
  "load-data",
  "data-cleaning",
  "feature-engineering",
  "resampling",
  "split",
  "model-training",
  "evaluation",
] as const;

/** Which workflow stage each pathology is introduced at (undefined = healthy). */
const STAGE_FOR_PATHOLOGY: Record<DsPathology, string | undefined> = {
  healthy: undefined,
  "unhandled-nan": "data-cleaning",
  "data-leakage": "feature-engineering",
  "class-imbalance": "resampling",
  "non-determinism": "model-training",
  "runaway-training": "model-training",
};

export class AgenticDsAgent implements Agent {
  constructor(private readonly model: Model) {}

  async run(harness: Harness, task: Task): Promise<Trajectory> {
    const { project } = task as DsTask;
    const system = renderHarness(harness);
    const criticalStage = STAGE_FOR_PATHOLOGY[project.pathology];
    const toolCalls: ToolCall[] = [];

    for (const stage of WORKFLOW) {
      toolCalls.push({ name: "stage", args: stage, ok: true });

      if (stage === "model-training" && harness.limits.maxToolCalls < project.computeSteps) {
        return finish(project, toolCalls, "compute-budget-exhausted");
      }

      if (project.requiredRule && stage === criticalStage) {
        const decision = await this.model.complete({
          system,
          user: decisionPrompt(stage, project),
        });
        const applied = /applied/i.test(decision);
        toolCalls.push({
          name: "decide",
          args: project.requiredRule,
          ok: applied,
          note: decision.trim(),
        });
        if (!applied) return finish(project, toolCalls, project.pathology);
      }
    }

    return finish(project, toolCalls, null);
  }
}

function decisionPrompt(stage: string, project: DsProject): string {
  // The rule is the only quoted token, so a rule-following model (and the
  // deterministic RuleAwareModel stand-in) can identify the practice in question.
  return `Project ${project.name}. At the ${stage} stage, will you apply the "${project.requiredRule}" practice? Reply APPLIED or SKIPPED.`;
}

function finish(project: DsProject, toolCalls: ToolCall[], failure: string | null): Trajectory {
  const result: DsResult = failure
    ? { ran: false, error: failure }
    : { ran: true, metric: project.targetMetric };
  return {
    taskId: project.id,
    toolCalls,
    output: JSON.stringify(result),
    failureSignals: failure ? [failure] : [],
  };
}

/**
 * A deterministic stand-in for a real model on the per-stage decisions. It reads
 * the practice named in the prompt and answers APPLIED iff that rule is present
 * in the harness-rendered system prompt — exactly how a rule-following model
 * behaves. Swap for `AnthropicModel` to have a live model make the calls.
 */
export class RuleAwareModel implements Model {
  readonly name = "rule-aware-scripted";

  async complete(input: { system?: string; user: string }): Promise<string> {
    const rule = /"([^"]+)"/.exec(input.user)?.[1];
    const active = rule !== undefined && (input.system ?? "").includes(rule);
    return active ? "APPLIED" : "SKIPPED";
  }
}
