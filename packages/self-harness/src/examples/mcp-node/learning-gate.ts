import {
  evaluateAction,
  newActionContext,
  type ActionPolicy,
  type GuardedAction,
} from "./action-gate.js";

/**
 * The self-tightening gate — the capstone that fuses both threads of this project.
 *
 * The offline self-harness loop learns a harness from failures under one protected set:
 * tasks that already pass must never regress. The runtime action gate blocks attacks
 * under a fixed policy. This joins them: a containment policy that **learns to tighten
 * itself from the agent's own attack attempts**, gated so it never regresses on *two*
 * axes at once:
 *
 *  - **Safety monotonicity** — an attack the policy already blocks stays blocked. The
 *    loop can only ever close holes, never re-open one.
 *  - **Utility non-regression** — a legitimate action the policy already serves stays
 *    served. Tightening is never allowed to start blocking real traffic.
 *
 * A policy edit is accepted only if it closes ≥1 open hole while regressing *neither*
 * axis. That dual-gated acceptance is the same principle as the offline gate, but over a
 * pair of protected sets in tension — the tightest policy that blocks every seen attack
 * and permits every legitimate call, discovered automatically and provably.
 */

/** A corpus example with ground truth: benign should be allowed, attacks denied. */
export interface LabeledAction {
  id: string;
  action: GuardedAction;
  label: "benign" | "attack";
}

/** How a policy scores against the corpus, on both axes at once. */
export interface PolicyScorecard {
  /** Benign actions correctly allowed. */
  served: number;
  /** Benign actions wrongly denied — the utility regressions. */
  overBlocked: string[];
  /** Attacks correctly denied. */
  blocked: number;
  /** Attacks still getting through — the open holes. */
  openHoles: string[];
}

/**
 * Evaluate a policy's *shape* against one action, ignoring session counters (fresh
 * context), so the score reflects the policy's rules — not how much traffic has flowed.
 */
export function policyAllows(policy: ActionPolicy, action: GuardedAction): boolean {
  return evaluateAction(action, policy, newActionContext()).allow;
}

/** Score a policy over the whole corpus on both axes. */
export function scorePolicy(policy: ActionPolicy, corpus: LabeledAction[]): PolicyScorecard {
  const card: PolicyScorecard = { served: 0, overBlocked: [], blocked: 0, openHoles: [] };
  for (const item of corpus) {
    const allowed = policyAllows(policy, item.action);
    if (item.label === "benign") {
      if (allowed) card.served += 1;
      else card.overBlocked.push(item.id);
    } else if (allowed) card.openHoles.push(item.id);
    else card.blocked += 1;
  }
  return card;
}

/** A minimal, serializable tightening of a policy. */
export type PolicyEdit =
  | { kind: "require-idempotency-key" }
  | { kind: "deny-undeclared-host" }
  | { kind: "add-destructive-tool"; tool: string }
  | { kind: "remove-host"; host: string };

/** Apply one edit, returning a new policy (never mutates the input). */
export function applyEdit(policy: ActionPolicy, edit: PolicyEdit): ActionPolicy {
  switch (edit.kind) {
    case "require-idempotency-key":
      return { ...policy, requireIdempotencyKey: true };
    case "deny-undeclared-host":
      return { ...policy, allowUndeclaredHost: false };
    case "add-destructive-tool":
      return { ...policy, destructiveTools: [...(policy.destructiveTools ?? []), edit.tool] };
    case "remove-host":
      return { ...policy, allowedHosts: policy.allowedHosts.filter((h) => h !== edit.host) };
  }
}

function applyEdits(policy: ActionPolicy, edits: PolicyEdit[]): ActionPolicy {
  return edits.reduce(applyEdit, policy);
}

/** A candidate tightening aimed at one open hole. */
export interface Candidate {
  label: string;
  edits: PolicyEdit[];
}

const WRITE_TOOL = /charge|pay|refund|write|delete|send|put|post|create/i;

/**
 * Propose tightenings for one open hole, strictly from the action's shape — no ground
 * truth. An undeclared-host hole is closed by denying undeclared hosts. A write to an
 * allowed host that still slips through is offered two candidates: an aggressive
 * host-removal first (which will over-block the legitimate traffic on that host, so the
 * utility axis rejects it) and the clean idempotency requirement second. Same
 * aggressive-then-clean shape as every proposer in this project.
 */
