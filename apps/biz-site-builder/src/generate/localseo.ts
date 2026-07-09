import type { Business } from "../types.ts";
import type { Strings } from "../i18n/strings.ts";
import { stringsFor } from "../i18n/strings.ts";
import { esc } from "./util.ts";
import { auditSeo } from "../verify/seo.ts";
import { detectTechStack } from "../website/techstack.ts";
import { getIndustryProfile } from "./industry.ts";

/**
 * A **Local SEO roadmap** — the synthesis layer. Instead of running a pile of
 * separate audits (on-page SEO, tech stack, NAP, reviews, schema) and then
 * guessing what to do, it cross-references those signals into one prioritized
 * plan: each factor is scored by **impact × effort**, so the report leads with
 * *quick wins* (high impact, low effort) and orders the rest by priority.
 * Deterministic, EN + Hebrew. It works from the website + business profile;
 * live Google-Business-Profile / GeoGrid rank data needs Google APIs and is out
 * of scope here (no invented rankings).
 */

type Impact = 1 | 2 | 3; // low / medium / high
type Effort = 1 | 2 | 3; // easy / moderate / involved

export interface RoadmapItem {
  key: string;
  area: string;
  title: string;
  action: string;
  impact: Impact;
  effort: Effort;
  done: boolean;
  /** Priority score for undone items (higher = do sooner). */
  priority: number;
  quickWin: boolean;
}

export interface LocalSeoRoadmap {
  score: number;
  platform?: string;
  quickWins: RoadmapItem[];
  roadmap: RoadmapItem[]; // all not-yet-done, priority order
  strengths: RoadmapItem[]; // already in place
  items: RoadmapItem[];
}

export interface LocalSeoInput {
  business: Business;
  /** Live page HTML, if a site exists (enables on-page checks). */
  html?: string;
  /** The site URL (for HTTPS / reachability). */
  url?: string;
  headers?: Headers | Record<string, string>;
}

interface CheckDef {
  key: string;
  area: string;
  impact: Impact;
  effort: Effort;
  en: { title: string; action: string };
  he: { title: string; action: string };
  done: (i: LocalSeoInput) => boolean;
}

