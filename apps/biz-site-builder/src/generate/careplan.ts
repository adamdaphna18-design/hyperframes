import type { Business } from "../types.ts";
import type { Strings } from "../i18n/strings.ts";
import { stringsFor } from "../i18n/strings.ts";
import { esc } from "./util.ts";
import { getIndustryProfile } from "./industry.ts";

/**
 * A **recurring care-plan** proposal — the retention artifact. A one-time site
 * build is a one-time fee; a care plan turns the client into monthly recurring
 * revenue (hosting/updates/security + SEO + content + AI), which is what makes
 * customer acquisition pay back (higher LTV → the CAC is affordable). Three tiers,
 * deterministic, EN + Hebrew, rendered as a self-contained proposal the agency
 * sends. No personal data, no lookups — just the offer.
 */

export interface CarePlanTier {
  key: "care" | "grow" | "scale";
  name: string;
  monthly: number;
  currency: string;
  tagline: string;
  includes: string[];
  featured?: boolean;
}

const TIERS: Array<{
  key: CarePlanTier["key"];
  monthly: number;
  featured?: boolean;
  en: { name: string; tagline: string; includes: string[] };
  he: { name: string; tagline: string; includes: string[] };
}> = [
  {
    key: "care",
    monthly: 149,
    en: {
      name: "Care",
      tagline: "Keep it online, fast and secure.",
      includes: [
        "Managed hosting monitoring & uptime checks",
        "Weekly backups",
        "WordPress core & plugin updates",
        "Security hardening & SSL renewal",
        "Up to 30 min of content edits / month",
      ],
    },
    he: {
      name: "בסיס",
      tagline: "שהאתר יישאר מקוון, מהיר ומאובטח.",
      includes: [
        "ניטור אחסון ובדיקות זמינות",
        "גיבויים שבועיים",
        "עדכוני וורדפרס ותוספים",
        "אבטחה וחידוש SSL",
        "עד 30 דק׳ עריכות תוכן בחודש",
      ],
    },
  },
  {
    key: "grow",
    monthly: 399,
    featured: true,
    en: {
      name: "Grow",
      tagline: "Stay found and fresh — win repeat customers.",
      includes: [
        "Everything in Care",
        "Monthly SEO health report",
        "1 fresh blog post / month (your keywords)",
        "Google reviews monitoring & prompts",
        "Up to 2 hours of edits / month",
      ],
    },
    he: {
      name: "צמיחה",
      tagline: "להישאר נמצאים ורעננים — ולהחזיר לקוחות.",
      includes: [
        "כל מה שבחבילת בסיס",
        "דוח SEO חודשי",
        "פוסט בלוג חדש בחודש (מילות המפתח שלכם)",
        "ניטור ותזכורות לביקורות בגוגל",
        "עד שעתיים עריכות בחודש",
      ],
    },
  },
  {
    key: "scale",
    monthly: 899,
    en: {
      name: "Scale",
      tagline: "Put the funnel on autopilot.",
      includes: [
        "Everything in Grow",
        "AI receptionist (24/7 WhatsApp & calls)",
        "4 blog posts / month",
        "Monthly strategy call",
        "Priority support",
      ],
    },
    he: {
      name: "האצה",
      tagline: "המשפך על טייס אוטומטי.",
      includes: [
        "כל מה שבחבילת צמיחה",
        "פקיד קבלה AI (וואטסאפ ושיחות 24/7)",
        "4 פוסטים בחודש",
        "שיחת אסטרטגיה חודשית",
        "תמיכה מועדפת",
      ],
    },
  },
];

export function carePlanFor(business: Business, s: Strings = stringsFor("en")): CarePlanTier[] {
  const he = s.code === "he";
  return TIERS.map((t) => {
    const c = he ? t.he : t.en;
    return {
      key: t.key,
      name: c.name,
      monthly: t.monthly,
      currency: "₪",
      tagline: c.tagline,
      includes: c.includes,
      featured: t.featured,
    };
  });
}

