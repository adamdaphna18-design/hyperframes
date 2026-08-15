import { makePatch } from "../patch-factory.js";
import type {
  Agent,
  FailureCluster,
  Harness,
  HarnessPatch,
  Proposer,
  SuiteResult,
  Task,
  ToolCall,
  Trajectory,
} from "../types.js";

/**
 * A deterministic generator of randomized self-harness campaigns, used to test the
 * acceptance policies at scale. Each campaign has a set of broken tasks (each needs
 * its own `fix:` rule) and a set of already-working "protected" tasks. The interesting
 * part is the proposer: some of the fixes it offers also carry a *side effect* that
 * breaks a protected task. That is the exact situation the acceptance criterion has to
 * judge — and where a gate and a "net-positive" optimizer diverge.
 */

/** A tiny seeded LCG — deterministic pseudo-randomness (no `Math.random`). */
class Lcg {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }
  next(): number {
    this.state = (Math.imul(this.state, 1103515245) + 12345) & 0x7fffffff;
    return this.state / 0x7fffffff;
  }
  pick<T>(items: T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[Math.floor(this.next() * items.length)];
  }
}

interface SynTask extends Task {
  protectedTask: boolean;
  requiredRule?: string;
}

export interface SyntheticConfig {
  broken: number;
  protectedTasks: number;
  /** P(a fix also breaks a protected task, but a clean alternative is offered too). */
  sideEffectProb: number;
  /** P(a bundle fix: fixes two tasks but breaks one — net-positive, yet a regression). */
  bundleProb: number;
  /** P(the only fix available also breaks a protected task — no clean alternative). */
  coupledProb: number;
}

function synTask(id: string, protectedTask: boolean, requiredRule?: string): SynTask {
  return {
    id,
    protectedTask,
    requiredRule,
    prompt: `synthetic ${id}`,
    check(output: string) {
      const passed = output === "pass";
      return { passed, detail: passed ? "ok" : "fail" };
    },
  };
}

/** Passes a task iff it isn't broken and its required rule (if any) is present. */
class SyntheticAgent implements Agent {
  async run(harness: Harness, task: Task): Promise<Trajectory> {
    const t = task as SynTask;
    const rules = new Set(harness.rules);
    const broken = rules.has(`break:${t.id}`);
    const satisfied = t.protectedTask || (t.requiredRule ? rules.has(t.requiredRule) : true);
    const passed = !broken && satisfied;
    const toolCalls: ToolCall[] = [{ name: "solve", args: t.id, ok: passed }];
    return {
      taskId: t.id,
      toolCalls,
      output: passed ? "pass" : "fail",
      failureSignals: passed ? [] : [t.id],
    };
  }
}

/** Offers the fix for a cluster, sometimes bundled with a protected-task-breaking side effect. */
class SyntheticProposer implements Proposer {
  private readonly rng: Lcg;
  constructor(
    seed: number,
    private readonly cfg: SyntheticConfig,
  ) {
    this.rng = new Lcg(seed * 7919 + 13);
  }

  // Dispatched through the Proposer interface by the loop.
  async propose(
    _harness: Harness,
    cluster: FailureCluster,
    suite: SuiteResult,
  ): Promise<HarnessPatch[]> {
    const id = cluster.pattern;
    const fix = { op: "addRule" as const, text: `fix:${id}` };
    const target = this.breakTarget(suite);
    if (!target) return [makePatch("syn", id, "clean fix", [fix])];

    const r = this.rng.next();
    const brk = { op: "addRule" as const, text: `break:${target}` };
    if (r < this.cfg.coupledProb) {
      // No clean alternative: fixing this cluster necessarily breaks a protected task.
      return [makePatch("syn", id, "coupled fix", [fix, brk])];
    }
    if (r < this.cfg.coupledProb + this.cfg.bundleProb) {
      const extra = this.extraFix(suite, id);
      const ops = extra ? [fix, extra, brk] : [fix, brk];
      // Net-positive (fixes 2, breaks 1) first, clean fix second.
      return [makePatch("syn", id, "bundle fix", ops), makePatch("syn", id, "clean fix", [fix])];
    }
    if (r < this.cfg.coupledProb + this.cfg.bundleProb + this.cfg.sideEffectProb) {
      // Side effect with a clean alternative available second.
      return [
        makePatch("syn", id, "side-effect fix", [fix, brk]),
        makePatch("syn", id, "clean fix", [fix]),
      ];
    }
    return [makePatch("syn", id, "clean fix", [fix])];
  }

  private breakTarget(suite: SuiteResult): string | undefined {
    const passingProtected = suite.results
      .filter((res) => res.passed && res.taskId.startsWith("p"))
      .map((res) => res.taskId);
    return this.rng.pick(passingProtected);
  }

  private extraFix(suite: SuiteResult, notId: string): { op: "addRule"; text: string } | undefined {
    const otherFailing = suite.results
      .filter((res) => !res.passed && res.taskId.startsWith("b") && res.taskId !== notId)
      .map((res) => res.taskId);
    const pick = this.rng.pick(otherFailing);
    return pick ? { op: "addRule", text: `fix:${pick}` } : undefined;
  }
}

/** Build one synthetic campaign: broken tasks `b*`, protected tasks `p*`, a seeded proposer. */
export function buildSyntheticCampaign(
  seed: number,
  cfg: SyntheticConfig,
): { agent: Agent; proposer: Proposer; tasks: Task[] } {
  const tasks: Task[] = [];
  for (let i = 0; i < cfg.broken; i++) tasks.push(synTask(`b${i}`, false, `fix:b${i}`));
  for (let i = 0; i < cfg.protectedTasks; i++) tasks.push(synTask(`p${i}`, true));
  return { agent: new SyntheticAgent(), proposer: new SyntheticProposer(seed, cfg), tasks };
}
