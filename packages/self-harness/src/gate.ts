import { applyPatch } from "./harness.js";
import { passingIds, runSuite } from "./runner.js";
import type { Agent, Harness, HarnessPatch, SuiteResult, Task } from "./types.js";

/** The verdict of running one candidate patch through the regression gate. */
export interface GateDecision {
  accepted: boolean;
  reason: string;
  patch: HarnessPatch;
  candidateHarness: Harness;
  before: SuiteResult;
  after: SuiteResult;
  /** Tasks that passed on the old harness but fail on the patched one. */
  regressions: string[];
  /** Tasks that failed before and pass now. */
  newlyPassing: string[];
}

/**
 * The acceptance criterion that keeps the loop from collapsing: a patch is
 * accepted only if it makes at least one failing task pass **and breaks nothing
 * that already worked**. A proposal that lifts the aggregate score by fixing
 * three tasks while silently breaking one is rejected — net-positive is not
 * enough, regressions are disqualifying.
 */
export async function regressionGate(
  agent: Agent,
  harness: Harness,
  patch: HarnessPatch,
  tasks: Task[],
  baseline: SuiteResult,
): Promise<GateDecision> {
  const candidateHarness = applyPatch(harness, patch);
  const after = await runSuite(agent, candidateHarness, tasks);

  const wasPassing = passingIds(baseline);
  const nowPassing = passingIds(after);

  const regressions = [...wasPassing].filter((id) => !nowPassing.has(id)).sort();
  const newlyPassing = [...nowPassing].filter((id) => !wasPassing.has(id)).sort();

  let accepted = false;
  let reason: string;
  if (regressions.length > 0) {
    accepted = false;
    reason = `rejected: regressed ${regressions.length} passing task(s): ${regressions.join(", ")}`;
  } else if (newlyPassing.length === 0) {
    accepted = false;
    reason = "rejected: no net improvement (nothing newly passing)";
  } else {
    accepted = true;
    reason = `accepted: +${newlyPassing.length} passing, 0 regressions`;
  }

  return {
    accepted,
    reason,
    patch,
    candidateHarness,
    before: baseline,
    after,
    regressions,
    newlyPassing,
  };
}
