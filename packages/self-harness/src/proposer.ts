import { makePatch } from "./patch-factory.js";
import type {
  FailureCluster,
  Harness,
  HarnessPatch,
  Model,
  PatchOp,
  Proposer,
  SuiteResult,
} from "./types.js";

/**
 * A deterministic proposer that maps a known failure pattern to one or more
 * candidate harness edits, ordered so the loop can demonstrate the regression
 * gate at work (a deliberately over-aggressive candidate first, a sound one
 * second). Used by the offline demo and the tests — no model required.
 */
export class HeuristicProposer implements Proposer {
  // Invoked polymorphically through the Proposer interface (in the loop), so
  // static analysis can't see the concrete call site.
  // fallow-ignore-next-line unused-class-member
  async propose(
    _harness: Harness,
    cluster: FailureCluster,
    _suite: SuiteResult,
  ): Promise<HarnessPatch[]> {
    switch (cluster.pattern) {
      case "runaway-exploration":
        return [
          makePatch(
            "patch",
            "runaway-exploration",
            "Cap tool-call loops hard so exploration can't run forever.",
            [
              { op: "setLimit", key: "maxToolCalls", value: 3 },
              { op: "addRule", text: "Cap tool-call loops; stop exploring once you can act." },
            ],
          ),
          makePatch(
            "patch",
            "runaway-exploration",
            "Bound exploration with a reasonable ceiling and deliver the artifact.",
            [
              { op: "setLimit", key: "maxToolCalls", value: 50 },
              {
                op: "addRule",
                text: "Stop exploring and produce the required artifact once you have enough context.",
              },
            ],
          ),
        ];
      case "repeated-failed-command":
        return [
          makePatch(
            "patch",
            "repeated-failed-command",
            "Never re-run a command that already failed unchanged; try another approach.",
            [
              { op: "setLimit", key: "avoidRepeatedFailures", value: true },
              {
                op: "addRule",
                text: "When a command fails, do not re-run it unchanged — try a different approach.",
              },
            ],
          ),
        ];
      case "lost-env-var":
        return [
          makePatch(
            "patch",
            "lost-env-var",
            "Persist environment variables across sessions so state survives.",
            [
              { op: "setLimit", key: "persistEnvAcrossSessions", value: true },
              { op: "addRule", text: "Persist environment variables between sessions." },
            ],
          ),
        ];
      default:
        return [];
    }
  }
}

/**
 * The "model edits its own harness" path: the same model that runs the tasks is
 * asked to propose a minimal, JSON-encoded harness edit for a failure cluster.
 * The response is validated into typed {@link PatchOp}s; anything malformed is
 * dropped rather than trusted.
 */
export class ModelProposer implements Proposer {
  constructor(private readonly model: Model) {}

  async propose(
    harness: Harness,
    cluster: FailureCluster,
    _suite: SuiteResult,
  ): Promise<HarnessPatch[]> {
    const raw = await this.model.complete({
      system: PROPOSER_SYSTEM,
      user: buildProposerPrompt(harness, cluster),
    });
    const ops = parseOps(raw);
    if (ops.length === 0) return [];
    const rationale = `Edit proposed by ${this.model.name} for "${cluster.pattern}".`;
    return [makePatch("model-patch", cluster.pattern, rationale, ops)];
  }
}

const PROPOSER_SYSTEM = [
  "You improve your own agent harness. Given a recurring failure pattern, propose",
  "the SMALLEST edit that fixes it without changing unrelated behavior.",
  "Reply with ONLY a JSON array of ops. Allowed ops:",
  '{"op":"addRule","text":string}',
  '{"op":"setLimit","key":"maxToolCalls","value":number}',
  '{"op":"setLimit","key":"avoidRepeatedFailures","value":boolean}',
  '{"op":"setLimit","key":"persistEnvAcrossSessions","value":boolean}',
].join("\n");

function buildProposerPrompt(harness: Harness, cluster: FailureCluster): string {
  return [
    `Current limits: ${JSON.stringify(harness.limits)}`,
    `Current rules: ${JSON.stringify(harness.rules)}`,
    `Failure pattern "${cluster.pattern}" hit ${cluster.count} task(s).`,
    `Examples:\n${cluster.examples.map((e) => `  - ${e}`).join("\n")}`,
    "Propose the minimal fix as a JSON array of ops.",
  ].join("\n");
}

/** Extract and validate the ops array from a model response. Tolerant of prose. */
export function parseOps(raw: string): PatchOp[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const ops: PatchOp[] = [];
  for (const entry of parsed) {
    const op = validateOp(entry);
    if (op) ops.push(op);
  }
  return ops;
}

function validateOp(entry: unknown): PatchOp | null {
  if (typeof entry !== "object" || entry === null) return null;
  const e = entry as Record<string, unknown>;
  const op = e.op;
  if (op === "setLimit") return validateSetLimit(e);
  const isTextOp = op === "addRule" || op === "removeRule" || op === "setSystemPrompt";
  if (isTextOp && typeof e.text === "string") return { op, text: e.text };
  return null;
}

function validateSetLimit(e: Record<string, unknown>): PatchOp | null {
  const { key, value } = e;
  if (key === "maxToolCalls" && typeof value === "number") {
    return { op: "setLimit", key, value };
  }
  const isBoolLimit = key === "avoidRepeatedFailures" || key === "persistEnvAcrossSessions";
  if (isBoolLimit && typeof value === "boolean") {
    return { op: "setLimit", key, value };
  }
  return null;
}
