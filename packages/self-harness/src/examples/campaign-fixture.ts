import { expect } from "vitest";
import { defaultHarness } from "../harness.js";
import { selfHarness, type SelfHarnessResult } from "../loop.js";
import type { Agent, Proposer, Task } from "../types.js";

/**
 * Drive one self-harness campaign from the default harness and capture each gate
 * decision. Shared by the example test suites (data-science, osint), which all
 * assert the same shape — the loop reaches full pass while the gate both accepts
 * a sound edit and rejects an over-broad one.
 */
export async function drivenCampaign(
  agent: Agent,
  proposer: Proposer,
  tasks: Task[],
): Promise<{ result: SelfHarnessResult; decisions: boolean[] }> {
  const decisions: boolean[] = [];
  const result = await selfHarness({
    agent,
    proposer,
    tasks,
    initialHarness: defaultHarness(),
    onEvent: (e) => {
      if (e.type === "gate") decisions.push(e.decision.accepted);
    },
  });
  return { result, decisions };
}

/**
 * Assert a campaign converged to 100% having learned `expectedRules`, kept the
 * default query/compute budget (the over-broad clamp was rejected), and exercised
 * the gate in both directions (at least one accept and one reject).
 */
export function expectLearnsUnderGate(
  result: SelfHarnessResult,
  decisions: boolean[],
  expectedRules: string[],
): void {
  expect(result.finalPassRate).toBe(1);
  expect(result.finalHarness.rules).toEqual(expect.arrayContaining(expectedRules));
  expect(result.finalHarness.limits.maxToolCalls).toBe(1000);
  expect(decisions).toContain(false);
  expect(decisions).toContain(true);
}
