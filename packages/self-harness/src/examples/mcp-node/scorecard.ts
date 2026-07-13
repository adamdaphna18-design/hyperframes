/**
 * The growth engine: the public MCP ecosystem as data. Instead of competing with
 * the crowd of self-healing servers, this turns the 10,000+ public MCP servers into
 * a funnel — it statically analyzes a server's public tool manifest (the `tools/list`
 * schema anyone can fetch) for the exact reliability risks the self-correcting node
 * fixes, and grades it. One scan is a free lead magnet; the aggregate is a "State of
 * MCP Reliability" report; the low grades are the lead list. No scraping, no
 * fabricated runtime data — just a linter for MCP reliability over public schemas.
 */

export type RiskKind = "contract-drift" | "format-ambiguity" | "rate-limit" | "unsafe-retry";

export interface ToolArg {
  name: string;
  type: "string" | "number" | "boolean" | "object";
  /** A declared format / pattern / enum pins the value's shape (e.g. an ISO date). */
  constrained?: boolean;
}

export interface ToolManifest {
  name: string;
  args: ToolArg[];
  /** True if the tool mutates state. */
  mutation?: boolean;
  /** True if the tool accepts an idempotency key — a retry is then safe. */
  idempotent?: boolean;
}

export interface ServerManifest {
  name: string;
  /** True if the server documents rate limits / backoff guidance. */
  declaresRateLimits?: boolean;
  tools: ToolManifest[];
}

export interface Finding {
  tool: string;
  risk: RiskKind;
  detail: string;
  /** The self-correcting node capability that addresses this risk — the pitch, in the data. */
  fixedBy: string;
}

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface Scorecard {
  server: string;
  findings: Finding[];
  /** Weighted risk score; 0 is clean. */
  risk: number;
  grade: Grade;
}

/** Risk weights — a double-executing write dwarfs a cosmetic format ambiguity. */
const WEIGHT: Record<RiskKind, number> = {
  "unsafe-retry": 5,
  "contract-drift": 2,
  "format-ambiguity": 1,
  "rate-limit": 1,
};

/** Argument names that imply a specific value format worth pinning down. */
const FORMAT_HINT = /date|time|email|url|amount|price|phone|zip|postal|currency|iso/i;

/** Score one server's public manifest against the node's repair taxonomy. */
export function scoreServer(manifest: ServerManifest): Scorecard {
  const findings: Finding[] = [];

  if (manifest.declaresRateLimits !== true) {
    findings.push({
      tool: "*",
      risk: "rate-limit",
      detail: "no documented rate limits — clients hit surprise 429s",
      fixedBy: "a learned backoff:<tool> rule",
    });
  }

  for (const tool of manifest.tools) {
    if (tool.mutation && !tool.idempotent) {
      findings.push({
        tool: tool.name,
        risk: "unsafe-retry",
        detail: "mutation with no idempotency key — a blind retry double-executes",
        fixedBy: "the regression gate (rejects retry:all before it double-charges)",
      });
    }
    for (const arg of tool.args) {
      if (arg.type === "object" && !arg.constrained) {
        findings.push({
          tool: tool.name,
          risk: "contract-drift",
          detail: `free-form object arg '${arg.name}' — its schema can drift silently`,
          fixedBy: "a learned map:<from>:<to> field-rename rule",
        });
      } else if (arg.type === "string" && !arg.constrained && FORMAT_HINT.test(arg.name)) {
        findings.push({
          tool: tool.name,
          risk: "format-ambiguity",
          detail: `'${arg.name}' looks format-sensitive but is an unconstrained string`,
          fixedBy: "a learned coerce:<field>:<format> rule",
        });
      }
    }
  }

  const risk = findings.reduce((sum, f) => sum + WEIGHT[f.risk], 0);
  return { server: manifest.name, findings, risk, grade: gradeFor(risk) };
}

function gradeFor(risk: number): Grade {
  if (risk === 0) return "A";
  if (risk <= 2) return "B";
  if (risk <= 5) return "C";
  if (risk <= 9) return "D";
  return "F";
}

export interface EcosystemReport {
  servers: number;
  gradeDistribution: Record<Grade, number>;
  /** Servers carrying at least one finding of each risk — the aggregate headline. */
  withUnsafeRetry: number;
  withContractDrift: number;
  withFormatAmbiguity: number;
  withRateLimitRisk: number;
  averageRisk: number;
}

/** Roll scans up into the "State of MCP Reliability" content asset + lead list. */
export function ecosystemReport(cards: Scorecard[]): EcosystemReport {
  const gradeDistribution: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  let withUnsafeRetry = 0;
  let withContractDrift = 0;
  let withFormatAmbiguity = 0;
  let withRateLimitRisk = 0;
  let totalRisk = 0;

  for (const card of cards) {
    gradeDistribution[card.grade] += 1;
    totalRisk += card.risk;
    const kinds = new Set(card.findings.map((f) => f.risk));
    if (kinds.has("unsafe-retry")) withUnsafeRetry += 1;
    if (kinds.has("contract-drift")) withContractDrift += 1;
    if (kinds.has("format-ambiguity")) withFormatAmbiguity += 1;
    if (kinds.has("rate-limit")) withRateLimitRisk += 1;
  }

  return {
    servers: cards.length,
    gradeDistribution,
    withUnsafeRetry,
    withContractDrift,
    withFormatAmbiguity,
    withRateLimitRisk,
    averageRisk: cards.length > 0 ? totalRisk / cards.length : 0,
  };
}
