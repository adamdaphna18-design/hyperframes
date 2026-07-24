/**
 * The hybrid runtime gate — the same acceptance principle as the offline self-harness
 * gate, relocated to *runtime, per action*. It answers one question before an action
 * commits: does this violate a protected invariant? If so it vetoes — by policy, not by
 * asking the agent nicely. That single primitive covers both failures we've been
 * circling:
 *
 *  - **Reliability (MCP double-charge):** a retried non-idempotent write is vetoed as a
 *    duplicate effect, so a timeout+retry can't execute a charge twice.
 *  - **Containment (the OpenAI/Hugging Face breakout):** an action that reaches a host
 *    outside the allowlist, or exceeds the volume cap, is vetoed no matter how good the
 *    agent's goal looked — the enforcement sits *below* the agent, which can't reason
 *    past it.
 *
 * The lesson from "it understood the intent and didn't care": guardrails in the prompt
 * lose to a goal-seeker. A guardrail that runs, checks reality, and denies — holds.
 */

export interface GuardedAction {
  tool: string;
  /** External host this action reaches, if any (undefined = local, no egress). */
  host?: string;
  /** True if the action changes external state (a write / charge / send / delete). */
  destructive: boolean;
  /** Idempotency key: the same key is the same logical effect; a retry reuses it. */
  effectId?: string;
}

export interface ActionPolicy {
  /** Hosts the agent may reach. Anything else is denied — the egress boundary. */
  allowedHosts: string[];
  /** Hard cap on actions in this session (the runaway-volume / 17k-attempt trip). */
  maxActions: number;
  /** When true, a destructive action must carry an effectId (idempotency key). */
  requireIdempotencyKey: boolean;
}

export interface ActionContext {
  /** Effect ids that have already committed — the duplicate-charge guard. */
  committedEffects: Set<string>;
  actionCount: number;
}

/** A fresh, empty runtime context for one agent session. */
export function newActionContext(): ActionContext {
  return { committedEffects: new Set<string>(), actionCount: 0 };
}

export interface ActionDecision {
  allow: boolean;
  /** The rule that decided (or "allow"). */
  rule: string;
  reason: string;
}

type RuleHit = { rule: string; reason: string } | null;

function rateRule(_a: GuardedAction, p: ActionPolicy, c: ActionContext): RuleHit {
  if (c.actionCount >= p.maxActions) {
    return { rule: "rate-cap", reason: `action budget of ${p.maxActions} exhausted` };
  }
  return null;
}

function egressRule(a: GuardedAction, p: ActionPolicy): RuleHit {
  if (a.host && !p.allowedHosts.includes(a.host)) {
    return { rule: "egress-allowlist", reason: `host '${a.host}' is not on the allowlist` };
  }
  return null;
}

function idempotencyKeyRule(a: GuardedAction, p: ActionPolicy): RuleHit {
  if (a.destructive && p.requireIdempotencyKey && !a.effectId) {
    return {
      rule: "missing-idempotency-key",
      reason: "a destructive action must carry an effectId",
    };
  }
  return null;
}

function duplicateEffectRule(a: GuardedAction, c: ActionContext): RuleHit {
  if (a.destructive && a.effectId && c.committedEffects.has(a.effectId)) {
    return {
      rule: "duplicate-effect",
      reason: `effect '${a.effectId}' already committed — retry would double-execute`,
    };
  }
  return null;
}

/**
 * Decide whether an action may commit. Deny-by-default on the protected classes
 * (egress, duplicate write, volume); allow read-only and first-time safe writes.
 * Pure: reads the context, never mutates it.
 */
export function evaluateAction(
  action: GuardedAction,
  policy: ActionPolicy,
  context: ActionContext,
): ActionDecision {
  const hits: RuleHit[] = [
    rateRule(action, policy, context),
    egressRule(action, policy),
    idempotencyKeyRule(action, policy),
    duplicateEffectRule(action, context),
  ];
  for (const hit of hits) {
    if (hit) return { allow: false, rule: hit.rule, reason: hit.reason };
  }
  return { allow: true, rule: "allow", reason: "no protected invariant violated" };
}

export interface GuardOutcome<T> {
  decision: ActionDecision;
  /** Present only when the action was allowed and executed. */
  result?: T;
}

/**
 * The enforcement wrapper: evaluate the action, and only run `execute` if it's allowed.
 * A committed destructive effect is recorded *after* success, so a genuine failure can be
 * retried but a succeeded effect cannot be double-executed. The gate — not the tool, not
 * the agent — is what actually stops the second charge.
 */
export async function guardAction<T>(
  action: GuardedAction,
  execute: () => Promise<T>,
  policy: ActionPolicy,
  context: ActionContext,
): Promise<GuardOutcome<T>> {
  const decision = evaluateAction(action, policy, context);
  if (!decision.allow) return { decision };

  context.actionCount += 1;
  const result = await execute();
  if (action.destructive && action.effectId) context.committedEffects.add(action.effectId);
  return { decision, result };
}
