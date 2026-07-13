import type { Grade } from "./scorecard.js";

/**
 * The discovery layer: the live public MCP registry as growth data. The registry's
 * `/v0/servers` endpoint returns server metadata (not per-tool schemas), so this
 * scores a coarser, honest **readiness** signal from the fields that are actually
 * present — is it installable, is the source auditable, is it active, is it
 * documented — and rolls it into a "State of the MCP Registry" report plus a list of
 * real, reachable servers. That reachable list is what feeds the deep, arg-level
 * reliability scan (`scorecard.ts`) once a server's `tools/list` is pulled.
 */

export interface RegistryServer {
  name: string;
  description: string;
  hasRepository: boolean;
  /** Remote transport types declared (e.g. "streamable-http", "sse"); empty if none. */
  remoteTypes: string[];
  /** Count of installable packages (npm/pypi/etc.) declared. */
  packageCount: number;
  status: string;
  isLatest: boolean;
  version: string;
}

export type ReadinessRisk = "no-install" | "no-source" | "inactive" | "undocumented";

export interface ReadinessFinding {
  risk: ReadinessRisk;
  detail: string;
}

export interface ReadinessCard {
  server: string;
  findings: ReadinessFinding[];
  risk: number;
  grade: Grade;
  /** True if the server is active and has a remote endpoint we could pull tools from. */
  reachable: boolean;
}

const WEIGHT: Record<ReadinessRisk, number> = {
  "no-install": 5,
  inactive: 3,
  "no-source": 2,
  undocumented: 1,
};

/** Keep one row per server name — the latest version — so old duplicates don't skew the scan. */
export function latestOnly(servers: RegistryServer[]): RegistryServer[] {
  const byName = new Map<string, RegistryServer>();
  for (const s of servers) {
    const seen = byName.get(s.name);
    if (!seen || (s.isLatest && !seen.isLatest)) byName.set(s.name, s);
  }
  return [...byName.values()];
}

/** Score one registry entry's deploy-readiness from its declared metadata. */
export function scoreReadiness(server: RegistryServer): ReadinessCard {
  const findings: ReadinessFinding[] = [];
  const installable = server.remoteTypes.length > 0 || server.packageCount > 0;
  const active = server.status === "active";

  if (!installable) {
    findings.push({
      risk: "no-install",
      detail: "no remote endpoint and no package — not installable from the registry",
    });
  }
  if (!active) {
    findings.push({ risk: "inactive", detail: `status is '${server.status}', not active` });
  }
  if (!server.hasRepository) {
    findings.push({
      risk: "no-source",
      detail: "no source repository — the implementation can't be audited",
    });
  }
  if (server.description.length < 30) {
    findings.push({
      risk: "undocumented",
      detail: "little or no description — poor discoverability",
    });
  }

  const risk = findings.reduce((sum, f) => sum + WEIGHT[f.risk], 0);
  return {
    server: server.name,
    findings,
    risk,
    grade: gradeFor(risk),
    reachable: active && server.remoteTypes.length > 0,
  };
}

function gradeFor(risk: number): Grade {
  if (risk === 0) return "A";
  if (risk <= 2) return "B";
  if (risk <= 5) return "C";
  if (risk <= 9) return "D";
  return "F";
}

export interface RegistryReport {
  servers: number;
  gradeDistribution: Record<Grade, number>;
  installable: number;
  withSource: number;
  active: number;
  reachable: number;
  averageRisk: number;
}

/** The "State of the MCP Registry" content asset, over the deduped latest servers. */
export function registryReport(cards: ReadinessCard[], servers: RegistryServer[]): RegistryReport {
  const gradeDistribution: Record<Grade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  let totalRisk = 0;
  let reachable = 0;
  for (const card of cards) {
    gradeDistribution[card.grade] += 1;
    totalRisk += card.risk;
    if (card.reachable) reachable += 1;
  }
  return {
    servers: cards.length,
    gradeDistribution,
    installable: servers.filter((s) => s.remoteTypes.length > 0 || s.packageCount > 0).length,
    withSource: servers.filter((s) => s.hasRepository).length,
    active: servers.filter((s) => s.status === "active").length,
    reachable,
    averageRisk: cards.length > 0 ? totalRisk / cards.length : 0,
  };
}

/** The raw shape the registry API returns, for the live-fetch drop-in to map. */
interface RawRegistryResponse {
  servers: Array<{
    server: {
      name: string;
      description?: string;
      version?: string;
      repository?: unknown;
      remotes?: Array<{ type: string }>;
      packages?: unknown[];
    };
    _meta?: {
      "io.modelcontextprotocol.registry/official"?: { status?: string; isLatest?: boolean };
    };
  }>;
  metadata?: { nextCursor?: string };
}

/** Map one raw registry entry into the trimmed {@link RegistryServer} shape. */
export function mapRegistryEntry(entry: RawRegistryResponse["servers"][number]): RegistryServer {
  const s = entry.server;
  const meta = entry._meta?.["io.modelcontextprotocol.registry/official"];
  return {
    name: s.name,
    description: (s.description ?? "").replace(/\s+/g, " ").trim(),
    hasRepository: s.repository !== undefined,
    remoteTypes: (s.remotes ?? []).map((r) => r.type),
    packageCount: (s.packages ?? []).length,
    status: meta?.status ?? "unknown",
    isLatest: meta?.isLatest === true,
    version: s.version ?? "",
  };
}

/**
 * Live drop-in: page the real registry API into {@link RegistryServer}s. Uses global
 * `fetch`; pass a custom `fetchImpl` for tests or a proxy-aware dispatcher. Best-effort
 * — callers fall back to the vendored snapshot when the network is unavailable.
 */
export async function fetchRegistryLive(
  opts: { pages?: number; fetchImpl?: typeof fetch } = {},
): Promise<RegistryServer[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const pages = opts.pages ?? 1;
  const base = "https://registry.modelcontextprotocol.io/v0/servers?limit=100";
  const out: RegistryServer[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < pages; i++) {
    const url = cursor ? `${base}&cursor=${encodeURIComponent(cursor)}` : base;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`registry ${res.status}`);
    const json = (await res.json()) as RawRegistryResponse;
    for (const entry of json.servers) out.push(mapRegistryEntry(entry));
    cursor = json.metadata?.nextCursor;
    if (!cursor) break;
  }
  return out;
}
