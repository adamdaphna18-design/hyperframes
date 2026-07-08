import { applyPatch } from "../../harness.js";
import { passingIds, runSuite } from "../../runner.js";
import type {
  Agent,
  FailureCluster,
  Harness,
  HarnessPatch,
  Proposer,
  SuiteResult,
  Task,
} from "../../types.js";

/**
 * An internal review committee for proposed harness edits, inspired by three
 * agentic-DS systems — each a distinct "voice" a candidate must satisfy:
 *
 *   - SR-Scientist (empiricist): demands experimental proof. It applies the
 *     candidate, runs the suite, and vetoes anything that doesn't measurably
 *     improve results or that regresses a passing project — grounded in a real
 *     run, not the model's word.
 *   - R&D-Agent (architect): judges structure and scalability. A declarative
 *     rule is clean; a hard compute-budget clamp is a maintainability smell.
 *   - DR-Venus (economist): judges resource cost. Cheap edits score high;
 *     raising the compute budget is expensive.
 *
 * The committee sits on top of the regression gate: the gate guarantees
 * correctness (no regression), the committee raises the bar to Pareto-optimal
 * edits (proven, clean, cheap). A candidate is accepted only with no veto and an
 * average score at or above the threshold.
 */
export interface JudgeContext {
  harness: Harness;
  agent: Agent;
  tasks: Task[];
  baseline: SuiteResult;
}

export interface JudgeVerdict {
  judge: string;
  score: number;
  veto: boolean;
  rationale: string;
}

export interface Judge {
  readonly name: string;
  evaluate(candidate: HarnessPatch, ctx: JudgeContext): Promise<JudgeVerdict>;
}

/** The full committee verdict on one candidate. */
export interface CommitteeVerdict {
  patchId: string;
  targetPattern: string;
  verdicts: JudgeVerdict[];
  average: number;
  vetoed: boolean;
  accepted: boolean;
}

/** SR-Scientist — grounds its score in an actual validation run. */
export class EmpiricalJudge implements Judge {
  readonly name = "SR-Scientist (empiricist)";

  async evaluate(candidate: HarnessPatch, ctx: JudgeContext): Promise<JudgeVerdict> {
    const after = await runSuite(ctx.agent, applyPatch(ctx.harness, candidate), ctx.tasks);
    const was = passingIds(ctx.baseline);
    const now = passingIds(after);
    const newly = [...now].filter((id) => !was.has(id));
    const regressions = [...was].filter((id) => !now.has(id));

    if (regressions.length > 0) {
      return verdict(
        this.name,
        0,
        true,
        `regresses ${regressions.length} passing project(s) — fails the experiment`,
      );
    }
    if (newly.length === 0) {
      return verdict(this.name, 2, true, "no measurable improvement on the validation suite");
    }
    return verdict(
      this.name,
      Math.min(10, 5 + newly.length * 2),
      false,
      `+${newly.length} project(s) pass, 0 regressions`,
    );
  }
}

/** R&D-Agent — rewards declarative rules, penalizes brittle clamps. */
export class ArchitectJudge implements Judge {
  readonly name = "R&D-Agent (architect)";

  async evaluate(candidate: HarnessPatch): Promise<JudgeVerdict> {
    let score = 9;
    let veto = false;
    const notes: string[] = [];
    for (const op of candidate.ops) {
      if (op.op === "setLimit" && op.key === "maxToolCalls") {
        score = Math.min(score, 4);
        notes.push("clamps the compute budget — brittle, won't scale");
        if (op.value <= 3) {
          veto = true;
          notes.push("clamp too tight for real workloads");
        }
      } else if (op.op === "setSystemPrompt") {
        score = Math.min(score, 6);
        notes.push("rewrites the whole system prompt — heavy-handed");
      } else {
        notes.push("declarative rule — clean and modular");
      }
    }
    return verdict(this.name, score, veto, notes.join("; ") || "no structural concerns");
  }
}

/** DR-Venus — rewards cheap edits, penalizes raising the compute budget. */
export class EconomistJudge implements Judge {
  readonly name = "DR-Venus (economist)";

