import type { Agent, Harness, Task, ToolCall, Trajectory } from "../../types.js";
import { RETRY_ALL_RULE, parseBackoff, parseCoerce, parseMap, type FailureKind } from "./rules.js";
import { callTool, getTool } from "./tools.js";

/** A host request to one MCP tool, possibly malformed or stale. */
export interface McpCall {
  id: string;
  tool: string;
  kind: "read" | "mutation";
  /** The raw payload the host AI sent. */
  payload: Record<string, string>;
  /** How this call fails under the naive node (absent for a call that already works). */
  failure?: FailureKind;
}

/** A task bound to one MCP call. */
export interface McpTask extends Task {
  call: McpCall;
}

/** What the node reports after handling a call. */
export interface NodeResult {
  tool: string;
  delivered: boolean;
  executions: number;
}

/**
 * A self-correcting MCP node. It applies the harness's learned repair rules to the
 * incoming payload — renaming drifted fields (`map:*`), fixing argument formats
 * (`coerce:*`), backing off rate-limited tools (`backoff:*`) — then calls the tool.
 * Under the naive harness the messy calls fail; the loop clusters those failures and
 * promotes the repair for each into a permanent gated rule. The over-aggressive
 * `retry:all` rule re-executes *every* call for "resilience": harmless for a read,
 * but it double-executes a payment charge — the regression the gate catches, exactly
 * the blind-retry-a-mutation footgun a naive self-healing loop would ship.
 */
export class McpNode implements Agent {
  async run(harness: Harness, task: Task): Promise<Trajectory> {
    const { call } = task as McpTask;
    const rules = new Set(harness.rules);
    const schema = getTool(call.tool);
    const payload = transform(call.payload, rules);
    const backoff = backsOff(rules, call.tool);

    let executions = 0;
    const exec = () => {
      executions += 1;
      return callTool(schema, payload, { backoff });
    };

    let result = exec();
    // Naive blanket retry: re-run every call once "for resilience" — double-executes.
    if (rules.has(RETRY_ALL_RULE)) result = exec();

    const delivered = result.ok;
    const ok = call.kind === "mutation" ? executions <= 1 : delivered;

    const toolCalls: ToolCall[] = [
      { name: call.tool, args: JSON.stringify(payload), ok: delivered, note: result.error },
    ];
    const nodeResult: NodeResult = { tool: call.tool, delivered, executions };
    return {
      taskId: call.id,
      toolCalls,
      output: JSON.stringify(nodeResult),
      failureSignals: ok
        ? []
        : [call.kind === "mutation" ? "unsafe-retry" : (call.failure ?? "unknown")],
    };
  }
}

/** Apply the learned field-rename and format-coercion repairs to a payload. */
function transform(payload: Record<string, string>, rules: Set<string>): Record<string, string> {
  const out = { ...payload };
  for (const rule of rules) {
    const m = parseMap(rule);
    if (m) {
      const value = out[m.from];
      if (value !== undefined) {
        out[m.to] = value;
        delete out[m.from];
      }
      continue;
    }
    const c = parseCoerce(rule);
    if (c && c.kind === "iso-date") {
      const value = out[c.field];
      if (value !== undefined) out[c.field] = value.replaceAll("/", "-");
    }
  }
  return out;
}

/** Whether the harness has learned to back off this specific rate-limited tool. */
function backsOff(rules: Set<string>, tool: string): boolean {
  for (const rule of rules) {
    const b = parseBackoff(rule);
    if (b && b.tool === tool) return true;
  }
  return false;
}
