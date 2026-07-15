import type { McpTool, ToolSource } from "./mcp-client.js";

/**
 * The confirmation layer: turn the high-stakes candidate list into a defensible,
 * evidence-backed CSV by connecting to each server's real endpoint (via any
 * {@link ToolSource} — the streamable-http {@link import("./mcp-client.js").McpClient}
 * in production) and classifying each tool from its **actual 2025 annotations**.
 *
 * Honesty is the whole point. Absence of a `destructiveHint` does NOT mean a tool is
 * safe — most servers set no annotations at all — so an unannotated tool is reported
 * as `unannotated (cannot classify)`, never as safe and never as a candidate. Only a
 * tool the server itself marks destructive, with no idempotency hint, is a `candidate`.
 */

export type ToolKind = "candidate" | "idempotent-safe" | "read-only" | "unannotated";

export interface ToolVerdict {
  tool: string;
  kind: ToolKind;
  destructive: boolean;
  idempotent: boolean;
  /** The raw tool definition, as captured evidence. */
  evidence: string;
}

/** Classify one tool strictly from what the server declares — no guessing from names. */
export function classifyTool(tool: McpTool): ToolVerdict {
  const a = tool.annotations;
  const idempotent = a?.idempotentHint === true;
  const evidence = JSON.stringify(tool);
  if (a?.readOnlyHint === true) {
    return { tool: tool.name, kind: "read-only", destructive: false, idempotent, evidence };
  }
  const destructive = a?.destructiveHint === true || a?.readOnlyHint === false;
  if (destructive) {
    const kind: ToolKind = idempotent ? "idempotent-safe" : "candidate";
    return { tool: tool.name, kind, destructive: true, idempotent, evidence };
  }
  // No annotations at all: the manifest can't tell us. Say so rather than assume safe.
  return { tool: tool.name, kind: "unannotated", destructive: false, idempotent, evidence };
}

export type ServerStatus = "reached" | "auth-required" | "unreachable";

export interface ScanTarget {
  server: string;
  url: string;
}

export interface ServerConfirmation {
  server: string;
  url: string;
  status: ServerStatus;
  verdicts: ToolVerdict[];
}

/** Connect to one server through a {@link ToolSource} and classify its tools. */
export async function confirmServer(
  target: ScanTarget,
  source: ToolSource,
): Promise<ServerConfirmation> {
  try {
    const tools = await source.listTools(target.url);
    return {
      server: target.server,
      url: target.url,
      status: "reached",
      verdicts: tools.map(classifyTool),
    };
  } catch (err: unknown) {
    const message = String(err);
    const status: ServerStatus = /401|403|unauthor/i.test(message)
      ? "auth-required"
      : "unreachable";
    return { server: target.server, url: target.url, status, verdicts: [] };
  }
}

export interface ConfirmationSummary {
  serversReached: number;
  authRequired: number;
  unreachable: number;
  candidates: number;
  idempotentSafe: number;
  unannotated: number;
}

/** Tally coverage honestly — you can never claim "N vulnerable" for servers you never reached. */
export function summarize(confirmations: ServerConfirmation[]): ConfirmationSummary {
  const summary: ConfirmationSummary = {
    serversReached: 0,
    authRequired: 0,
    unreachable: 0,
    candidates: 0,
    idempotentSafe: 0,
    unannotated: 0,
  };
  for (const c of confirmations) {
    if (c.status === "reached") summary.serversReached += 1;
    else if (c.status === "auth-required") summary.authRequired += 1;
    else summary.unreachable += 1;
    for (const v of c.verdicts) {
      if (v.kind === "candidate") summary.candidates += 1;
      else if (v.kind === "idempotent-safe") summary.idempotentSafe += 1;
      else if (v.kind === "unannotated") summary.unannotated += 1;
    }
  }
  return summary;
}

const CSV_COLUMNS = [
  "server",
  "url",
  "tool",
  "kind",
  "destructive",
  "idempotent",
  "status",
  "evidence",
];

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Render confirmations as an honestly-labeled CSV (one row per tool; a status-only row if none). */
export function toCsv(confirmations: ServerConfirmation[]): string {
  const rows: string[] = [CSV_COLUMNS.join(",")];
  for (const c of confirmations) {
    if (c.verdicts.length === 0) {
      rows.push([c.server, c.url, "", "", "", "", c.status, ""].map(csvCell).join(","));
      continue;
    }
    for (const v of c.verdicts) {
      rows.push(
        [
          c.server,
          c.url,
          v.tool,
          v.kind,
          String(v.destructive),
          String(v.idempotent),
          c.status,
          v.evidence,
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }
  return rows.join("\n") + "\n";
}
