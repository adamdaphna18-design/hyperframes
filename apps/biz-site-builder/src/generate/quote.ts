import type { Business } from "../types.ts";
import type { Strings } from "../i18n/strings.ts";
import { stringsFor } from "../i18n/strings.ts";
import { esc, taglineFor } from "./util.ts";
import { scoreLead } from "./lead.ts";
import type { WebsiteStatus } from "../types.ts";

/**
 * Generate a website-build price quote for a scraped business — the "lead → quote"
 * artifact of a local web agency, rendered as a self-contained (localized, RTL for
 * Hebrew) HTML document the agency can send. Deterministic: prices come from a
 * fixed 2026 rate card scaled by the business's review volume; no dates computed
 * at build time (validity is expressed as a duration).
 */

export type SiteType = "landing" | "mini" | "business" | "custom" | "ecommerce" | "portal";

/** 2026 rate card (ILS). */
const PRICING: Record<SiteType, { min: number; max: number }> = {
  landing: { min: 2000, max: 7000 },
  mini: { min: 2500, max: 6000 },
  business: { min: 4000, max: 12000 },
  custom: { min: 12000, max: 25000 },
  ecommerce: { min: 8000, max: 50000 },
  portal: { min: 20000, max: 100000 },
};

/** Category keywords (English + Hebrew) → recommended site type. */
const CATEGORY_TO_TYPE: Array<[RegExp, SiteType]> = [
  [/shop|store|retail|boutique|market|goods|מותג|חנות|בוטיק|קמעונאות/i, "ecommerce"],
  [/gym|fitness|מכון כושר|חדר כושר/i, "custom"],
  [
    /restaurant|cafe|coffee|bar|clinic|dentist|salon|lawyer|accountant|consultant|studio|yoga|מסעדה|קפה|בר|קליניקה|מרפאה|עורך דין|רואה חשבון|יועץ|סטודיו|מספרה/i,
    "business",
  ],
];

export function siteTypeFor(category: string | undefined): SiteType {
  const c = category ?? "";
  for (const [re, type] of CATEGORY_TO_TYPE) if (re.test(c)) return type;
  return "business";
}

const TYPE_NAME: Record<SiteType, { en: string; he: string }> = {
  landing: { en: "Landing page", he: "עמוד נחיתה" },
  mini: { en: "Mini site", he: "מיני אתר" },
  business: { en: "Business website", he: "אתר תדמית עסקי" },
  custom: { en: "Custom website", he: "אתר מותאם אישית" },
  ecommerce: { en: "Online store", he: "חנות וירטואלית" },
  portal: { en: "Portal / system", he: "פורטל / מערכת" },
};

export interface Quote {
  siteType: SiteType;
  siteTypeName: string;
  priceMin: number;
  priceMax: number;
  currency: string;
  timeline: string;
  paymentTerms: string;
  validity: string;
  includes: string[];
  notIncludes: string[];
  leadScore: number;
}

export function generateQuote(
  business: Business,
  status: WebsiteStatus,
  s: Strings = stringsFor("en"),
): Quote {
  const siteType = siteTypeFor(business.category);
  const card = PRICING[siteType];
  const base = (card.min + card.max) / 2;
  // Established businesses (more reviews) carry a bigger budget.
  const reviews = business.reviews.length;
  const factor = reviews > 100 ? 1.2 : reviews < 20 ? 0.9 : 1;
  const round = (n: number) => Math.round(n / 100) * 100; // nearest ₪100
  const he = s.code === "he";

  return {
    siteType,
    siteTypeName: he ? TYPE_NAME[siteType].he : TYPE_NAME[siteType].en,
    priceMin: round(base * 0.8 * factor),
    priceMax: round(base * 1.2 * factor),
    currency: "₪",
    timeline: he ? "2–4 שבועות" : "2–4 weeks",
    paymentTerms: he ? "50% מקדמה, 50% בסיום" : "50% upfront, 50% on completion",
    validity: he ? "בתוקף ל-30 יום" : "Valid for 30 days",
    includes: he
      ? [
          "עיצוב מותאם אישית",
          "מערכת ניהול תוכן (WordPress)",
          "התאמה מלאה למובייל",
          "אופטימיזציה בסיסית למנועי חיפוש (SEO)",
          "טופס יצירת קשר",
          "חיבור לרשתות חברתיות",
          "הדרכת ניהול",
        ]
      : [
          "Custom design",
          "WordPress CMS",
          "Fully mobile-responsive",
          "Basic SEO",
          "Contact form",
          "Social links",
          "Management training",
        ],
    notIncludes: he
      ? ["אחסון ודומיין (עלות שוטפת)", "כתיבת תוכן / צילום מקצועי", "תחזוקה מעבר ל-30 יום"]
      : ["Hosting & domain (ongoing)", "Copywriting / photography", "Maintenance beyond 30 days"],
    leadScore: scoreLead(business, status),
  };
}

