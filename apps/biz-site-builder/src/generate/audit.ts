import type { Business } from "../types.ts";
import type { Strings } from "../i18n/strings.ts";
import { stringsFor } from "../i18n/strings.ts";
import { esc } from "./util.ts";
import { auditSeo } from "../verify/seo.ts";
import { detectTechStack } from "../website/techstack.ts";
import { generateQuote } from "./quote.ts";
import { painPointFor } from "./painpoints.ts";
import { recommendAiServices } from "./opportunities.ts";

/**
 * Customer-facing **website audit** — the lead-magnet inverse of the site
 * builder. Point it at a business that ALREADY has a site, and it composes the
 * existing deterministic analyzers (SEO audit + tech-stack detection + a few
 * heuristics) into a branded report where every finding maps to a **service we
 * sell** (SEO, social, security, redesign, maintenance), plus an estimate and a
 * call to action. The goal is to turn the scanned business into a customer and
 * cut acquisition cost. No browser, no LLM — deterministic.
 */

export type AuditArea =
  | "seo"
  | "social"
  | "accessibility"
  | "mobile"
  | "security"
  | "performance"
  | "tech";
export type Severity = "high" | "medium" | "low";

export interface AuditFinding {
  area: AuditArea;
  severity: Severity;
  title: string;
  fix: string;
  /** The service we'd sell to fix it. */
  service: string;
}

export interface AuditReport {
  url: string;
  businessName: string;
  platform?: string;
  weakBuilder: boolean;
  outdated: boolean;
  outdatedSignals: string[];
  findings: AuditFinding[];
  /** 0–100 health score. */
  score: number;
  /** Distinct services recommended, most relevant first. */
  services: string[];
  estimate: { kind: "redesign" | "optimize"; min: number; max: number; currency: string };
  /** Industry-specific cost-of-inaction line. */
  painPoint: string;
}

export interface AuditInput {
  html: string;
  headers?: Headers | Record<string, string>;
  url: string;
  /** Known profile (name/category) if available — improves the estimate. */
  business?: Business;
}

const SEVERITY_PENALTY: Record<Severity, number> = { high: 15, medium: 8, low: 3 };

const SERVICE: Record<AuditArea, { en: string; he: string }> = {
  seo: { en: "SEO", he: "קידום אתרים (SEO)" },
  social: { en: "Social media setup", he: "הקמת נוכחות ברשתות" },
  accessibility: { en: "Accessibility", he: "נגישות" },
  mobile: { en: "Mobile optimization", he: "התאמה למובייל" },
  security: { en: "Security & HTTPS", he: "אבטחה ו-HTTPS" },
  performance: { en: "Performance", he: "שיפור ביצועים" },
  tech: { en: "Website redesign", he: "בניית אתר מחדש" },
};

