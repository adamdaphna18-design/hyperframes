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

/**
 * A catalog drawn from the beginner/portfolio DS project corpus. Each level
 * introduces exactly one *new* pathology so the harness learns one practice at a
 * time as the suite grows — Level 1 the three fundamentals (leakage,
 * non-determinism, unhandled NaNs), Level 2 class imbalance, Level 3 runaway
 * training; Level 4 introduces no new pathology (its projects reuse rules already
 * learned, so they pass on arrival — evidence the learned harness generalizes).
 */
export const PROJECTS: DsProject[] = [
  // Level 1 — Fundamentals (teaches data-leakage, non-determinism, unhandled-nan)
  project("Titanic Survival Prediction", 1, "Tabular", "data-leakage", 4, "accuracy"),
  project("Iris Flower Classification", 1, "Vision", "non-determinism", 4, "accuracy"),
  project("Heart Failure Prediction", 1, "Tabular", "unhandled-nan", 4, "f1"),
  project("Customer Churn", 1, "Tabular", "healthy", 3, "accuracy"),
  project("Rental Prices of AirBnb", 1, "Regression", "data-leakage", 4, "r2", 0.7, 0.85),
  project("Wine Quality Prediction", 1, "Tabular", "unhandled-nan", 4, "accuracy"),
  project("Boston House Prices", 1, "Regression", "data-leakage", 4, "r2", 0.7, 0.85),
  project("Diabetes Progression", 1, "Regression", "non-determinism", 4, "r2", 0.7, 0.85),
  project("Bank Marketing Response", 1, "Tabular", "healthy", 3, "accuracy"),
  project("MNIST Digit Recognition", 1, "Vision", "non-determinism", 5, "accuracy", 0.9, 0.97),
  project("Mall Customer Segmentation", 1, "Tabular", "healthy", 3, "none"),

  // Level 2 — Text and NLP (new pathology: class-imbalance)
  project("Message Spam Filtering", 2, "NLP", "data-leakage", 4, "f1"),
  project("Sentiment Analysis", 2, "NLP", "non-determinism", 4, "accuracy"),
  project("Song Lyrics Genre Classification", 2, "NLP", "class-imbalance", 5, "f1", 0.7, 0.82),
  project("Toxic Comment Classification", 2, "NLP", "healthy", 5, "f1", 0.75, 0.86),
  project("Credit Card Fraud Detection", 2, "Tabular", "class-imbalance", 5, "f1", 0.7, 0.83),
  project("Fake News Detection", 2, "NLP", "data-leakage", 4, "f1"),
  project("Movie Review Sentiment", 2, "NLP", "non-determinism", 4, "accuracy"),
  project("News Category Classification", 2, "NLP", "class-imbalance", 5, "f1", 0.7, 0.83),
  project("Language Detection", 2, "NLP", "healthy", 4, "accuracy"),

  // Level 3 — Computer Vision and Deep Learning (new pathology: runaway-training)
  project("Gender Classification", 3, "Vision", "healthy", 12, "accuracy", 0.85, 0.93),
  project("Eye Disease Detection", 3, "Vision", "runaway-training", 12, "accuracy", 0.85, 0.91),
  project("Face Recognition", 3, "Vision", "healthy", 6, "accuracy", 0.8, 0.9),
  project(
    "Pneumonia Detection (Chest X-Ray)",
    3,
    "Vision",
    "runaway-training",
    12,
    "accuracy",
    0.85,
    0.91,
  ),
  project("Traffic Sign Recognition", 3, "Vision", "healthy", 8, "accuracy", 0.9, 0.96),
  project("Facial Emotion Recognition", 3, "Vision", "non-determinism", 10, "accuracy", 0.7, 0.83),

  // Level 4 — Advanced Topics (no new pathology — learned rules transfer)
  project("Object Detection", 4, "Vision", "healthy", 12, "map", 0.5, 0.62),
  project("Network Intrusion Detection System", 4, "Tabular", "healthy", 6, "f1", 0.9, 0.97),
  project("Sales Time-Series Forecasting", 4, "Time Series", "data-leakage", 8, "r2", 0.7, 0.84),
  project("Movie Recommender System", 4, "Recommendation", "healthy", 8, "ndcg", 0.3, 0.44),
  project("Credit Risk Scoring", 4, "Tabular", "class-imbalance", 6, "f1", 0.85, 0.93),
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
