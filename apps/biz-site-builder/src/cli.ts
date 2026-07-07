#!/usr/bin/env bun
import { writeFile } from "node:fs/promises";
import { createSource } from "./sources/index.ts";
import { WebSource } from "./sources/web.ts";
import { build, type OutputTarget } from "./pipeline.ts";
import { buildAuditReport, auditReportHtml, comparisonHtml } from "./generate/audit.ts";
import { stringsFor, type LocaleCode } from "./i18n/strings.ts";

interface ParsedArgs {
  command: string;
  sources: string[];
  out: string;
  target: OutputTarget;
  video: boolean;
  verifyLive: boolean;
  limit: number;
  concurrency: number;
  budget: number | null;
  resume: boolean;
  locale?: LocaleCode;
  market?: string;
  wpTheme?: string;
  livePlugins: boolean;
  geocode: boolean;
  geocodeEmail?: string;
  baseUrl?: string;
  brand?: string;
  gaId?: string;
  plausible?: string;
  quotes: boolean;
  includeWeak: boolean;
  url?: string;
  competitor?: string;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    command: argv[0] && !argv[0].startsWith("-") ? argv[0] : "build",
    sources: [],
    out: ".out",
    target: "wordpress",
    video: false,
    verifyLive: false,
    limit: 0,
    concurrency: 8,
    budget: null,
    resume: false,
    livePlugins: false,
    geocode: false,
    quotes: false,
    includeWeak: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "-s":
      case "--source":
        if (argv[++i]) args.sources.push(argv[i]!);
        break;
      case "-o":
      case "--out":
        if (argv[++i]) args.out = argv[i]!;
        break;
      case "-t":
      case "--target": {
        const v = argv[++i];
        if (v === "static" || v === "wordpress" || v === "both") args.target = v;
        break;
      }
      case "--video":
        args.video = true;
        break;
      case "--verify-live":
        args.verifyLive = true;
        break;
      case "--limit":
        args.limit = Number(argv[++i]) || 0;
        break;
      case "--concurrency":
        args.concurrency = Number(argv[++i]) || 8;
        break;
      case "--budget":
        args.budget = Number(argv[++i]) || null;
        break;
      case "--resume":
        args.resume = true;
        break;
      case "--locale": {
        const v = argv[++i];
        if (v === "en" || v === "he") args.locale = v;
        break;
      }
      case "--market":
        if (argv[++i]) args.market = argv[i];
        break;
      case "--wp-theme":
        if (argv[++i]) args.wpTheme = argv[i];
        break;
      case "--live-plugins":
        args.livePlugins = true;
        break;
      case "--geocode":
        args.geocode = true;
        break;
      case "--geocode-email":
        if (argv[++i]) args.geocodeEmail = argv[i];
        break;
      case "--base-url":
        if (argv[++i]) args.baseUrl = argv[i];
        break;
      case "--brand":
        if (argv[++i]) args.brand = argv[i];
        break;
      case "--ga-id":
        if (argv[++i]) args.gaId = argv[i];
        break;
      case "--plausible":
        if (argv[++i]) args.plausible = argv[i];
        break;
      case "--quotes":
        args.quotes = true;
        break;
      case "--include-weak":
        args.includeWeak = true;
        break;
      case "--url":
        if (argv[++i]) args.url = argv[i];
        break;
      case "--competitor":
        if (argv[++i]) args.competitor = argv[i];
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
    }
  }
  return args;
}

const HELP = `biz-site-builder — scrape/list businesses, build WordPress sites (+ promo videos) for those without one

Usage:
  biz-site-builder build --source <type:spec> [--source ...] [options]
  biz-site-builder audit --url <url> [--competitor <url>] [--out report.html] [--locale he] [--brand X]
       Scan a live business site and write a branded audit report (issues → services
       we sell → estimate → CTA) — a lead magnet for businesses that already have a site.
       With --competitor, also writes a side-by-side "you vs. them" comparison (FOMO close).

Sources (repeatable, merged in order — later sources enrich earlier ones):
  csv:./businesses.csv              Ingest a CSV export
  json:./businesses.json            Ingest a JSON array (or {businesses|results|elements:[...]})
  overpass:area=Brooklyn            Scrape OpenStreetMap businesses in a named area (free, no key)
  overpass:bbox=40.6,-74.0,40.7,-73.9   ...or within a bounding box (south,west,north,east)
  web:https://a.com,https://b.com   Ladder-style server-side scrape (JSON-LD/OG) → business profile
  web:https://a.com;ua=googlebot    ...with a crawler user-agent to slip past soft paywalls

Output target (--target, default: wordpress):
  wordpress   Full WordPress deploy bundle per business (WXR + WP-CLI + Composer + block theme)
  static      Self-contained static HTML site
  both        Static site AND WordPress bundle

Options:
  -o, --out <dir>       Output directory (default: .out)
  -t, --target <t>      wordpress | static | both (default: wordpress)
      --video           Also build a hyperframes promo video per site-less business
      --verify-live     HTTP-check listed sites; rebuild for dead links
      --limit <n>       Only build for the first N site-less businesses
      --concurrency <n> Max parallel build steps (workflow runtime; default: 8)
      --budget <n>      Hard ceiling on build units (workflow budget)
      --resume          Persist + replay a resume journal (<out>/.workflow.json)
      --locale <en|he>  Force a language for all sites (default: auto-detect)
      --market <name>   Market hint; "israel" → Hebrew (RTL)
      --wp-theme <slug> Base WordPress theme to extend (default: twentytwentyfour)
      --live-plugins    Augment plugin choices via the WordPress.org plugins API
      --geocode         Geocode addresses missing coordinates via OSM Nominatim (adds a map)
      --geocode-email <e>  Contact string for Nominatim's User-Agent
      --base-url <url>  Host URL for sitemap.xml / robots.txt / canonical + OG URLs
      --brand <name>    Brand suffix appended to page <title>s
      --ga-id <id>      Inject Google Analytics 4 (gtag.js) with a view_item event
      --plausible <domain>  Inject the Plausible analytics snippet
      --quotes          Generate a price quote (lead → quote) per site-less business
      --include-weak    Also build redesigns for weak/outdated existing sites (needs --verify-live)
  -h, --help            Show this help

Output:
  <out>/index.html          Browsable directory of every business + outcome
  <out>/index.json          Machine-readable listing
  <out>/sites/<slug>/       WordPress deploy bundle (provision.sh, content.wxr.xml, theme/, composer.json)
  <out>/sites/<slug>.html   Static site (target static/both)
  <out>/videos/*.html       Hyperframes promo compositions (render: npx hyperframes render <file>)

Example (Israel market, Hebrew WordPress sites + videos):
  biz-site-builder build \\
    --source overpass:area="Tel Aviv",limit=150 \\
    --source csv:./reviews.csv \\
    --market israel --target wordpress --video --out ./directory
`;

