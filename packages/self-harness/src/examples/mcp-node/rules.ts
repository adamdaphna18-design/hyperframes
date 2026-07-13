/**
 * The repair rules a self-correcting MCP node learns. A standard node fails when a
 * database renames a field, an API wants a different argument format, or a tool
 * rate-limits — and the blueprint's answer is to pay a micro-LLM to re-fix each
 * call at runtime, forever. This node does that once, then *promotes* the recurring
 * repair into a permanent, gated rule so the next thousand calls are handled for
 * free. Each rule is a small, serializable string — the same harness-as-data the
 * rest of the framework optimizes.
 */

export type FailureKind = "schema-drift" | "bad-arg-format" | "rate-limit";

/** The learned repair each recurring failure class converges to. */
export const RULE_FOR_FAILURE: Record<FailureKind, string> = {
  "schema-drift": "map:user:userId",
  "bad-arg-format": "coerce:date:iso-date",
  "rate-limit": "backoff:orders.search",
};

/**
 * The over-aggressive repair the gate must reject: "429? just retry every call."
 * Naive blanket retry re-executes *every* request — harmless for an idempotent read,
 * but it double-executes a payment charge. Blind-retrying a mutation is the classic
 * self-healing footgun, and the gate catches it because it regresses the charge guard.
 */
export const RETRY_ALL_RULE = "retry:all";

/** Parse a `map:<from>:<to>` field-rename rule (schema drift), or null. */
export function parseMap(rule: string): { from: string; to: string } | null {
  const m = /^map:(\w+):(\w+)$/.exec(rule);
  if (!m) return null;
  const [, from, to] = m;
  return from !== undefined && to !== undefined ? { from, to } : null;
}

/** Parse a `coerce:<field>:<kind>` argument-format rule, or null. */
export function parseCoerce(rule: string): { field: string; kind: string } | null {
  const m = /^coerce:(\w+):([\w-]+)$/.exec(rule);
  if (!m) return null;
  const [, field, kind] = m;
  return field !== undefined && kind !== undefined ? { field, kind } : null;
}

/** Parse a `backoff:<tool>` rate-limit rule, or null. */
export function parseBackoff(rule: string): { tool: string } | null {
  const m = /^backoff:([\w.]+)$/.exec(rule);
  if (!m) return null;
  const [, tool] = m;
  return tool !== undefined ? { tool } : null;
}
