import type { Agent, Harness, SuiteResult, Task, TaskResult } from "./types.js";

/** Run one agent over one task under a harness and verify the result. */
export async function runTask(agent: Agent, harness: Harness, task: Task): Promise<TaskResult> {
  const trajectory = await agent.run(harness, task);
  const { passed, detail } = task.check(trajectory.output);
  return { taskId: task.id, passed, detail, trajectory };
}

/** Run an agent over a whole suite of tasks under a single harness. */
export async function runSuite(
  agent: Agent,
  harness: Harness,
  tasks: Task[],
): Promise<SuiteResult> {
  const results: TaskResult[] = [];
  for (const task of tasks) {
    results.push(await runTask(agent, harness, task));
  }
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  return {
    results,
    passed,
    failed,
    passRate: results.length === 0 ? 1 : passed / results.length,
  };
}

/** Task IDs that passed in a suite result. */
export function passingIds(suite: SuiteResult): Set<string> {
  return new Set(suite.results.filter((r) => r.passed).map((r) => r.taskId));
}