  async evaluate(candidate: HarnessPatch): Promise<JudgeVerdict> {
    let score = 8;
    const notes: string[] = [];
    for (const op of candidate.ops) {
      if (op.op === "setLimit" && op.key === "maxToolCalls") {
        const cheap = op.value <= 50;
        score = Math.min(score, cheap ? 9 : 4);
        notes.push(cheap ? "caps compute — cheap to run" : "raises the compute budget — costly");
      } else {
        notes.push("a rule adds no runtime cost");
      }
    }
    return verdict(this.name, score, false, notes.join("; ") || "negligible resource cost");
  }
}

export interface CommitteeConfig {
  /** The proposer whose candidates the committee reviews. */
  inner: Proposer;
  /** Needed by the empiricist judge to run its validation experiment. */
  agent: Agent;
  tasks: Task[];
  /** Defaults to the SR / R&D / DR-Venus panel. */
  judges?: Judge[];
  /** Minimum average score to accept (default 7.5). */
  threshold?: number;
  onVerdict?: (verdict: CommitteeVerdict) => void;
}

/**
 * Wraps a proposer so every candidate must pass the committee: no veto and an
 * average score ≥ threshold. Surviving candidates are returned best-first; the
 * loop's regression gate still has the final say on correctness.
 */
export class CommitteeProposer implements Proposer {
  private readonly records: CommitteeVerdict[] = [];

  constructor(private readonly config: CommitteeConfig) {}

  // Dispatched through the Proposer interface by the loop.
  // fallow-ignore-next-line unused-class-member
  async propose(
    harness: Harness,
    cluster: FailureCluster,
    suite: SuiteResult,
  ): Promise<HarnessPatch[]> {
    const candidates = await this.config.inner.propose(harness, cluster, suite);
    const judges = this.config.judges ?? defaultCommittee();
    const threshold = this.config.threshold ?? 7.5;
    const ctx: JudgeContext = {
      harness,
      agent: this.config.agent,
      tasks: this.config.tasks,
      baseline: suite,
    };

    const survivors: Array<{ candidate: HarnessPatch; average: number }> = [];
    for (const candidate of candidates) {
      const verdicts = await Promise.all(judges.map((j) => j.evaluate(candidate, ctx)));
      const average = verdicts.reduce((sum, v) => sum + v.score, 0) / verdicts.length;
      const vetoed = verdicts.some((v) => v.veto);
      const accepted = !vetoed && average >= threshold;
      const record: CommitteeVerdict = {
        patchId: candidate.id,
        targetPattern: candidate.targetPattern,
        verdicts,
        average,
        vetoed,
        accepted,
      };
      this.records.push(record);
      this.config.onVerdict?.(record);
      if (accepted) survivors.push({ candidate, average });
    }

    survivors.sort((a, b) => b.average - a.average);
    return survivors.map((s) => s.candidate);
  }

  /** The accumulated "court records" — every candidate the committee reviewed. */
  courtRecords(): CommitteeVerdict[] {
    return this.records;
  }
}

/** The default three-voice panel. */
export function defaultCommittee(): Judge[] {
  return [new EmpiricalJudge(), new ArchitectJudge(), new EconomistJudge()];
}

/** Render the committee's decisions as a markdown "court records" log. */
export function renderCourtRecords(records: CommitteeVerdict[]): string {
  const lines: string[] = [
    "# Committee court records",
    "",
    `**Reviewed:** ${records.length} candidate(s)`,
    "",
  ];
  for (const record of records) {
    const outcome = record.accepted ? "ACCEPTED" : record.vetoed ? "VETOED" : "below threshold";
    lines.push(
      `## ${record.patchId} (${record.targetPattern}) — ${outcome}, avg ${record.average.toFixed(1)}`,
    );
    for (const v of record.verdicts) {
      lines.push(`- ${v.judge}: ${v.score}/10${v.veto ? " · VETO" : ""} — ${v.rationale}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function verdict(judge: string, score: number, veto: boolean, rationale: string): JudgeVerdict {
  return { judge, score, veto, rationale };
}