export function buildAuditReport(input: AuditInput, s: Strings = stringsFor("en")): AuditReport {
  const he = s.code === "he";
  const t = (en: string, hebrew: string) => (he ? hebrew : en);
  const { html, headers, url } = input;
  const tech = detectTechStack(html, headers);
  const seo = auditSeo(html, { expectCanonical: false });
  const findings: AuditFinding[] = [];

  const add = (area: AuditArea, severity: Severity, title: string, fix: string) =>
    findings.push({
      area,
      severity,
      title,
      fix,
      service: he ? SERVICE[area].he : SERVICE[area].en,
    });

  // ── SEO (from the deterministic on-page audit) ──
  const has = (needle: string) => seo.errors.concat(seo.warnings).some((x) => x.includes(needle));
  if (has("missing <title>"))
    add(
      "seo",
      "high",
      t("No page title", "אין כותרת עמוד"),
      t("Add a keyword-rich <title>.", "הוספת כותרת עשירה במילות מפתח."),
    );
  if (has("missing meta description"))
    add(
      "seo",
      "high",
      t("No meta description", "אין תיאור מטא"),
      t("Add a compelling meta description.", "הוספת תיאור מטא משכנע."),
    );
  if (has("<h1>"))
    add(
      "seo",
      "medium",
      t("Heading structure issue", "בעיה במבנה הכותרות"),
      t("Use exactly one <h1>.", "שימוש בכותרת H1 אחת בלבד."),
    );
  if (has("JSON-LD"))
    add(
      "seo",
      "medium",
      t("No structured data", "אין נתונים מובנים"),
      t(
        "Add schema.org LocalBusiness JSON-LD for rich results.",
        "הוספת נתוני schema.org לתוצאות עשירות.",
      ),
    );
  if (has("without alt"))
    add(
      "accessibility",
      "medium",
      t("Images missing alt text", "תמונות ללא טקסט חלופי"),
      t("Add descriptive alt text to every image.", "הוספת טקסט חלופי לכל תמונה."),
    );

  // ── Social ──
  if (!/property=["']og:image["']/i.test(html))
    add(
      "social",
      "medium",
      t("No social share image", "אין תמונת שיתוף"),
      t("Add Open Graph + Twitter Card tags.", "הוספת תגי Open Graph ו-Twitter."),
    );

  // ── Mobile ──
  if (!/name=["']viewport["']/i.test(html))
    add(
      "mobile",
      "high",
      t("Not mobile-friendly", "לא מותאם למובייל"),
      t("Add a responsive viewport meta tag.", "הוספת תג viewport רספונסיבי."),
    );

  // ── Security ──
  if (/^http:\/\//i.test(url))
    add(
      "security",
      "high",
      t("No HTTPS", "אין HTTPS"),
      t("Install an SSL certificate and force HTTPS.", "התקנת תעודת SSL ומעבר ל-HTTPS."),
    );
  else if (/(?:src|href)=["']http:\/\//i.test(html))
    add(
      "security",
      "medium",
      t("Mixed content (insecure assets)", "תוכן מעורב (משאבים לא מאובטחים)"),
      t("Serve all assets over HTTPS.", "הגשת כל המשאבים דרך HTTPS."),
    );

  // ── Tech / redesign ──
  if (tech.weakBuilder)
    add(
      "tech",
      "medium",
      t(
        `Built on ${tech.platform} (locked-in DIY builder)`,
        `בנוי על ${tech.platform} (פלטפורמה סגורה)`,
      ),
      t("Migrate to a fast, ownable WordPress site.", "מעבר לאתר WordPress מהיר בבעלותכם."),
    );
  if (tech.outdated)
    add(
      "tech",
      "high",
      t(
        `Outdated technology: ${tech.outdatedSignals.join(", ")}`,
        `טכנולוגיה מיושנת: ${tech.outdatedSignals.join(", ")}`,
      ),
      t("Rebuild on a modern, maintained stack.", "בנייה מחדש על טכנולוגיה מודרנית."),
    );

  // ── Performance (lightweight heuristics; honestly labelled) ──
  const scriptCount = (html.match(/<script\b[^>]*\bsrc=/gi) ?? []).length;
  if (scriptCount > 15)
    add(
      "performance",
      "medium",
      t(`Many external scripts (${scriptCount})`, `הרבה סקריפטים חיצוניים (${scriptCount})`),
      t("Reduce and defer third-party scripts.", "צמצום ודחיית סקריפטים של צד שלישי."),
    );
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  if (imgs.filter((i) => !/loading=["']lazy["']/i.test(i)).length > 3)
    add(
      "performance",
      "low",
      t("Images not lazy-loaded", "תמונות ללא טעינה עצלה"),
      t('Add loading="lazy" to below-the-fold images.', "הוספת טעינה עצלה לתמונות."),
    );

  const score = Math.max(
    0,
    100 - findings.reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity], 0),
  );

  // Recommended services, ordered by worst finding first.
  const order: Severity[] = ["high", "medium", "low"];
  const services: string[] = [];
  for (const sev of order) {
    for (const f of findings)
      if (f.severity === sev && !services.includes(f.service)) services.push(f.service);
  }
  const maintenance = t("Ongoing maintenance & updates", "תחזוקה ועדכונים שוטפים");
  if (!services.includes(maintenance)) services.push(maintenance);

  // Estimate: a redesign when the stack is weak/outdated or there are ≥2 high issues,
  // otherwise a fix-and-optimize package.
  const highCount = findings.filter((f) => f.severity === "high").length;
  let estimate: AuditReport["estimate"];
  if (tech.weakBuilder || tech.outdated || highCount >= 2) {
    const q = generateQuote(
      input.business ?? fallbackBusiness(input),
      { hasWebsite: false, reason: "" },
      s,
    );
    estimate = { kind: "redesign", min: q.priceMin, max: q.priceMax, currency: q.currency };
  } else {
    estimate = { kind: "optimize", min: 1500, max: 4500, currency: "₪" };
  }

  return {
    url,
    businessName: input.business?.name ?? hostOf(url),
    platform: tech.platform,
    weakBuilder: tech.weakBuilder,
    outdated: tech.outdated,
    outdatedSignals: tech.outdatedSignals,
    findings,
    score,
    services,
    estimate,
    painPoint: painPointFor(input.business ?? fallbackBusiness(input), s),
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function fallbackBusiness(input: AuditInput): Business {
  return {
    id: hostOf(input.url),
    name: hostOf(input.url),
    website: input.url,
    images: [],
    reviews: [],
  };
}

function price(n: number, currency: string): string {
  return `${currency}${n.toLocaleString("en-US")}`;
}

/** Render the audit as a branded, localized (RTL for Hebrew) HTML report. */
export function auditReportHtml(
  report: AuditReport,
  opts: { s?: Strings; brand?: string } = {},
): string {
  const s = opts.s ?? stringsFor("en");
  const he = s.code === "he";
  const t = (en: string, hebrew: string) => (he ? hebrew : en);
  const scoreColor = report.score >= 80 ? "#16a34a" : report.score >= 55 ? "#d97706" : "#dc2626";
  const sevLabel: Record<Severity, string> = {
    high: t("High", "גבוה"),
    medium: t("Medium", "בינוני"),
    low: t("Low", "נמוך"),
  };
  const rows = report.findings.length
    ? report.findings
        .map(
          (f) => `<tr class="sev-${f.severity}">
        <td><span class="sev">${sevLabel[f.severity]}</span></td>
        <td><strong>${esc(f.title)}</strong><div class="fix">${esc(f.fix)}</div></td>
        <td class="svc">${esc(f.service)}</td>
      </tr>`,
        )
        .join("")
    : `<tr><td colspan="3">${t("No major issues found — nice!", "לא נמצאו בעיות מהותיות — כל הכבוד!")}</td></tr>`;

  return `<!doctype html>
<html lang="${s.lang}" dir="${s.dir}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${t("Website Audit", "בדיקת אתר")} — ${esc(report.businessName)}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif; max-width: 880px; margin: 0 auto; padding: 24px; color: #1f2430; }
      .header { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff; padding: 30px; border-radius: 14px; display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
      .header h1 { font-size: 24px; }
      .header .url { opacity: .85; font-size: 15px; margin-top: 4px; word-break: break-all; }
      .gauge { flex: none; width: 96px; height: 96px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(${scoreColor} calc(${report.score} * 1%), rgba(255,255,255,.25) 0); }
      .gauge b { background: #fff; color: ${scoreColor}; width: 74px; height: 74px; border-radius: 50%; display: grid; place-items: center; font-size: 26px; font-weight: 800; }
      h2 { font-size: 18px; margin: 26px 0 12px; }
      table { width: 100%; border-collapse: collapse; }
      td, th { text-align: start; padding: 12px; border-bottom: 1px solid #eceef4; vertical-align: top; }
      .sev { font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
      .sev-high .sev { background: #fde2e2; color: #b91c1c; }
      .sev-medium .sev { background: #fdeccd; color: #b45309; }
      .sev-low .sev { background: #e6eefb; color: #2563a8; }
      .fix { color: #5b6270; font-size: 14px; margin-top: 4px; }
      .svc { font-weight: 600; color: #4f46e5; }
      .stack { color: #5b6270; font-size: 14px; margin-top: 8px; }
      .cta { margin-top: 26px; background: #f4f5fb; border-radius: 14px; padding: 24px; text-align: center; }
      .cta .pain { background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; font-weight: 600; }
      .cta .est { font-size: 30px; font-weight: 800; color: #4f46e5; }
      .cta .btn { display: inline-block; margin-top: 14px; background: #4f46e5; color: #fff; text-decoration: none; padding: 13px 26px; border-radius: 999px; font-weight: 700; }
      .ai { margin-top: 22px; border: 1px solid #cdefd6; border-radius: 14px; overflow: hidden; }
      .ai .head { background: #16794a; color: #fff; padding: 16px 20px; font-weight: 700; }
      .ai .body { padding: 20px; }
      .ai ul { list-style: none; padding: 0; }
      .ai li { display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid #eceef4; }
      .ai li:last-child { border-bottom: 0; }
      .ai .svc-name { font-weight: 700; }
      .ai .svc-pitch { color: #5b6270; font-size: 14px; margin-top: 2px; }
      .ai .price { white-space: nowrap; font-weight: 800; color: #16794a; }
      .ai .bundle { margin-top: 14px; text-align: center; font-weight: 800; color: #16794a; }
      .ai .note { color: #5b6270; font-size: 12px; margin-top: 8px; text-align: center; }
      footer { text-align: center; color: #5b6270; font-size: 13px; margin-top: 24px; }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <h1>${t("Website Audit", "בדיקת אתר")} — ${esc(report.businessName)}</h1>
        <div class="url">${esc(report.url)}${report.platform ? ` · ${esc(report.platform)}` : ""}</div>
      </div>
      <div class="gauge" aria-label="${report.score}/100"><b>${report.score}</b></div>
    </div>

    <h2>${t("What we found", "מה מצאנו")}</h2>
    <table>
      <thead><tr><th>${t("Severity", "חומרה")}</th><th>${t("Issue & fix", "בעיה ותיקון")}</th><th>${t("Service", "שירות")}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="cta">
      <div class="pain">${esc(report.painPoint)}</div>
      <div>${report.estimate.kind === "redesign" ? t("Recommended: a modern rebuild", "מומלץ: בנייה מחדש מודרנית") : t("Recommended: a fix & optimize package", "מומלץ: חבילת תיקון ואופטימיזציה")}</div>
      <div class="est">${esc(price(report.estimate.min, report.estimate.currency))} – ${esc(price(report.estimate.max, report.estimate.currency))}</div>
      <div class="stack">${t("Services", "שירותים")}: ${report.services.map((x) => esc(x)).join(" · ")}</div>
      <a class="btn" href="#contact">${t("Get started", "בואו נתחיל")}</a>
    </div>
    ${aiWorkforceSection(report, s)}
    <footer>${t("Automated audit — no site changes were made.", "בדיקה אוטומטית — לא בוצעו שינויים באתר.")}${opts.brand ? ` · ${esc(opts.brand)}` : ""}</footer>
  </body>
</html>
`;
}

/**
 * The recurring-revenue "AI Workforce" upsell — recommended services anchored to
 * the audit's findings, rendered as a distinct block below the one-time fix. Empty
 * string when the site is healthy (no findings → no manufactured upsell).
 */
function aiWorkforceSection(report: AuditReport, s: Strings): string {
  const he = s.code === "he";
  const t = (en: string, hebrew: string) => (he ? hebrew : en);
  const opp = recommendAiServices(report, s);
  if (opp.services.length === 0) return "";
  const per = t("/mo", "/חודש");
  const items = opp.services
    .map(
      (svc) => `<li>
        <div><div class="svc-name">${esc(svc.name)}</div><div class="svc-pitch">${esc(svc.pitch)}</div></div>
        <div class="price">${esc(svc.currency)}${svc.monthly}${per}</div>
      </li>`,
    )
    .join("");
  const bundle =
    opp.services.length > 1
      ? `<div class="bundle">${t("Bundle all", "כל השירותים יחד")}: ${esc(opp.currency)}${opp.bundleMonthly}${per} · ${t("save 20%", "חיסכון 20%")}</div>`
      : "";
  return `<div class="ai">
      <div class="head">${t("AI Workforce — works 24/7 (monthly)", "צוות AI — עובד 24/7 (חודשי)")}</div>
      <div class="body">
        <ul>${items}</ul>
        ${bundle}
        <div class="note">${t(
          "Recurring managed services — each addresses an issue found above.",
          "שירותים מנוהלים חודשיים — כל אחד נותן מענה לבעיה שנמצאה למעלה.",
        )}</div>
      </div>
    </div>`;
}

/** A row for the side-by-side comparison: does each site pass this check? */
function dimension(r: AuditReport, area: AuditArea): boolean {
  return !r.findings.some((f) => f.area === area);
}

/**
 * Side-by-side comparison of the prospect's site vs. a competitor's — a FOMO
 * lever ("here's where you're behind"). Deterministic; localized.
 */
export function comparisonHtml(
  subject: AuditReport,
  competitor: AuditReport,
  opts: { s?: Strings; brand?: string } = {},
): string {
  const s = opts.s ?? stringsFor("en");
  const he = s.code === "he";
  const t = (en: string, hebrew: string) => (he ? hebrew : en);
  const dims: Array<{ area: AuditArea; label: string }> = [
    { area: "seo", label: t("SEO basics", "יסודות SEO") },
    { area: "mobile", label: t("Mobile-friendly", "מותאם למובייל") },
    { area: "security", label: t("HTTPS / security", "אבטחה / HTTPS") },
    { area: "social", label: t("Social sharing", "שיתוף חברתי") },
    { area: "accessibility", label: t("Accessibility", "נגישות") },
    { area: "tech", label: t("Modern platform", "פלטפורמה מודרנית") },
  ];
  const yn = (ok: boolean) => (ok ? `<span class="y">✓</span>` : `<span class="n">✗</span>`);
  const behind = dims.filter(
    (d) => !dimension(subject, d.area) && dimension(competitor, d.area),
  ).length;

  const rows = dims
    .map(
      (d) => `<tr>
        <td>${esc(d.label)}</td>
        <td class="c">${yn(dimension(subject, d.area))}</td>
        <td class="c">${yn(dimension(competitor, d.area))}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="${s.lang}" dir="${s.dir}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${t("You vs. your competitor", "אתם מול המתחרה")} — ${esc(subject.businessName)}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif; max-width: 760px; margin: 0 auto; padding: 24px; color: #1f2430; }
      h1 { font-size: 24px; text-align: center; margin-bottom: 6px; }
      .sub { text-align: center; color: #5b6270; margin-bottom: 22px; }
      table { width: 100%; border-collapse: collapse; }
      td, th { padding: 12px; border-bottom: 1px solid #eceef4; text-align: start; }
      th.c, td.c { text-align: center; }
      .scores td { font-size: 22px; font-weight: 800; }
      .y { color: #16a34a; font-weight: 800; }
      .n { color: #dc2626; font-weight: 800; }
      .banner { margin-top: 22px; background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; border-radius: 12px; padding: 18px; text-align: center; font-weight: 700; }
      .cta { text-align:center; margin-top: 18px; }
      .btn { display:inline-block; background:#4f46e5; color:#fff; text-decoration:none; padding:13px 26px; border-radius:999px; font-weight:700; }
    </style>
  </head>
  <body>
    <h1>${t("You vs. your competitor", "אתם מול המתחרה")}</h1>
    <div class="sub">${esc(subject.businessName)} ${t("vs.", "מול")} ${esc(competitor.businessName)}</div>
    <table>
      <thead><tr><th>${t("Check", "בדיקה")}</th><th class="c">${esc(subject.businessName)}</th><th class="c">${esc(competitor.businessName)}</th></tr></thead>
      <tbody>
        <tr class="scores"><td>${t("Overall score", "ציון כולל")}</td><td class="c">${subject.score}</td><td class="c">${competitor.score}</td></tr>
        ${rows}
      </tbody>
    </table>
    <div class="banner">${
      behind > 0
        ? t(
            `Your competitor is ahead on ${behind} of these. Let's close the gap.`,
            `המתחרה שלכם מוביל ב-${behind} מהבדיקות. בואו נסגור את הפער.`,
          )
        : t("You're keeping pace — let's pull ahead.", "אתם מחזיקים קצב — בואו נוביל.")
    }</div>
    <div class="cta"><a class="btn" href="#contact">${t("Get started", "בואו נתחיל")}</a></div>
    ${opts.brand ? `<div class="sub" style="margin-top:16px">${esc(opts.brand)}</div>` : ""}
  </body>
</html>
`;
}
