import type { FailureCluster, SuiteResult } from "./types.js";

const UNKNOWN = "unknown-failure";

/**
 * Group failed runs by their dominant failure signal. This is the step that
 * turns an "infinite pass over logs" into a short list of recurring patterns a
 * proposer can act on — the thing the paper observes models have far more
 * patience for than humans.
 */
export function clusterFailures(suite: SuiteResult): FailureCluster[] {
  const byPattern = new Map<string, FailureCluster>();

  for (const result of suite.results) {
    if (result.passed) continue;
    const pattern = dominantSignal(result.trajectory.failureSignals);
    let cluster = byPattern.get(pattern);
    if (!cluster) {
      cluster = { pattern, count: 0, taskIds: [], examples: [] };
      byPattern.set(pattern, cluster);
    }
    cluster.count += 1;
    cluster.taskIds.push(result.taskId);
    if (cluster.examples.length < 3) {
      cluster.examples.push(`${result.taskId}: ${result.detail}`);
    }
  }

  // Largest clusters first — fix the most common pathology before the rare one.
  return [...byPattern.values()].sort((a, b) => b.count - a.count);
}

/**
 * The most frequent signal in a trajectory becomes its cluster key. Ties break
 * on first-seen order, which keeps clustering deterministic.
 */
function dominantSignal(signals: string[]): string {
  if (signals.length === 0) return UNKNOWN;
  const counts = new Map<string, number>();
  for (const s of signals) counts.set(s, (counts.get(s) ?? 0) + 1);
  let best = signals[0] as string;
  let bestCount = 0;
  for (const s of signals) {
    const c = counts.get(s) ?? 0;
    if (c > bestCount) {
      best = s;
      bestCount = c;
    }
  }
  return best;
}