const CHECKS: CheckDef[] = [
  {
    key: "website",
    area: "foundation",
    impact: 3,
    effort: 3,
    en: { title: "A real website", action: "Publish a fast, ownable site (WordPress)." },
    he: { title: "אתר אמיתי", action: "פרסמו אתר מהיר בבעלותכם (וורדפרס)." },
    done: (i) => Boolean(i.html) || Boolean(i.business.website),
  },
  {
    key: "https",
    area: "trust",
    impact: 3,
    effort: 1,
    en: { title: "HTTPS / SSL", action: "Install an SSL certificate and force HTTPS." },
    he: { title: "HTTPS / SSL", action: "התקינו תעודת SSL ואכפו HTTPS." },
    done: (i) => (i.url ? /^https:\/\//i.test(i.url) : false),
  },
  {
    key: "mobile",
    area: "on-page",
    impact: 3,
    effort: 1,
    en: { title: "Mobile-friendly", action: "Add a responsive viewport and mobile layout." },
    he: { title: "מותאם למובייל", action: "הוסיפו viewport רספונסיבי ופריסת מובייל." },
    done: (i) => (i.html ? /name=["']viewport["']/i.test(i.html) : false),
  },
  {
    key: "title",
    area: "on-page",
    impact: 3,
    effort: 1,
    en: { title: "Keyword-rich page title", action: "Write a <title> with your service + city." },
    he: { title: "כותרת עשירה במילות מפתח", action: "כתבו <title> עם השירות + העיר." },
    done: (i) => (i.html ? !seoHas(i.html, "missing <title>") : false),
  },
  {
    key: "meta",
    area: "on-page",
    impact: 2,
    effort: 1,
    en: { title: "Meta description", action: "Add a compelling meta description." },
    he: { title: "תיאור מטא", action: "הוסיפו תיאור מטא משכנע." },
    done: (i) => (i.html ? !seoHas(i.html, "missing meta description") : false),
  },
  {
    key: "h1",
    area: "on-page",
    impact: 2,
    effort: 1,
    en: { title: "One clear H1", action: "Use exactly one keyword-focused <h1>." },
    he: { title: "כותרת H1 אחת ברורה", action: "השתמשו ב-H1 אחת ממוקדת מילת מפתח." },
    done: (i) => (i.html ? !seoHas(i.html, "<h1>") : false),
  },
  {
    key: "schema",
    area: "local",
    impact: 3,
    effort: 2,
    en: {
      title: "LocalBusiness schema",
      action: "Add schema.org LocalBusiness JSON-LD (name, address, hours, geo).",
    },
    he: {
      title: "נתוני LocalBusiness",
      action: "הוסיפו JSON-LD של schema.org LocalBusiness (שם, כתובת, שעות, מיקום).",
    },
    done: (i) => (i.html ? /localbusiness/i.test(i.html) : false),
  },
  {
    key: "nap",
    area: "local",
    impact: 3,
    effort: 1,
    en: {
      title: "Consistent NAP",
      action: "Show name, address & phone identically everywhere.",
    },
    he: {
      title: "NAP עקבי",
      action: "הציגו שם, כתובת וטלפון זהים בכל מקום.",
    },
    done: (i) => Boolean(i.business.name && i.business.address && i.business.phone),
  },
  {
    key: "hours",
    area: "local",
    impact: 2,
    effort: 1,
    en: {
      title: "Opening hours",
      action: "Publish opening hours (and openingHoursSpecification).",
    },
    he: { title: "שעות פתיחה", action: "פרסמו שעות פתיחה (וגם openingHoursSpecification)." },
    done: (i) => Boolean(i.business.hours),
  },
  {
    key: "map",
    area: "local",
    impact: 2,
    effort: 1,
    en: { title: "Map & directions", action: "Embed a map and a one-tap directions link." },
    he: { title: "מפה והוראות הגעה", action: "הטמיעו מפה וקישור ניווט בלחיצה." },
    done: (i) =>
      Boolean(i.business.location) ||
      (i.html ? /google\.com\/maps|openstreetmap/i.test(i.html) : false),
  },
  {
    key: "reviews",
    area: "trust",
    impact: 3,
    effort: 2,
    en: {
      title: "Reviews & ratings",
      action: "Show reviews on-site and prompt happy customers for Google reviews.",
    },
    he: {
      title: "ביקורות ודירוגים",
      action: "הציגו ביקורות באתר ובקשו מלקוחות מרוצים ביקורת בגוגל.",
    },
    done: (i) => i.business.reviews.length > 0 || i.business.rating !== undefined,
  },
  {
    key: "alt",
    area: "on-page",
    impact: 1,
    effort: 1,
    en: { title: "Image alt text", action: "Add descriptive alt text to every image." },
    he: { title: "טקסט חלופי לתמונות", action: "הוסיפו טקסט חלופי לכל תמונה." },
    done: (i) => (i.html ? !seoHas(i.html, "without alt") : true),
  },
];

function seoHas(html: string, needle: string): boolean {
  const r = auditSeo(html, { expectCanonical: false });
  return r.errors.concat(r.warnings).some((x) => x.includes(needle));
}

export function localSeoRoadmap(
  input: LocalSeoInput,
  s: Strings = stringsFor("en"),
): LocalSeoRoadmap {
  const he = s.code === "he";
  const items: RoadmapItem[] = CHECKS.map((c) => {
    const done = c.done(input);
    const copy = he ? c.he : c.en;
    // Priority: impact first, then ease (lower effort sooner).
    const priority = c.impact * 10 - c.effort;
    return {
      key: c.key,
      area: c.area,
      title: copy.title,
      action: copy.action,
      impact: c.impact,
      effort: c.effort,
      done,
      priority,
      quickWin: !done && c.impact === 3 && c.effort === 1,
    };
  });

  const maxScore = items.reduce((n, x) => n + x.impact, 0);
  const gotScore = items.filter((x) => x.done).reduce((n, x) => n + x.impact, 0);
  const score = Math.round((gotScore / maxScore) * 100);

  const undone = items.filter((x) => !x.done).sort((a, b) => b.priority - a.priority);
  return {
    score,
    platform: input.html ? detectTechStack(input.html, input.headers).platform : undefined,
    quickWins: undone.filter((x) => x.quickWin),
    roadmap: undone,
    strengths: items.filter((x) => x.done),
    items,
  };
}

/** Render the roadmap as a branded, localized (RTL) report. */
export function localSeoHtml(
  input: LocalSeoInput,
  s: Strings = stringsFor("en"),
  opts: { brand?: string; accent?: string } = {},
): string {
  const he = s.code === "he";
  const t = (en: string, hebrew: string) => (he ? hebrew : en);
  const accent = opts.accent && /^#[0-9a-f]{3,8}$/i.test(opts.accent) ? opts.accent : "#4f46e5";
  const r = localSeoRoadmap(input, s);
  const profile = getIndustryProfile(input.business, s);
  const scoreColor = r.score >= 80 ? "#16a34a" : r.score >= 55 ? "#d97706" : "#dc2626";
  const impactLabel = (n: Impact) =>
    [t("Low", "נמוך"), t("Medium", "בינוני"), t("High", "גבוה")][n - 1]!;
  const effortLabel = (n: Effort) =>
    [t("Easy", "קל"), t("Moderate", "בינוני"), t("Involved", "מורכב")][n - 1]!;

  const row = (it: RoadmapItem, i: number) => `<tr>
      <td class="n">${i + 1}</td>
      <td><strong>${esc(it.title)}</strong><div class="act">${esc(it.action)}</div></td>
      <td><span class="b imp${it.impact}">${impactLabel(it.impact)}</span></td>
      <td><span class="b eff${it.effort}">${effortLabel(it.effort)}</span></td>
    </tr>`;

  const quickWins = r.quickWins.length
    ? `<h2>⚡ ${t("Quick wins — do these first", "ניצחונות מהירים — התחילו מכאן")}</h2>
       <table><tbody>${r.quickWins.map(row).join("")}</tbody></table>`
    : "";
  const rest = r.roadmap.filter((x) => !x.quickWin);
  const roadmap = rest.length
    ? `<h2>${t("Then, in priority order", "אחר כך, לפי סדר עדיפות")}</h2>
       <table><thead><tr><th>#</th><th>${t("Action", "פעולה")}</th><th>${t("Impact", "השפעה")}</th><th>${t("Effort", "מאמץ")}</th></tr></thead>
       <tbody>${rest.map(row).join("")}</tbody></table>`
    : "";
  const strengths = r.strengths.length
    ? `<h2>${t("Already in place", "כבר קיים")}</h2><ul class="have">${r.strengths.map((x) => `<li>${esc(x.title)}</li>`).join("")}</ul>`
    : "";

  return `<!doctype html>
<html lang="${s.lang}" dir="${s.dir}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${t("Local SEO roadmap", "מפת דרכים ל-SEO מקומי")} — ${esc(input.business.name)}</title>
    <style>
      :root { --accent: ${accent}; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif; color: #1f2430; line-height: 1.55; max-width: 900px; margin: 0 auto; padding: 24px; }
      .header { background: linear-gradient(135deg, var(--accent), #0a0a0f); color: #fff; border-radius: 14px; padding: 28px; display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; }
      .header h1 { font-size: 23px; }
      .gauge { flex: none; width: 92px; height: 92px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(${scoreColor} calc(${r.score}*1%), rgba(255,255,255,.25) 0); }
      .gauge b { background: #fff; color: ${scoreColor}; width: 70px; height: 70px; border-radius: 50%; display: grid; place-items: center; font-size: 24px; font-weight: 800; }
      .lead { color: #3a3f4b; margin: 18px 0; }
      h2 { font-size: 18px; margin: 26px 0 10px; }
      table { width: 100%; border-collapse: collapse; }
      td, th { text-align: start; padding: 11px 10px; border-bottom: 1px solid #eceef4; vertical-align: top; }
      .n { color: #9aa0ad; font-weight: 700; width: 28px; }
      .act { color: #5b6270; font-size: 14px; margin-top: 3px; }
      .b { font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
      .imp3 { background: #fde2e2; color: #b91c1c; } .imp2 { background: #fdeccd; color: #b45309; } .imp1 { background: #e6eefb; color: #2563a8; }
      .eff1 { background: #e7f8ee; color: #15803d; } .eff2 { background: #fdeccd; color: #b45309; } .eff3 { background: #fde2e2; color: #b91c1c; }
      .have { columns: 2; color: #15803d; margin-inline-start: 18px; }
      footer { color: #5b6270; font-size: 13px; margin-top: 26px; text-align: center; }
      @media (max-width: 560px) { .have { columns: 1; } }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <h1>${t("Local SEO roadmap", "מפת דרכים ל-SEO מקומי")} — ${esc(input.business.name)}</h1>
        <div>${r.platform ? esc(r.platform) : t("prioritized by impact × effort", "מדורג לפי השפעה × מאמץ")}</div>
      </div>
      <div class="gauge" aria-label="${r.score}/100"><b>${r.score}</b></div>
    </div>
    <p class="lead">${esc(profile.painPoint)}</p>
    ${quickWins}
    ${roadmap}
    ${strengths}
    <footer>${t("Roadmap from your site + profile — no guessing.", "מפת דרכים מהאתר והפרופיל שלכם — בלי ניחושים.")}${opts.brand ? ` · ${esc(opts.brand)}` : ""}</footer>
  </body>
</html>
`;
}
