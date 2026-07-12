import { defaultHarness } from "../../harness.js";
import type { HarnessPatch, PatchOp } from "../../types.js";
import type { Judge, JudgeVerdict } from "../data-science/committee.js";

const DEFAULT_BUDGET = defaultHarness().limits.maxToolCalls;
const PRIVACY_RULE = /pii|redact|scope|provenance|corroborate|rate-limit/;

/**
 * The Compliance Officer — a fourth committee voice for recon edits, guarding the
 * privacy/authorization posture the other judges don't weigh. It rewards edits
 * that strengthen a guardrail (scope checks, PII minimization, provenance,
 * corroboration) and **vetoes any edit that raises the query budget**, because a
 * bigger budget means more data collected on individuals. It sits alongside the
 * empiricist: the Officer wants collection minimized, the empiricist wants the
 * lookup to still work — the throttle-everything candidate the Officer would wave
 * through is exactly the one the empiricist vetoes for breaking legitimate
 * in-scope lookups, so only a targeted guardrail satisfies both.
 */
export class ComplianceJudge implements Judge {
  readonly name = "Compliance-Officer (privacy)";

  async evaluate(candidate: HarnessPatch): Promise<JudgeVerdict> {
    const assessed = candidate.ops.map(assessOp);
    const score = Math.max(6, ...assessed.map((a) => a.score));
    const veto = assessed.some((a) => a.veto);
    const rationale = assessed.map((a) => a.note).join("; ") || "no privacy impact";
    return { judge: this.name, score, veto, rationale };
  }
}

interface OpAssessment {
  score: number;
  veto: boolean;
  note: string;
}

/** The Compliance Officer's read on a single op — privacy posture and collection footprint. */
function assessOp(op: PatchOp): OpAssessment {
  if (op.op === "addRule") {
    const privacy = PRIVACY_RULE.test(op.text);
    return {
      score: privacy ? 9 : 7,
      veto: false,
      note: privacy ? `strengthens the privacy posture ("${op.text}")` : "declarative guardrail",
    };
  }
  if (op.op === "setLimit" && op.key === "maxToolCalls") {
    return op.value > DEFAULT_BUDGET
      ? {
          score: 6,
          veto: true,
          note: "raises the query budget — expands data collection on individuals",
        }
      : { score: 8, veto: false, note: "tightens the query budget — collects less" };
  }
  return { score: 6, veto: false, note: "no direct privacy impact" };
}
