#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createSource } from "./sources/index.ts";
import { WebSource } from "./sources/web.ts";
import { csvToRecords } from "./sources/csv.ts";
import { normalizeRecord } from "./sources/normalize.ts";
import { build, type OutputTarget } from "./pipeline.ts";
import { buildAuditReport, auditReportHtml, comparisonHtml } from "./generate/audit.ts";
import { recommendAiServices } from "./generate/opportunities.ts";
import { estimateRoi } from "./generate/roi.ts";
import { generateAgencyPage } from "./generate/agency.ts";
import { carePlanHtml } from "./generate/careplan.ts";
import { localSeoHtml } from "./generate/localseo.ts";
import { scrapeBusiness } from "./sources/web.ts";
import { outputSlug } from "./generate/util.ts";
import type { Business } from "./types.ts";
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
  blog: boolean;
  url?: string;
  competitor?: string;
  csv?: string;
  category?: string;
  leadsPerMonth?: number;
  dealSize?: number;
  chatWidget?: string;
  chatEmbedId?: string;
  tagline?: string;
  email?: string;
  phone?: string;
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
    blog: false,
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
      case "--blog":
        args.blog = true;
        break;
      case "--url":
        if (argv[++i]) args.url = argv[i];
        break;
      case "--competitor":
        if (argv[++i]) args.competitor = argv[i];
        break;
      case "--csv":
        if (argv[++i]) args.csv = argv[i];
        break;
      case "--category":
        if (argv[++i]) args.category = argv[i];
        break;
      case "--leads-per-month":
        args.leadsPerMonth = Number(argv[++i]) || undefined;
        break;
      case "--deal-size":
        args.dealSize = Number(argv[++i]) || undefined;
        break;
      case "--chat-widget":
        if (argv[++i]) args.chatWidget = argv[i];
        break;
      case "--chat-embed-id":
        if (argv[++i]) args.chatEmbedId = argv[i];
        break;
      case "--tagline":
        if (argv[++i]) args.tagline = argv[i];
        break;
      case "--email":
        if (argv[++i]) args.email = argv[i];
        break;
      case "--phone":
        if (argv[++i]) args.phone = argv[i];
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
  biz-site-builder audit --url <url> [--competitor <url>] [--category X] [--leads-per-month N]
       Scan a live business site and write a branded audit report (issues → services
       we sell → industry must-haves → estimate → AI-workforce upsell → optional ROI → CTA).
       --category tailors the pitch to the trade; --leads-per-month adds a ROI panel
       (operator-supplied — no invented traffic). --competitor adds a "you vs. them" table.
  biz-site-builder audit --csv <file> [--out dir] [--locale he] [--brand X]
       Batch-audit every business in a CSV (website column required; optional
       "competitor" column). Writes one report per row + a roll-up index
       (worst score / hottest lead first).
  biz-site-builder agency --brand "Your Studio" [--tagline X] [--email X] [--phone X] [--out agency.html]
       Write your agency's own public landing page (services + 50%-off launch
       offer + payment options), localized (--market israel / --locale he).
  biz-site-builder careplan --brand "Client" [--category X] [--out careplan.html]
       Write a recurring care-plan proposal (Care/Grow/Scale tiers) — the retention
       artifact that turns a one-time build into monthly revenue (higher LTV → CAC pays back).
  biz-site-builder localseo --url <url> [--category X] [--out roadmap.html] [--brand X]
       Cross-reference a site's signals (on-page SEO, schema, NAP, reviews, tech) into a
       prioritized Local SEO roadmap — quick wins first, then by impact × effort. No guessing.

Sources (repeatable, merged in order — later sources enrich earlier ones):
  csv:./businesses.csv              Ingest a CSV export
  json:./businesses.json            Ingest a JSON array (or {businesses|results|elements:[...]})
  overpass:area=Brooklyn            Scrape OpenStreetMap businesses in a named area (free, no key)
  overpass:bbox=40.6,-74.0,40.7,-73.9   ...or within a bounding box (south,west,north,east)
  web:https://a.com,https://b.com   Ladder-style server-side scrape (JSON-LD/OG) → business profile
  web:https://a.com;ua=googlebot    ...with a crawler user-agent to slip past soft paywalls
  registry:q=מאפייה,limit=200       Israeli Registrar of Companies (רשם החברות) via data.gov.il
  registry:active=false             ...include struck-off companies (default: active only)
  registry:file=./companies.json    ...replay a saved CKAN response offline (no network)
  datagovil:resource=<id>,q=<text>  Any other data.gov.il CKAN resource by id

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
      --blog            Generate a per-trade SEO blog (WordPress posts in the WXR; static pages for --target static)
      --chat-widget <src>   Embed an AI chat widget (embed script URL) into every built site
      --chat-embed-id <id>  Agent/embed id for the chat widget (data-embed-id)
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

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Compute a ROI estimate only when the operator supplied a lead volume — no
 * `--leads-per-month`, no number. Prices it against the recommended AI bundle.
 */
