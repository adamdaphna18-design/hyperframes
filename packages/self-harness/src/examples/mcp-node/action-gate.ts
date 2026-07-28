/**
 * The hybrid runtime gate — the same acceptance principle as the offline self-harness
 * gate, relocated to *runtime, per action*. It answers one question before an action
 * commits: does this violate a protected invariant? If so it vetoes — by policy, not by
 * asking the agent nicely. One primitive covers both failures this work circles:
 *
 *  - **Reliability (MCP double-charge):** a retried destructive write is vetoed as a
 *    duplicate effect, so a timeout+retry can't execute a charge twice.
 *  - **Containment (the OpenAI/Hugging Face breakout):** an action reaching a host off
 *    the allowlist, or probing past the denial budget, is vetoed no matter how good the
 *    agent's goal looked — enforcement sits *below* the agent, which can't reason past it.
 *
 * Design rules, each earned from a hole found by attacking an earlier version:
 *
 *  1. **Absence is never safety.** An action that declares no host is denied, not waved
 *     through as "local" — the same principle the tool scanner uses for unannotated tools.
 *  2. **Never trust the caller's self-description to *lower* risk.** A tool the policy
 *     marks destructive stays destructive even if the action claims otherwise; the
 *     declared flag may only escalate.
 *  3. **Denied attempts are counted.** A rate cap that only counts *allowed* actions lets
 *     an agent probe forever — 17,000 blocked attempts must trip a breaker, not be free.
 *  4. **Reserve before you await.** The effect id is claimed synchronously, so two
 *     concurrent retries can't both pass the check before either commits.
 *  5. **A failed call is *unknown*, not "didn't happen".** A timeout is precisely when a
 *     write may have landed. The effect goes `unresolved` and further attempts are denied
 *     until {@link reconcileEffect} states what really happened.
 */

/** Lifecycle of a destructive effect, keyed by its idempotency id. */
export type EffectState = "in-flight" | "committed" | "unresolved";

/** Every way the gate can say no. A closed union so callers can exhaustively handle them. */
export type DenyRule =
  | "circuit-open"
  | "rate-cap"
  | "unknown-host"
  | "egress-allowlist"
  | "missing-idempotency-key"
  | "duplicate-effect"
  | "effect-in-flight"
  | "effect-unresolved";

export interface GuardedAction {
  tool: string;
  /**
   * External host this action reaches. Omitting it is treated as *undeclared*, not as
   * "local and safe" — see {@link ActionPolicy.allowUndeclaredHost}.
   */
  host?: string;
  /** Caller's claim that this changes external state. May escalate risk, never lower it. */
  destructive?: boolean;
  /** Idempotency key: the same key is the same logical effect; a retry reuses it. */
  effectId?: string;
}

export interface ActionPolicy {
  /** Hosts the agent may reach. Anything else is denied — the egress boundary. */
  readonly allowedHosts: readonly string[];
  /** Tools the policy *knows* are destructive, regardless of what the action claims. */
  readonly destructiveTools?: readonly string[];
  /** Hard cap on executed actions in this session. */
  readonly maxActions: number;
  /** Denials tolerated before the breaker opens and the session is halted. */
  readonly maxDenials: number;
  /** When true, a destructive action must carry an effectId (idempotency key). */
  readonly requireIdempotencyKey: boolean;
  /** Escape hatch for trusted local-only tools. Defaults to false: undeclared host = deny. */
  readonly allowUndeclaredHost?: boolean;
}

export interface AuditEntry {
  seq: number;
  tool: string;
  host?: string;
  effectId?: string;
  allowed: boolean;
  rule: DenyRule | "allow";
  reason: string;
}

export interface ActionContext {
  /** Effect id → lifecycle state. The duplicate-charge guard. */
  readonly effects: Map<string, EffectState>;
  /** Append-only decision trail; a real deployment mirrors this to a tamper-evident sink. */
  readonly audit: AuditEntry[];
  executedCount: number;
  deniedCount: number;
  /** Latched once the denial budget is spent — the session is over. */
  halted: boolean;
}

/** A fresh runtime context for one agent session. */
export function newActionContext(): ActionContext {
  return { effects: new Map(), audit: [], executedCount: 0, deniedCount: 0, halted: false };
}

export type ActionDecision =
  | { allow: true; rule: "allow"; reason: string }
  | { allow: false; rule: DenyRule; reason: string };

type RuleHit = { rule: DenyRule; reason: string } | null;

/** Bare hostnames only — anything with credentials, a port, or a path is malformed. */
const HOSTNAME = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

/** Normalize a declared host, or null if it isn't a plain hostname (`user@host`, paths…). */
function normalizeHost(host: string): string | null {
  const lower = host.trim().toLowerCase();
  return HOSTNAME.test(lower) ? lower : null;
}

/** Policy-side truth: the action may raise its own risk, never lower the policy's. */
export function isDestructive(action: GuardedAction, policy: ActionPolicy): boolean {
  return action.destructive === true || (policy.destructiveTools ?? []).includes(action.tool);
}

function circuitRule(_a: GuardedAction, _p: ActionPolicy, c: ActionContext): RuleHit {
  if (c.halted) return { rule: "circuit-open", reason: "session halted after too many denials" };
  return null;
}

