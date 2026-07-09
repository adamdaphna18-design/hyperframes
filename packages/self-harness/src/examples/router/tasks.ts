import type { RouterTask, RouteResult } from "./router-agent.js";
import { QUESTIONS } from "./questions.js";
import type { Question } from "./questions.js";

/** Build the router benchmark suite: one task per question, passed iff answered correctly. */
export function buildRouterSuite(): RouterTask[] {
  return QUESTIONS.map(toTask);
}

function toTask(question: Question): RouterTask {
  return {
    id: question.id,
    prompt: `Route and answer (${question.domain}): ${question.prompt}`,
    question,
    check(output: string) {
      const result = parseResult(output);
      if (!result) return { passed: false, detail: "no result" };
      return {
        passed: result.correct,
        detail: result.correct
          ? `${question.domain} → ${result.routedTo} ✓`
          : `misrouted ${question.domain} → ${result.routedTo}`,
      };
    },
  };
}

function parseResult(output: string): RouteResult | null {
  try {
    const parsed: unknown = JSON.parse(output);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as RouteResult).correct === "boolean"
    ) {
      return parsed as RouteResult;
    }
  } catch {
    // not a RouteResult envelope
  }
  return null;
}
