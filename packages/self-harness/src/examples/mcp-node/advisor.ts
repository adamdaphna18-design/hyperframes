import { scoreReadiness, type ReadinessRisk, type RegistryServer } from "./registry.js";
import type { Grade } from "./scorecard.js";

/**
 * Turns the registry scan into a **named, actionable** list: real servers ranked by
 * the readiness gaps that are verifiable from public metadata, each with a concrete
 * suggestion. It is deliberately honest about what it can and can't confirm — a
 * missing source repo or install path is a fact from the registry; an arg-level
 * unsafe-retry (double-charge) is only a *candidate* until the server's `tools/list`
 * is pulled (`deepScan`). The financial / write-heavy servers with no auditable source
 * are exactly where that deep pull pays off, so they are surfaced as high-stakes.
 */

export type DomainTag = "financial" | "write-heavy" | "general";

const FINANCIAL =
  /pay|payment|invoic|billing|charge|checkout|wallet|bank|financ|stripe|crypto|token|trade|order|transaction|refund|money|fund|loan|mortgage/i;
const WRITE_HEAVY =
  /create|update|delete|write|send|deploy|provision|manage|post|schedule|book|submit|publish/i;

/** Classify a server's blast radius from its name + description (metadata only). */
export function classifyDomain(server: RegistryServer): DomainTag {
  const text = `${server.name} ${server.description}`;
  if (FINANCIAL.test(text)) return "financial";
  if (WRITE_HEAVY.test(text)) return "write-heavy";
  return "general";
}

const SUGGESTION: Record<ReadinessRisk, string> = {
  "no-source": "link a source repo so integrators can audit the tools before granting write access",
  "no-install": "declare a remote endpoint or package — an entry no one can install is invisible",
  inactive: "publish the latest version and mark it active, or the entry erodes registry trust",
  undocumented: "add a real description; discovery and trust both start there",
};

export interface NamedFinding {
  server: string;
  grade: Grade;
  domain: DomainTag;
  risks: ReadinessRisk[];
  reachable: boolean;
  /** True when this is a money/write server with no auditable source — a prime deep-scan lead. */
  highStakes: boolean;
  suggestions: string[];
}

function advise(server: RegistryServer): NamedFinding {
  const card = scoreReadiness(server);
  const domain = classifyDomain(server);
  const risks = card.findings.map((f) => f.risk);
  const highStakes = domain !== "general" && risks.includes("no-source");
  const suggestions = risks.map((r) => SUGGESTION[r]);
  if (card.reachable && domain === "financial") {
    suggestions.push(
      "pull its tools/list and deep-scan: a financial tool with a non-idempotent write is the double-charge our gate certifies against",
    );
  }
  return {
    server: server.name,
    grade: card.grade,
    domain,
    risks,
    reachable: card.reachable,
    highStakes,
    suggestions,
  };
}

export interface AdvisorReport {
  /** Every server that scored below A, worst first — the named lead list. */
  ranked: NamedFinding[];
  /** Money/write servers with no auditable source — where a deep scan is highest-value. */
  highStakes: NamedFinding[];
}

/** Render a high-stakes finding as display lines (pure, so the demo stays trivial). */
export function renderHighStakes(f: NamedFinding): string[] {
  const where = f.reachable ? ", reachable" : "";
  const lines = [
    `  [${f.grade}] ${f.server} (${f.domain}${where})`,
    `       → ${f.suggestions[0] ?? "publish a source repo"}`,
  ];
  if (f.reachable && f.domain === "financial") {
    lines.push(
      "       → prime deep-scan target: confirm its write tools are idempotent before a retry double-charges",
    );
  }
  return lines;
}

const GRADE_RANK: Record<Grade, number> = { F: 4, D: 3, C: 2, B: 1, A: 0 };

/** Advise across a set of registry servers: the ranked named list and the high-stakes subset. */
export function adviseServers(servers: RegistryServer[]): AdvisorReport {
  const all = servers.map(advise);
  const ranked = all
    .filter((f) => f.grade !== "A")
    .sort((a, b) => GRADE_RANK[b.grade] - GRADE_RANK[a.grade] || a.server.localeCompare(b.server));
  const highStakes = ranked.filter((f) => f.highStakes);
  return { ranked, highStakes };
}