function roiFor(
  report: ReturnType<typeof buildAuditReport>,
  args: ParsedArgs,
  s: ReturnType<typeof stringsFor>,
) {
  if (!args.leadsPerMonth) return undefined;
  const opp = recommendAiServices(report, s);
  const monthlyPackagePrice = opp.bundleMonthly || 299;
  return estimateRoi(
    report.industry,
    { leadsPerMonth: args.leadsPerMonth, monthlyPackagePrice, dealSize: args.dealSize },
    s,
  );
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
  const business: Business | undefined = args.category
    ? { id: args.url, name: hostname(args.url), category: args.category, images: [], reviews: [] }
    : undefined;
  const report = buildAuditReport({ html: page.html, url: page.finalUrl, business }, s);
  const roi = roiFor(report, args, s);
  const out = args.out === ".out" ? "audit.html" : args.out;
  await writeFile(out, auditReportHtml(report, { s, brand: args.brand, roi }), "utf8");
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

/** Read a competitor URL from a loose CSV record (English + Hebrew column names). */
function competitorOf(rec: Record<string, unknown>): string | undefined {
  for (const [k, v] of Object.entries(rec)) {
    if (/^(competitor|rival|מתחרה)$/i.test(k.trim()) && typeof v === "string" && v.trim())
      return v.trim();
  }
  return undefined;
}

interface BatchRow {
  name: string;
  url: string;
  score: number;
  platform?: string;
  estimate: { kind: string; min: number; max: number; currency: string };
  services: string[];
  reportPath: string;
}

/** `audit --csv <file>`: audit every business in a CSV, with a roll-up index. */
async function runBatchAudit(args: ParsedArgs): Promise<void> {
  const s = stringsFor(auditLocale(args));
  let text: string;
  try {
    text = await readFile(args.csv!, "utf8");
  } catch (err) {
    process.stderr.write(`Error: could not read ${args.csv} (${(err as Error).message}).\n`);
    process.exitCode = 1;
    return;
  }
  const records = csvToRecords(text);
  const outDir = args.out === ".out" ? "audit-batch" : args.out;
  await mkdir(`${outDir}/reports`, { recursive: true });

  // Pre-collect the businesses so WebSource has a non-empty URL list to seed with.
  const jobs = records
    .map((rec, i) => ({ rec, i, business: normalizeRecord(rec, `csv:${args.csv}`, i) }))
    .filter((j) => Boolean(j.business.website?.trim()));
  if (jobs.length === 0) {
    process.stderr.write("Error: no rows in the CSV have a website column.\n");
    process.exitCode = 1;
    return;
  }

  const src = new WebSource({ urls: jobs.map((j) => j.business.website!.trim()) });
  const rows: BatchRow[] = [];
  let scanned = 0;
  for (const { rec, business } of jobs) {
    const url = business.website!.trim();
    const page = await src.fetchPage(url);
    if (!page || page.status >= 400) {
      process.stderr.write(
        `Skipping ${business.name} — could not fetch ${url} (status ${page?.status ?? "unreachable"}).\n`,
      );
      continue;
    }
    const report = buildAuditReport({ html: page.html, url: page.finalUrl, business }, s);
    const slug = outputSlug(business);
    const reportPath = `reports/${slug}.html`;
    await writeFile(
      `${outDir}/${reportPath}`,
      auditReportHtml(report, { s, brand: args.brand }),
      "utf8",
    );

    // Optional per-row competitor comparison.
    const compUrl = competitorOf(rec);
    if (compUrl) {
      const compPage = await src.fetchPage(compUrl);
      if (compPage && compPage.status < 400) {
        const compReport = buildAuditReport({ html: compPage.html, url: compPage.finalUrl }, s);
        await writeFile(
          `${outDir}/reports/${slug}.compare.html`,
          comparisonHtml(report, compReport, { s, brand: args.brand }),
          "utf8",
        );
      }
    }

    rows.push({
      name: report.businessName,
      url: report.url,
      score: report.score,
      platform: report.platform,
      estimate: report.estimate,
      services: report.services,
      reportPath,
    });
    scanned++;
  }

  rows.sort((a, b) => a.score - b.score); // worst (hottest lead) first
  await writeFile(`${outDir}/index.json`, JSON.stringify({ businesses: rows }, null, 2), "utf8");
  await writeFile(`${outDir}/index.html`, batchIndexHtml(rows, s), "utf8");
  process.stdout.write(
    `\n✓ ${outDir}/index.html — audited ${scanned}/${jobs.length} businesses (worst score first).\n`,
  );
}

/** A minimal, localized roll-up directory of the batch audit. */
function batchIndexHtml(rows: BatchRow[], s: import("./i18n/strings.ts").Strings): string {
  const he = s.code === "he";
  const t = (en: string, hebrew: string) => (he ? hebrew : en);
  const esc = (x: string) => x.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const body = rows
    .map((r) => {
      const color = r.score >= 80 ? "#16a34a" : r.score >= 55 ? "#d97706" : "#dc2626";
      return `<tr>
        <td><a href="${esc(r.reportPath)}">${esc(r.name)}</a><div class="u">${esc(r.url)}</div></td>
        <td style="color:${color};font-weight:800">${r.score}</td>
        <td>${r.platform ? esc(r.platform) : "—"}</td>
        <td>${esc(r.estimate.currency)}${r.estimate.min}–${esc(r.estimate.currency)}${r.estimate.max}</td>
      </tr>`;
    })
    .join("");
  return `<!doctype html>
<html lang="${s.lang}" dir="${s.dir}">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${t("Batch audit", "סריקה קבוצתית")}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 24px; color: #1f2430; }
    h1 { font-size: 22px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    td, th { text-align: start; padding: 12px; border-bottom: 1px solid #eceef4; }
    .u { color: #5b6270; font-size: 13px; word-break: break-all; }
    a { color: #4f46e5; text-decoration: none; font-weight: 700; }
  </style></head>
  <body>
    <h1>${t("Batch audit — worst score first", "סריקה קבוצתית — הציון הנמוך קודם")}</h1>
    <table>
      <thead><tr><th>${t("Business", "עסק")}</th><th>${t("Score", "ציון")}</th><th>${t("Platform", "פלטפורמה")}</th><th>${t("Estimate", "הערכה")}</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
  </body>
</html>
`;
}

/** `agency`: write the agency's own public landing page (services + 50%-off + payment options). */
async function runAgency(args: ParsedArgs): Promise<void> {
  const s = stringsFor(auditLocale(args));
  const name = args.brand ?? "Your Web Studio";
  const html = generateAgencyPage(
    { name, tagline: args.tagline, email: args.email, phone: args.phone, url: args.baseUrl },
    s,
  );
  const out = args.out === ".out" ? "agency.html" : args.out;
  await writeFile(out, html, "utf8");
  process.stdout.write(`✓ ${out} — agency landing page for "${name}" (${s.code}).\n`);
}

/** `localseo --url <url>`: cross-reference signals into a prioritized Local SEO roadmap. */
async function runLocalSeo(args: ParsedArgs): Promise<void> {
  const s = stringsFor(auditLocale(args));
  if (!args.url) {
    process.stderr.write("Error: localseo needs --url <url>.\n");
    process.exitCode = 1;
    return;
  }
  const src = new WebSource({ urls: [args.url] });
  const page = await src.fetchPage(args.url);
  if (!page || page.status >= 400) {
    process.stderr.write(
      `Error: could not fetch ${args.url} (status ${page?.status ?? "unreachable"}).\n`,
    );
    process.exitCode = 1;
    return;
  }
  const business = scrapeBusiness(page);
  if (args.category) business.category = args.category;
  const out = args.out === ".out" ? "localseo.html" : args.out;
  await writeFile(
    out,
    localSeoHtml({ business, html: page.html, url: page.finalUrl }, s, { brand: args.brand }),
    "utf8",
  );
  process.stdout.write(`✓ ${out} — Local SEO roadmap for ${business.name} (${s.code}).\n`);
}

/** `careplan`: write a recurring care-plan proposal (the retention artifact). */
async function runCarePlan(args: ParsedArgs): Promise<void> {
  const s = stringsFor(auditLocale(args));
  const business: Business = {
    id: args.brand ?? "client",
    name: args.brand ?? (s.code === "he" ? "העסק שלכם" : "Your business"),
    category: args.category,
    images: [],
    reviews: [],
  };
  const out = args.out === ".out" ? "careplan.html" : args.out;
  await writeFile(out, carePlanHtml(business, s, { brand: args.brand }), "utf8");
  process.stdout.write(`✓ ${out} — retention care plan (${s.code}).\n`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.command === "help") {
    process.stdout.write(HELP);
    return;
  }
  if (args.command === "audit") {
    if (args.csv) await runBatchAudit(args);
    else await runAudit(args);
    return;
  }
  if (args.command === "agency" || args.command === "landing") {
    await runAgency(args);
    return;
  }
  if (args.command === "careplan" || args.command === "retention") {
    await runCarePlan(args);
    return;
  }
  if (args.command === "localseo" || args.command === "roadmap") {
    await runLocalSeo(args);
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
      chatWidget: args.chatWidget ? { src: args.chatWidget, embedId: args.chatEmbedId } : undefined,
      quotes: args.quotes,
      includeWeak: args.includeWeak,
      blog: args.blog,
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
