import type { BruDocument } from "./bru-parser.js";
import { dictEntries } from "./bru-parser.js";

/**
 * Bruno `assert` blocks are lines like `res.status: eq 200` or
 * `res.body.name: isDefined`. Each is an expression path, an operator, and an
 * optional expected value. This module parses them and evaluates them against a
 * response — which is exactly what a Self-Harness task's `check` needs.
 */
export interface Assertion {
  expression: string;
  operator: string;
  expected?: string;
}

/** The response shape assertions run against. */
export interface AssertResponse {
  status: number;
  body: unknown;
}

/** Extract the assertions from a parsed `.bru` document's `assert` block. */
export function parseAssertions(doc: BruDocument): Assertion[] {
  return dictEntries(doc, "assert")
    .filter((e) => e.enabled)
    .map((e) => {
      const [operator, ...rest] = e.value.split(/\s+/);
      const expected = rest.length > 0 ? rest.join(" ") : undefined;
      return { expression: e.name, operator: operator ?? "isDefined", expected };
    });
}

/** Evaluate all assertions; the first failure is reported. */
export function evaluateAssertions(
  assertions: Assertion[],
  response: AssertResponse,
): { passed: boolean; detail: string } {
  for (const assertion of assertions) {
    const actual = resolvePath(response, assertion.expression);
    if (!evaluate(actual, assertion.operator, assertion.expected)) {
      return {
        passed: false,
        detail: `${assertion.expression} ${assertion.operator} ${assertion.expected ?? ""} (got ${format(actual)})`,
      };
    }
  }
  return { passed: true, detail: `${assertions.length} assertion(s) passed` };
}

/** Resolve `res.status`, `res.body`, `res.body.a.b`, or `res.body[0].x`. */
export function resolvePath(response: AssertResponse, expression: string): unknown {
  const tokens = tokenizePath(expression);
  if (tokens[0] !== "res") return undefined;
  let current: unknown = { status: response.status, body: response.body };
  for (const token of tokens.slice(1)) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[token];
  }
  return current;
}

function tokenizePath(expression: string): string[] {
  return expression
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter((t) => t !== "");
}

/** Operator → predicate. Covers the common Bruno assert operators. */
const OPERATORS: Record<string, (actual: unknown, expected?: string) => boolean> = {
  eq: (a, e) => looseEq(a, e),
  neq: (a, e) => !looseEq(a, e),
  gt: (a, e) => numeric(a) > numeric(e),
  gte: (a, e) => numeric(a) >= numeric(e),
  lt: (a, e) => numeric(a) < numeric(e),
  lte: (a, e) => numeric(a) <= numeric(e),
  contains: (a, e) => String(a).includes(e ?? ""),
  notContains: (a, e) => !String(a).includes(e ?? ""),
  matches: (a, e) => new RegExp(e ?? "").test(String(a)),
  isDefined: (a) => a !== undefined,
  isUndefined: (a) => a === undefined,
  isNull: (a) => a === null,
  isNotNull: (a) => a !== null,
  isTruthy: (a) => Boolean(a),
  isFalsy: (a) => !a,
};

function evaluate(actual: unknown, operator: string, expected?: string): boolean {
  const predicate = OPERATORS[operator];
  return predicate ? predicate(actual, expected) : false;
}

function looseEq(actual: unknown, expected?: string): boolean {
  if (expected !== undefined && typeof actual === "number" && /^-?\d+(\.\d+)?$/.test(expected)) {
    return actual === Number(expected);
  }
  return String(actual) === String(expected);
}

function numeric(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function format(value: unknown): string {
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}
