/**
 * Accessibility gate built on axe-core (dequelabs/axe-core). The pure functions
 * here (summarise + threshold) are unit-tested; the browser runner is a thin,
 * optional wrapper that loads Playwright + axe-core dynamically so the core app
 * has no hard dependency on a headless browser.
 */

export type Impact = "minor" | "moderate" | "serious" | "critical";

export interface AxeViolation {
  id: string;
  impact?: Impact | null;
  help?: string;
  nodes?: unknown[];
}

export interface AxeResult {
  violations: AxeViolation[];
}

export interface Summary {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  total: number;
  /** violation rule id → number of nodes. */
  byRule: Record<string, number>;
}

export function summarize(result: AxeResult): Summary {
  const summary: Summary = { critical: 0, serious: 0, moderate: 0, minor: 0, total: 0, byRule: {} };
  for (const v of result.violations) {
    const count = v.nodes?.length ?? 1;
    summary.total += count;
    if (v.impact) summary[v.impact] += count;
    summary.byRule[v.id] = (summary.byRule[v.id] ?? 0) + count;
  }
  return summary;
}

export interface Thresholds {
  /** Max allowed serious violations (default 0). */
  maxSerious?: number;
  /** Max allowed critical violations (default 0). */
  maxCritical?: number;
}

/** A page passes when it's under the critical/serious ceilings. */
export function passesThreshold(summary: Summary, t: Thresholds = {}): boolean {
  return summary.critical <= (t.maxCritical ?? 0) && summary.serious <= (t.maxSerious ?? 0);
}

export interface FileReport {
  file: string;
  summary: Summary;
  passed: boolean;
}

/** Human-readable one-line report for a file. */
export function formatReport(r: FileReport): string {
  const s = r.summary;
  const flag = r.passed ? "✓" : "✗";
  const rules = Object.keys(s.byRule).slice(0, 4).join(", ");
  return `${flag} ${r.file} — crit:${s.critical} serious:${s.serious} moderate:${s.moderate} minor:${s.minor}${rules ? ` [${rules}]` : ""}`;
}

/**
 * Run axe against local HTML files in headless Chromium. Dynamically imports
 * Playwright + axe-core; throws a clear error if they're not installed. Returns
 * one report per file.
 */
export async function auditFiles(
  files: string[],
  opts: { thresholds?: Thresholds; executablePath?: string } = {},
): Promise<FileReport[]> {
  let chromium: typeof import("playwright").chromium;
  let axeSource: string;
  try {
    ({ chromium } = await import("playwright"));
    const axe = await import("axe-core");
    axeSource =
      (axe as unknown as { source: string }).source ??
      (axe as { default?: { source: string } }).default?.source ??
      "";
  } catch {
    throw new Error("Accessibility gate needs devDeps: `bun add -d playwright axe-core`.");
  }
  const { pathToFileURL } = await import("node:url");

  const browser = await chromium.launch(
    opts.executablePath ? { executablePath: opts.executablePath } : {},
  );
  try {
    const reports: FileReport[] = [];
    for (const file of files) {
      const page = await browser.newPage();
      try {
        await page.goto(pathToFileURL(file).href, { waitUntil: "load", timeout: 30000 });
        await page.addScriptTag({ content: axeSource });
        const result = (await page.evaluate(
          "axe.run(document, { resultTypes: ['violations'] })",
        )) as AxeResult;
        const summary = summarize(result);
        reports.push({ file, summary, passed: passesThreshold(summary, opts.thresholds) });
      } finally {
        await page.close();
      }
    }
    return reports;
  } finally {
    await browser.close();
  }
}
