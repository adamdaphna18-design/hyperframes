import type { Agent, Harness, Task, ToolCall, Trajectory } from "../../types.js";
import type { Question } from "./questions.js";
import { DEFAULT_SPECIALIST, specialistById, type Domain } from "./specialists.js";

/** A task bound to one benchmark question. */
export interface RouterTask extends Task {
  question: Question;
}

/** The structured result the router reports: who it picked and whether they were right. */
export interface RouteResult {
  routedTo: string;
  correct: boolean;
}

/**
 * The tiny router. Its entire policy is the harness's routing rules
 * (`route:<domain>=<specialist>`, or `route:*=<specialist>` as a catch-all). For a
 * question it consults the policy, dispatches to the chosen specialist, and is
 * correct iff that specialist actually covers the question's domain. With no
 * policy every question falls to the default generalist — so only knowledge
 * questions pass until the loop learns the routes.
 */
export class Router implements Agent {
  async run(harness: Harness, task: Task): Promise<Trajectory> {
    const { question } = task as RouterTask;
    const routedTo = pickSpecialist(harness.rules, question.domain);
    const specialist = specialistById(routedTo);
    const correct = specialist?.strengths.includes(question.domain) ?? false;

    const toolCalls: ToolCall[] = [
      { name: "router.route", args: `${question.id}→${routedTo}`, ok: true },
      { name: "specialist.answer", args: routedTo, ok: correct },
    ];
    const result: RouteResult = { routedTo, correct };
    return {
      taskId: question.id,
      toolCalls,
      output: JSON.stringify(result),
      failureSignals: correct ? [] : [question.domain],
    };
  }
}

/** Resolve the specialist for a domain: exact route, then catch-all, then default. */
export function pickSpecialist(rules: string[], domain: Domain): string {
  const table = routingTable(rules);
  return table.get(domain) ?? table.get("*") ?? DEFAULT_SPECIALIST;
}

function routingTable(rules: string[]): Map<string, string> {
  const table = new Map<string, string>();
  for (const rule of rules) {
    const match = /^route:([^=]+)=(.+)$/.exec(rule);
    if (match) table.set(match[1] as string, match[2] as string);
  }
  return table;
}