/** Render the care-plan proposal as a self-contained, localized (RTL) document. */
export function carePlanHtml(
  business: Business,
  s: Strings = stringsFor("en"),
  opts: { brand?: string; accent?: string } = {},
): string {
  const he = s.code === "he";
  const t = (en: string, hebrew: string) => (he ? hebrew : en);
  const accent = opts.accent && /^#[0-9a-f]{3,8}$/i.test(opts.accent) ? opts.accent : "#4f46e5";
  const tiers = carePlanFor(business, s);
  const profile = getIndustryProfile(business, s);
  const money = (n: number) => `₪${n.toLocaleString("en-US")}`;

  const cards = tiers
    .map(
      (tier) => `<div class="tier${tier.featured ? " featured" : ""}">
        ${tier.featured ? `<div class="ribbon">${t("Most popular", "הכי פופולרי")}</div>` : ""}
        <h3>${esc(tier.name)}</h3>
        <div class="price">${esc(money(tier.monthly))}<span>${t("/mo", "/חודש")}</span></div>
        <p class="tag">${esc(tier.tagline)}</p>
        <ul>${tier.includes.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
        <a class="btn" href="#start">${t("Choose", "בחירה")}</a>
      </div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="${s.lang}" dir="${s.dir}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${t("Care plan", "תוכנית טיפוח")} — ${esc(business.name)}</title>
    <style>
      :root { --accent: ${accent}; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif; color: #1f2430; line-height: 1.55; background: #f7f8fc; }
      .wrap { max-width: 1000px; margin: 0 auto; padding: 40px 24px 64px; }
      .head { text-align: center; margin-bottom: 8px; }
      .head h1 { font-size: 30px; }
      .head p { color: #5b6270; margin-top: 8px; font-size: 17px; }
      .why { max-width: 640px; margin: 18px auto 30px; text-align: center; color: #3a3f4b; background: #fff; border: 1px solid #e6e8f0; border-radius: 12px; padding: 16px 18px; }
      .tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; align-items: start; }
      .tier { position: relative; background: #fff; border: 1px solid #e6e8f0; border-radius: 16px; padding: 24px; }
      .tier.featured { border-color: var(--accent); box-shadow: 0 10px 30px rgba(79,70,229,.12); }
      .ribbon { position: absolute; top: -12px; inset-inline-end: 18px; background: var(--accent); color: #fff; font-size: 12px; font-weight: 700; padding: 4px 12px; border-radius: 999px; }
      .tier h3 { font-size: 20px; }
      .price { font-size: 34px; font-weight: 800; color: var(--accent); margin: 8px 0 2px; }
      .price span { font-size: 15px; color: #5b6270; font-weight: 600; }
      .tag { color: #5b6270; min-height: 42px; }
      .tier ul { list-style: none; margin: 14px 0; display: grid; gap: 8px; }
      .tier li { padding-inline-start: 22px; position: relative; }
      .tier li::before { content: "✓"; position: absolute; inset-inline-start: 0; color: var(--accent); font-weight: 800; }
      .btn { display: block; text-align: center; margin-top: 8px; background: var(--accent); color: #fff; text-decoration: none; padding: 12px; border-radius: 999px; font-weight: 700; }
      footer { text-align: center; color: #5b6270; font-size: 13px; margin-top: 30px; }
      @media (max-width: 720px) { .tiers { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="head">
        <h1>${t("Care plan", "תוכנית טיפוח")} — ${esc(business.name)}</h1>
        <p>${t("Keep your site fast, found and fresh — every month.", "שהאתר יישאר מהיר, נמצא ורענן — כל חודש.")}</p>
      </div>
      <div class="why">${esc(profile.closingPitch)}</div>
      <div class="tiers">${cards}</div>
      <footer id="start">${t("Cancel anytime · First month 30-day guarantee.", "ביטול בכל עת · חודש ראשון בהתחייבות 30 יום.")}${opts.brand ? ` · ${esc(opts.brand)}` : ""}</footer>
    </div>
  </body>
</html>
`;
}
