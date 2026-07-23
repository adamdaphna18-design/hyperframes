#!/usr/bin/env bun
/**
 * Accessibility gate: build the sample sites (static), then run axe-core over
 * every generated page in headless Chromium and fail if any page has critical
 * or serious violations. Run with `bun run verify:a11y`.
 *
 * Requires devDeps: playwright + axe-core (`bun add -d playwright axe-core`).
 */
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { build } from "../src/pipeline.ts";
import { CsvSource } from "../src/sources/csv.ts";
import { JsonSource } from "../src/sources/json.ts";
import { auditFiles, formatReport } from "../src/verify/axe.ts";

const OUT = ".a11y-out";
const CHROMIUM = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

await rm(OUT, { recursive: true, force: true });
await build({
  sources: [
    new CsvSource("fixtures/businesses.sample.csv"),
    new JsonSource("fixtures/businesses.sample.json"),
  ],
  outDir: OUT,
  target: "static",
  baseUrl: "https://dir.example",
  brand: "Demo Directory",
});

const sitesDir = join(OUT, "sites");
const siteFiles = (await readdir(sitesDir))
  .filter((f) => f.endsWith(".html"))
  .map((f) => join(sitesDir, f));
const files = [join(OUT, "index.html"), ...siteFiles];

const reports = await auditFiles(files, {
  thresholds: { maxCritical: 0, maxSerious: 0 },
  executablePath: CHROMIUM,
});

let failed = 0;
for (const r of reports) {
  process.stdout.write(formatReport(r) + "\n");
  if (!r.passed) failed++;
}
process.stdout.write(
  `\n${reports.length - failed}/${reports.length} pages pass the accessibility gate.\n`,
);
await rm(OUT, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
