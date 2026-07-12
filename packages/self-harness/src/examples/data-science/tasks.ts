import type { DsResult, DsTask } from "./ds-agent.js";
import { projectsAtLevel, projectsUpToLevel, type DsLevel, type DsProject } from "./projects.js";

/** Build the task suite for all projects up to `maxLevel` (default: all four). */
export function buildDsSuite(maxLevel: DsLevel = 4): DsTask[] {
  return projectsUpToLevel(maxLevel).map(toTask);
}

/** The tasks introduced at exactly one level — used to grow the suite over time. */
export function dsTasksAtLevel(level: DsLevel): DsTask[] {
  return projectsAtLevel(level).map(toTask);
}

/**
 * A `growSuite` callback that adds the next difficulty level each iteration:
 * iteration 1 runs Level 1 (the initial tasks), iteration N adds Level N.
 */
export function growByLevel(iteration: number): DsTask[] {
  const level = iteration as DsLevel;
  return level >= 2 && level <= 4 ? dsTasksAtLevel(level) : [];
}

function toTask(project: DsProject): DsTask {
  return {
    id: project.id,
    prompt: `Build the "${project.name}" project (Level ${project.level}, ${project.category}) and reach the target ${project.metric}.`,
    project,
    check(output: string) {
      const result = parseResult(output);
      if (!result || !result.ran) {
        return { passed: false, detail: result?.error ?? "no result" };
      }
      if (project.metric === "none") return { passed: true, detail: "ran clean" };
      const metric = result.metric ?? 0;
      const passed = metric >= project.threshold;
      return {
        passed,
        detail: passed
          ? `${project.metric}=${metric} ≥ ${project.threshold}`
          : `${project.metric}=${metric} < ${project.threshold}`,
      };
    },
  };
}

function parseResult(output: string): DsResult | null {
  try {
    const parsed: unknown = JSON.parse(output);
    if (parsed && typeof parsed === "object" && typeof (parsed as DsResult).ran === "boolean") {
      return parsed as DsResult;
    }
  } catch {
    // not a DsResult envelope
  }
  return null;
}