function rateRule(_a: GuardedAction, p: ActionPolicy, c: ActionContext): RuleHit {
  if (c.executedCount >= p.maxActions) {
    return { rule: "rate-cap", reason: `action budget of ${p.maxActions} exhausted` };
  }
  return null;
}

function egressRule(a: GuardedAction, p: ActionPolicy): RuleHit {
  if (a.host === undefined) {
    if (p.allowUndeclaredHost === true) return null;
    return { rule: "unknown-host", reason: "action declares no host; undeclared is not safe" };
  }
  const host = normalizeHost(a.host);
  if (host === null) {
    return { rule: "unknown-host", reason: `'${a.host}' is not a bare hostname` };
  }
  if (!p.allowedHosts.some((allowed) => allowed.trim().toLowerCase() === host)) {
    return { rule: "egress-allowlist", reason: `host '${host}' is not on the allowlist` };
  }
  return null;
}

function idempotencyKeyRule(a: GuardedAction, p: ActionPolicy): RuleHit {
  if (isDestructive(a, p) && p.requireIdempotencyKey && !a.effectId) {
    return {
      rule: "missing-idempotency-key",
      reason: "a destructive action must carry an effectId",
    };
  }
  return null;
}

const EFFECT_DENIAL: Record<EffectState, { rule: DenyRule; reason: string }> = {
  committed: {
    rule: "duplicate-effect",
    reason: "already committed — a retry would double-execute",
  },
  "in-flight": { rule: "effect-in-flight", reason: "a concurrent attempt is already running" },
  unresolved: {
    rule: "effect-unresolved",
    reason: "a prior attempt failed with an unknown outcome; reconcile before retrying",
  },
};

function effectRule(a: GuardedAction, p: ActionPolicy, c: ActionContext): RuleHit {
  if (!isDestructive(a, p) || !a.effectId) return null;
  const state = c.effects.get(a.effectId);
  if (!state) return null;
  const denial = EFFECT_DENIAL[state];
  return { rule: denial.rule, reason: `effect '${a.effectId}': ${denial.reason}` };
}

/**
 * Decide whether an action may commit. Deny-by-default on every protected class; only a
 * read to an allowed host, or a first attempt at a keyed write, gets through. Pure — it
 * reads the context and never mutates it.
 */
export function evaluateAction(
  action: GuardedAction,
  policy: ActionPolicy,
  context: ActionContext,
): ActionDecision {
  const rules = [circuitRule, rateRule, egressRule, idempotencyKeyRule, effectRule];
  for (const rule of rules) {
    const hit = rule(action, policy, context);
    if (hit) return { allow: false, rule: hit.rule, reason: hit.reason };
  }
  return { allow: true, rule: "allow", reason: "no protected invariant violated" };
}

function record(context: ActionContext, action: GuardedAction, decision: ActionDecision): void {
  context.audit.push({
    seq: context.audit.length + 1,
    tool: action.tool,
    host: action.host,
    effectId: action.effectId,
    allowed: decision.allow,
    rule: decision.rule,
    reason: decision.reason,
  });
}

export type GuardOutcome<T> =
  | { allowed: true; decision: ActionDecision; result: T }
  | { allowed: false; decision: ActionDecision };

/**
 * The enforcement wrapper: evaluate, and only run `execute` when allowed.
 *
 * The effect id is reserved **synchronously before awaiting**, so two concurrent retries
 * cannot both pass the check. On success it is marked committed; if `execute` throws, the
 * outcome is *unknown*, so it is marked `unresolved` and further attempts are denied until
 * {@link reconcileEffect} says what actually happened. The gate — not the tool, not the
 * agent — is what stops the second charge.
 */
export async function guardAction<T>(
  action: GuardedAction,
  execute: () => Promise<T>,
  policy: ActionPolicy,
  context: ActionContext,
): Promise<GuardOutcome<T>> {
  const decision = evaluateAction(action, policy, context);
  record(context, action, decision);

  if (!decision.allow) {
    context.deniedCount += 1;
    if (context.deniedCount >= policy.maxDenials) context.halted = true;
    return { allowed: false, decision };
  }

  const guarded = isDestructive(action, policy) ? action.effectId : undefined;
  if (guarded) context.effects.set(guarded, "in-flight"); // reserve before any await
  context.executedCount += 1;

  try {
    const result = await execute();
    if (guarded) context.effects.set(guarded, "committed");
    return { allowed: true, decision, result };
  } catch (err: unknown) {
    // A failure is an *unknown* outcome, not a proof that nothing happened.
    if (guarded) context.effects.set(guarded, "unresolved");
    throw err;
  }
}

/**
 * Resolve an effect whose outcome was unknown. This is the deliberate human/reconciler
 * step: only after checking the downstream system can you say a failed attempt truly did
 * not land — at which point a retry is safe and the id is released.
 */
export function reconcileEffect(
  context: ActionContext,
  effectId: string,
  outcome: "committed" | "not-committed",
): void {
  if (outcome === "committed") context.effects.set(effectId, "committed");
  else context.effects.delete(effectId);
}
