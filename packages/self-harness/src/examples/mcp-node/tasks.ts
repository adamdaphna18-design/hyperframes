import { buildCalls } from "./calls.js";
import type { McpCall, McpTask, NodeResult } from "./node-agent.js";

/** Build the task suite: each host→tool call is a task the node must handle correctly. */
export function buildMcpSuite(): McpTask[] {
  return buildCalls().map(toTask);
}

function toTask(call: McpCall): McpTask {
  return {
    id: call.id,
    prompt: `Handle a ${call.kind} call to ${call.tool} from a messy host.`,
    call,
    check(output: string) {
      const result = parseResult(output);
      if (!result) return { passed: false, detail: "no result" };
      // A mutation is correct iff it was never double-executed; a read iff it delivered.
      if (call.kind === "mutation") {
        const passed = result.executions <= 1;
        return {
          passed,
          detail: passed
            ? `${call.tool} executed once ✓`
            : `${call.tool} executed ${result.executions}× (double-charge)`,
        };
      }
      const passed = result.delivered;
      return {
        passed,
        detail: passed ? `${call.tool} delivered ✓` : `${call.tool} failed (${call.failure})`,
      };
    },
  };
}

function parseResult(output: string): NodeResult | null {
  try {
    const parsed: unknown = JSON.parse(output);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as NodeResult).executions === "number"
    ) {
      return parsed as NodeResult;
    }
  } catch {
    // not a NodeResult envelope
  }
  return null;
}