function formatPrice(n: number, currency: string): string {
  return `${currency}${n.toLocaleString("en-US")}`;
}

/** Render the quote as a self-contained, localized HTML document. */
export function quoteHtml(business: Business, quote: Quote, s: Strings = stringsFor("en")): string {
  const he = s.code === "he";
  const li = (items: string[]) => items.map((i) => `<li>${esc(i)}</li>`).join("");
  const heading = he ? "הצעת מחיר לבניית אתר" : "Website Build Quote";
  return `<!doctype html>
<html lang="${s.lang}" dir="${s.dir}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(heading)} — ${esc(business.name)}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif; max-width: 820px; margin: 0 auto; padding: 24px; color: #1f2430; }
      .header { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff; padding: 32px; border-radius: 14px; text-align: center; }
      .header h1 { font-size: 26px; }
      .header h2 { font-size: 18px; opacity: .9; margin-top: 6px; font-weight: 500; }
      .price-box { background: #f4f5fb; border-radius: 14px; padding: 24px; margin: 22px 0; text-align: center; }
      .price { font-size: 40px; font-weight: 800; color: #4f46e5; }
      .muted { color: #5b6270; }
      .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .card { border: 1px solid #e6e8f0; border-radius: 12px; padding: 18px; }
      .card.inc { background: #eefbf1; border-color: #cdefd6; }
      .card.exc { background: #fdeeee; border-color: #f4d3d3; }
      h3 { font-size: 16px; margin-bottom: 10px; }
      ul { padding-inline-start: 20px; }
      li { margin: 6px 0; }
      .terms { margin-top: 20px; display: grid; gap: 8px; }
      .terms b { color: #4f46e5; }
      footer { text-align: center; margin-top: 28px; color: #5b6270; font-size: 14px; }
      @media (max-width: 560px) { .cols { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>${esc(heading)}</h1>
      <h2>${esc(business.name)}${business.category ? ` · ${esc(business.category)}` : ""}</h2>
    </div>
    <div class="price-box">
      <div class="muted">${esc(quote.siteTypeName)}</div>
      <div class="price">${esc(formatPrice(quote.priceMin, quote.currency))} – ${esc(formatPrice(quote.priceMax, quote.currency))}</div>
      <div class="muted">${esc(quote.validity)}</div>
    </div>
    <div class="cols">
      <div class="card inc"><h3>${he ? "✓ מה כלול" : "✓ Included"}</h3><ul>${li(quote.includes)}</ul></div>
      <div class="card exc"><h3>${he ? "✗ מה לא כלול" : "✗ Not included"}</h3><ul>${li(quote.notIncludes)}</ul></div>
    </div>
    <div class="terms">
      <div><b>${he ? "לוח זמנים" : "Timeline"}:</b> ${esc(quote.timeline)}</div>
      <div><b>${he ? "תנאי תשלום" : "Payment"}:</b> ${esc(quote.paymentTerms)}</div>
    </div>
    <footer>${esc(taglineFor(business, s))}</footer>
  </body>
</html>
`;
}
