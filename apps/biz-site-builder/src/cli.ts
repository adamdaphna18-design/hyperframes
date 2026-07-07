#!/usr/bin/env bun
import { createSource } from "./sources/index.ts";
import { build, type OutputTarget } from "./pipeline.ts";
import type { LocaleCode } from "./i18n/strings.ts";

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
      --base-url <url>  Host URL for sitemap.xml / robots.txt (default: https://example.com)
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.command === "help") {
    process.stdout.write(HELP);
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