function auditLocale(args: ParsedArgs): LocaleCode {
  if (args.locale) return args.locale;
  if (args.market && ["israel", "il", "he", "hebrew"].includes(args.market.toLowerCase()))
    return "he";
  return "en";
}

/** `audit --url <url>`: fetch a live site and write a branded audit report. */
async function runAudit(args: ParsedArgs): Promise<void> {
  if (!args.url) {
    process.stderr.write("Error: audit needs --url <url>.\n");
    process.exitCode = 1;
    return;
  }
  const s = stringsFor(auditLocale(args));
  const src = new WebSource({ urls: [args.url] });
  const page = await src.fetchPage(args.url);
  if (!page || page.status >= 400) {
    process.stderr.write(
      `Error: could not fetch ${args.url} (status ${page?.status ?? "unreachable"}).\n`,
    );
    process.exitCode = 1;
    return;
  }
  const report = buildAuditReport({ html: page.html, url: page.finalUrl }, s);
  const out = args.out === ".out" ? "audit.html" : args.out;
  await writeFile(out, auditReportHtml(report, { s, brand: args.brand }), "utf8");
  process.stdout.write(
    `✓ ${out} — score ${report.score}/100, ${report.findings.length} issue(s)${report.platform ? `, ${report.platform}` : ""}. Est. ${report.estimate.currency}${report.estimate.min}–${report.estimate.currency}${report.estimate.max}.\n`,
  );

  // Optional competitor comparison — a "loss prevention" close for warm leads.
  if (args.competitor) {
    const compPage = await src.fetchPage(args.competitor);
    if (!compPage || compPage.status >= 400) {
      process.stderr.write(
        `Warning: could not fetch competitor ${args.competitor} (status ${compPage?.status ?? "unreachable"}); skipping comparison.\n`,
      );
      return;
    }
    const compReport = buildAuditReport({ html: compPage.html, url: compPage.finalUrl }, s);
    const cmpOut = out.replace(/\.html?$/i, "") + ".compare.html";
    await writeFile(cmpOut, comparisonHtml(report, compReport, { s, brand: args.brand }), "utf8");
    process.stdout.write(
      `✓ ${cmpOut} — ${report.businessName} ${report.score} vs ${compReport.businessName} ${compReport.score}.\n`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.command === "help") {
    process.stdout.write(HELP);
    return;
  }
  if (args.command === "audit") {
    await runAudit(args);
    return;
  }
  if (args.command !== "build") {
    process.stderr.write(`Unknown command "${args.command}".\n\n${HELP}`);
    process.exitCode = 1;
    return;
  }
  if (args.sources.length === 0) {
    process.stderr.write("Error: at least one --source is required.\n\n" + HELP);
    process.exitCode = 1;
    return;
  }

  let sources;
  try {
    sources = args.sources.map(createSource);
  } catch (err) {
    process.stderr.write(`Error: ${(err as Error).message}\n`);
    process.exitCode = 1;
    return;
  }

  try {
    const result = await build({
      sources,
      outDir: args.out,
      target: args.target,
      video: args.video,
      verifyLive: args.verifyLive,
      limit: args.limit,
      concurrency: args.concurrency,
      budget: args.budget,
      resume: args.resume,
      locale: args.locale,
      market: args.market,
      wpBaseTheme: args.wpTheme,
      livePlugins: args.livePlugins,
      geocode: args.geocode,
      geocodeEmail: args.geocodeEmail,
      baseUrl: args.baseUrl,
      brand: args.brand,
      analytics:
        args.gaId || args.plausible ? { ga4: args.gaId, plausible: args.plausible } : undefined,
      quotes: args.quotes,
      includeWeak: args.includeWeak,
      log: (msg) => process.stdout.write(msg + "\n"),
    });
    const locales = Object.entries(result.localesUsed)
      .map(([k, v]) => `${v} ${k}`)
      .join(", ");
    process.stdout.write(
      `\n✓ ${result.outDir}/index.html — ${result.total} listed, ${result.wordpressBuilt} WordPress, ${result.staticBuilt} static, ${result.videosBuilt} videos (${locales}).\n`,
    );
  } catch (err) {
    process.stderr.write(`Build failed: ${(err as Error).message}\n`);
    process.exitCode = 1;
  }
}

main();
