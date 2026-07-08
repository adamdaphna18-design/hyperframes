/**
 * A task suite drawn from tkarim45/Beginner-Data-Science-Projects — 41
 * beginner data-science projects across four difficulty levels. Each becomes a
 * Self-Harness task: the objective is the prompt, a metric threshold is the
 * verifier, and the recurring DS pitfalls (leakage, non-determinism, unhandled
 * NaNs, class imbalance, runaway training) are the pathologies the loop learns
 * to fix by adding rules to the agent's harness.
 *
 * As in the other examples the behavior is modeled deterministically so the
 * loop runs offline; the same suite drives a real notebook-executing agent
 * where a Python + Jupyter environment is available.
 */
export type DsLevel = 1 | 2 | 3 | 4;

export type DsPathology =
  | "healthy"
  | "data-leakage"
  | "non-determinism"
  | "unhandled-nan"
  | "class-imbalance"
  | "runaway-training";

/** The harness rule a given pathology requires; `healthy` needs none. */
export const PATHOLOGY_RULE: Record<Exclude<DsPathology, "healthy">, string> = {
  "data-leakage": "fit-transforms-on-train-only",
  "non-determinism": "seed-everything",
  "unhandled-nan": "handle-missing-values",
  "class-imbalance": "handle-class-imbalance",
  "runaway-training": "use-early-stopping",
};

export interface DsProject {
  id: string;
  name: string;
  level: DsLevel;
  category: string;
  pathology: DsPathology;
  /** Rule the harness must contain for a correct run; absent for healthy projects. */
  requiredRule?: string;
  /** Tool-call/compute steps a correct run needs (heavy deep-learning = many). */
  computeSteps: number;
  /** Evaluation metric (higher is better), or "none" for run-clean-only projects. */
  metric: string;
  /** Passing threshold for the metric (ignored when metric === "none"). */
  threshold: number;
  /** The metric value a correct run achieves. */
  targetMetric: number;
}

function project(
  name: string,
  level: DsLevel,
  category: string,
  pathology: DsPathology,
  computeSteps: number,
  metric: string,
  threshold = 0.8,
  targetMetric = 0.9,
): DsProject {
  return {
    id: slug(name),
    name,
    level,
    category,
    pathology,
    requiredRule: pathology === "healthy" ? undefined : PATHOLOGY_RULE[pathology],
    computeSteps,
    metric,
    threshold,
    targetMetric,
  };
}

/** A representative slice of the 41 projects, one or more per pathology/level. */
export const PROJECTS: DsProject[] = [
  // Level 1 — Fundamentals
  project("Titanic Survival Prediction", 1, "Tabular", "data-leakage", 4, "accuracy"),
  project("Iris Flower Classification", 1, "Vision", "non-determinism", 4, "accuracy"),
  project("Heart Failure Prediction", 1, "Tabular", "unhandled-nan", 4, "f1"),
  project("Customer Churn", 1, "Tabular", "healthy", 3, "accuracy"),
  project("Rental Prices of AirBnb", 1, "Regression", "data-leakage", 4, "r2", 0.7, 0.85),

  // Level 2 — Text and NLP
  project("Message Spam Filtering", 2, "NLP", "data-leakage", 4, "f1"),
  project("Sentiment Analysis", 2, "NLP", "non-determinism", 4, "accuracy"),
  project("Song Lyrics Genre Classification", 2, "NLP", "class-imbalance", 5, "f1", 0.7, 0.82),
  project("Toxic Comment Classification", 2, "NLP", "healthy", 5, "f1", 0.75, 0.86),

  // Level 3 — Computer Vision and Deep Learning
  project("Gender Classification", 3, "Vision", "healthy", 12, "accuracy", 0.85, 0.93),
  project("Eye Disease Detection", 3, "Vision", "runaway-training", 12, "accuracy", 0.85, 0.91),
  project("Face Recognition", 3, "Vision", "healthy", 6, "accuracy", 0.8, 0.9),

  // Level 4 — Advanced Topics
  project("Object Detection", 4, "Vision", "healthy", 12, "map", 0.5, 0.62),
  project("Network Intrusion Detection System", 4, "Tabular", "healthy", 6, "f1", 0.9, 0.97),
];

/** Projects at exactly the given level. */
export function projectsAtLevel(level: DsLevel): DsProject[] {
  return PROJECTS.filter((p) => p.level === level);
}

/** All projects up to and including the given level. */
export function projectsUpToLevel(level: DsLevel): DsProject[] {
  return PROJECTS.filter((p) => p.level <= level);
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
