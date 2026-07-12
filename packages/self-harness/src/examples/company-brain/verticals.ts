/**
 * The specialist verticals of the operating system — the agents that read the
 * brain before they act (SEO, CONTENT, PR, PAID, CRO). Each vertical hits its
 * target metric only when the right **playbook** rule is in the harness — so the
 * Self-Harness loop learns the company's playbooks the same way the data-science
 * example learns best-practices, with the regression gate protecting the
 * verticals that already perform.
 */
export interface Vertical {
  id: string;
  name: string;
  metric: string;
  /** Passing threshold for the metric (higher is better). */
  threshold: number;
  /** Metric before the playbook is learned (or when a vertical is sabotaged). */
  baselineMetric: number;
  /** Metric a correct, in-policy run achieves. */
  targetMetric: number;
  /** Playbook rule the harness must contain to hit target; absent = already performing. */
  requiredPlaybook?: string;
  /** Rules that, if present, break this vertical (e.g. brand-safety damage). */
  sensitiveTo: string[];
  /** Tool-call/compute steps a run needs — an over-tight budget starves it. */
  steps: number;
}

/** The playbook rule each under-performing vertical needs. */
export const PLAYBOOK_FOR_VERTICAL: Record<string, string | undefined> = {
  seo: "target-intent-keywords",
  pr: "lead-with-the-proof",
  paid: "cap-cac-to-ltv",
  cro: "test-one-change-at-a-time",
};

/** The over-aggressive SEO edit the gate must reject: it stuffs keywords and wrecks brand voice. */
export const HARMFUL_SEO_RULE = "keyword-stuff-everything";

export const VERTICALS: Vertical[] = [
  {
    id: "seo",
    name: "SEO",
    metric: "organic-sessions",
    threshold: 0.8,
    baselineMetric: 0.4,
    targetMetric: 0.9,
    requiredPlaybook: "target-intent-keywords",
    sensitiveTo: [],
    steps: 4,
  },
  {
    // Already performing — the guard the regression gate must protect. Brand
    // voice breaks if an over-aggressive SEO rule stuffs keywords.
    id: "content",
    name: "CONTENT",
    metric: "engagement-rate",
    threshold: 0.8,
    baselineMetric: 0.88,
    targetMetric: 0.88,
    requiredPlaybook: undefined,
    sensitiveTo: [HARMFUL_SEO_RULE],
    steps: 5,
  },
  {
    id: "pr",
    name: "PR",
    metric: "earned-mentions",
    threshold: 0.7,
    baselineMetric: 0.3,
    targetMetric: 0.82,
    requiredPlaybook: "lead-with-the-proof",
    sensitiveTo: [],
    steps: 4,
  },
  {
    id: "paid",
    name: "PAID",
    metric: "roas",
    threshold: 0.75,
    baselineMetric: 0.5,
    targetMetric: 0.85,
    requiredPlaybook: "cap-cac-to-ltv",
    sensitiveTo: [],
    steps: 4,
  },
  {
    id: "cro",
    name: "CRO",
    metric: "conversion-rate",
    threshold: 0.75,
    baselineMetric: 0.45,
    targetMetric: 0.83,
    requiredPlaybook: "test-one-change-at-a-time",
    sensitiveTo: [],
    steps: 4,
  },
];
