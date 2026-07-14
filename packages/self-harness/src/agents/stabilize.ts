import type { Agent, Harness, Task, Trajectory } from "../types.js";

/**
 * The regression gate measures "did this patch break anything?" by re-running the
 * suite — which is only sound if the agent is **deterministic**. A flaky agent (one
 * whose pass/fail on a task varies between runs) can make the gate see a *phantom*
 * regression on a harmless patch, or miss a real one. `stabilizeAgent` is the
 * mitigation: it runs the wrapped agent `runs` times per task and returns a trajectory
 * matching the majority verdict, so an occasional blip no longer flips the gate. It
 * does not fabricate determinism — with truly 50/50 noise no amount of voting helps —
 * but it makes the gate robust to the realistic case of a rare flake.
 */
export function stabilizeAgent(agent: Agent, runs: number): Agent {
  const n = Math.max(1, runs);
  return {
    async run(harness: Harness, task: Task): Promise<Trajectory> {
      const trajectories: Trajectory[] = [];
      let passes = 0;
      for (let i = 0; i < n; i++) {
        const trajectory = await agent.run(harness, task);
        trajectories.push(trajectory);
        if (task.check(trajectory.output).passed) passes += 1;
      }
      // Ties resolve to passing, matching the gate's "innocent until proven regressed".
      const majorityPassed = passes * 2 >= n;
      let chosen: Trajectory | undefined;
      for (const trajectory of trajectories) {
        if (task.check(trajectory.output).passed === majorityPassed) {
          chosen = trajectory;
          break;
        }
      }
      const fallback = trajectories[trajectories.length - 1];
      if (chosen) return chosen;
      if (fallback) return fallback;
      throw new Error("stabilizeAgent: no runs produced a trajectory");
    },
  };
}
