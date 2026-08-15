import type { JsonSchemaProp, McpTool, ToolSource } from "./mcp-client.js";
import {
  ecosystemReport,
  scoreServer,
  type EcosystemReport,
  type Scorecard,
  type ServerManifest,
  type ToolArg,
  type ToolManifest,
} from "./scorecard.js";

/**
 * The deep scan: pull a server's real `tools/list` and run the arg-level reliability
 * grader on its actual schemas. This is where the metadata-level registry scan graduates
 * into naming real risks — a destructive tool with no idempotency hint is the
 * double-charge exposure, a free-form object arg is drift, a format-sensitive string
 * with no constraint is coercion bait.
 */

/** A reachable server to deep-scan: its registry name and a remote endpoint URL. */
export interface ReachableServer {
  name: string;
  url: string;
}

/** Map a real `tools/list` result into the {@link ServerManifest} the grader scores. */
export function toolsToManifest(name: string, tools: McpTool[]): ServerManifest {
  // Rate limits aren't expressible in tools/list, so mark declared (neutral) and let the
  // deep scan focus on the risks the tool schema genuinely reveals.
  return { name, declaresRateLimits: true, tools: tools.map(toToolManifest) };
}

function toToolManifest(tool: McpTool): ToolManifest {
  const props = tool.inputSchema?.properties ?? {};
  const args: ToolArg[] = Object.entries(props).map(([argName, prop]) => ({
    name: argName,
    type: mapType(prop.type),
    constrained: isConstrained(prop),
  }));
  const a = tool.annotations;
  const mutation = a?.destructiveHint === true || a?.readOnlyHint === false;
  const idempotent = a?.idempotentHint === true;
  return { name: tool.name, args, mutation, idempotent };
}

function isConstrained(prop: JsonSchemaProp): boolean {
  return Boolean(prop.format || (prop.enum && prop.enum.length > 0) || prop.pattern);
}

function mapType(type: string | undefined): ToolArg["type"] {
  if (type === "number" || type === "integer") return "number";
  if (type === "boolean") return "boolean";
  if (type === "string") return "string";
  return "object";
}

export interface DeepScanResult {
  scanned: number;
  reached: number;
  errors: number;
  cards: Scorecard[];
  report: EcosystemReport;
}

/**
 * Deep-scan a list of reachable servers through any {@link ToolSource} (a live
 * {@link import("./mcp-client.js").McpClient} or a fixture). Best-effort: a server that
 * can't be reached is counted and skipped, so `reached` reports true coverage.
 */
export async function deepScan(
  servers: ReachableServer[],
  source: ToolSource,
): Promise<DeepScanResult> {
  const cards: Scorecard[] = [];
  let reached = 0;
  let errors = 0;
  for (const server of servers) {
    try {
      const tools = await source.listTools(server.url);
      cards.push(scoreServer(toolsToManifest(server.name, tools)));
      reached += 1;
    } catch {
      errors += 1;
    }
  }
  return { scanned: servers.length, reached, errors, cards, report: ecosystemReport(cards) };
}