export function proposeTightenings(hole: GuardedAction): Candidate[] {
  if (hole.host === undefined) {
    return [{ label: "deny undeclared hosts", edits: [{ kind: "deny-undeclared-host" }] }];
  }
  if (WRITE_TOOL.test(hole.tool)) {
    const host = hole.host;
    return [
      { label: `cut host '${host}'`, edits: [{ kind: "remove-host", host }] },
      {
        label: `require idempotency + mark '${hole.tool}' destructive`,
        edits: [
          { kind: "require-idempotency-key" },
          { kind: "add-destructive-tool", tool: hole.tool },
        ],
      },
    ];
  }
  return [];
}

export interface DualDecision {
  accept: boolean;
  reason: string;
  newOverBlocked: string[];
  newOpenHoles: string[];
}

/**
 * The dual gate. Accept a candidate only if, relative to the current policy, it closes at
 * least one hole while introducing **no** new over-blocked benign action and **no** new
 * open hole. Both protected sets must hold at once.
 */
export function dualGate(
  policy: ActionPolicy,
  candidate: Candidate,
  corpus: LabeledAction[],
): { decision: DualDecision; next: ActionPolicy } {
  const next = applyEdits(policy, candidate.edits);
  const before = scorePolicy(policy, corpus);
  const after = scorePolicy(next, corpus);

  const newOverBlocked = after.overBlocked.filter((id) => !before.overBlocked.includes(id));
  const newOpenHoles = after.openHoles.filter((id) => !before.openHoles.includes(id));
  const closed = before.openHoles.length - after.openHoles.length;

  let accept = false;
  let reason: string;
  if (newOverBlocked.length > 0) {
    reason = `rejected: would over-block ${newOverBlocked.length} legitimate action(s): ${newOverBlocked.join(", ")}`;
  } else if (newOpenHoles.length > 0) {
    reason = `rejected: would re-open ${newOpenHoles.length} hole(s)`;
  } else if (closed <= 0) {
    reason = "rejected: closes no open hole";
  } else {
    accept = true;
    reason = `accepted: closed ${closed} hole(s), 0 utility regressions`;
  }
  return { decision: { accept, reason, newOverBlocked, newOpenHoles }, next };
}

export interface LearnRound {
  targetHole: string;
  acceptedLabel: string | null;
  served: number;
  blocked: number;
}

export interface LearnResult {
  finalPolicy: ActionPolicy;
  rounds: LearnRound[];
  /** Every dual-gate verdict, in order — proof the gate was exercised both ways. */
  decisions: boolean[];
  initial: PolicyScorecard;
  final: PolicyScorecard;
  stoppedBecause: string;
}

/**
 * Learn the tightest safe policy: each round, target the first open hole, ask for
 * candidate tightenings, and commit the first the dual gate accepts. Terminates when no
 * hole remains (converged) or no candidate is acceptable (stuck).
 */
export function learnPolicy(
  initial: ActionPolicy,
  corpus: LabeledAction[],
  maxRounds = 20,
): LearnResult {
  const initialScore = scorePolicy(initial, corpus);
  const byId = new Map(corpus.map((c) => [c.id, c.action]));
  let policy = initial;
  const rounds: LearnRound[] = [];
  const decisions: boolean[] = [];
  let stoppedBecause = "reached max rounds";

  for (let r = 0; r < maxRounds; r++) {
    const score = scorePolicy(policy, corpus);
    if (score.openHoles.length === 0) {
      stoppedBecause = "all holes closed";
      break;
    }
    const targetHole = score.openHoles[0] as string;
    const holeAction = byId.get(targetHole) as GuardedAction;
    let acceptedLabel: string | null = null;
    for (const candidate of proposeTightenings(holeAction)) {
      const { decision, next } = dualGate(policy, candidate, corpus);
      decisions.push(decision.accept);
      if (decision.accept) {
        policy = next;
        acceptedLabel = candidate.label;
        break;
      }
    }
    const after = scorePolicy(policy, corpus);
    rounds.push({ targetHole, acceptedLabel, served: after.served, blocked: after.blocked });
    if (acceptedLabel === null) {
      stoppedBecause = `stuck on '${targetHole}' — no candidate cleared both axes`;
      break;
    }
  }

  return {
    finalPolicy: policy,
    rounds,
    decisions,
    initial: initialScore,
    final: scorePolicy(policy, corpus),
    stoppedBecause,
  };
}
