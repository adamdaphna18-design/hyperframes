import type { Strings } from "../i18n/strings.ts";
import { stringsFor } from "../i18n/strings.ts";
import { esc } from "./util.ts";
import { siteBuildMenu } from "./quote.ts";
import { aiServiceMenu } from "./opportunities.ts";

/**
 * The agency's own **public landing page** — a self-contained, localized (RTL for
 * Hebrew), brandable one-pager describing what we sell: a free website audit
 * (the lead magnet), website builds, and the recurring AI-workforce / AI-agent
 * services. Pricing is pulled from the same rate cards the quote/opportunity
 * generators use (one source of truth), so the marketing page never drifts from
 * what we'd actually quote. Deterministic — no external assets, no network.
 */
export interface AgencyInfo {
  /** Agency / brand name. */
  name: string;
  tagline?: string;
  email?: string;
  phone?: string;
  /** Absolute URL where this page is hosted (canonical / OG). */
  url?: string;
  /** Accent colour (hex). */
  accent?: string;
}

export function generateAgencyPage(info: AgencyInfo, s: Strings = stringsFor("en")): string {
  const he = s.code === "he";
  const t = (en: string, hebrew: string) => (he ? hebrew : en);
  const accent = info.accent && /^#[0-9a-f]{3,8}$/i.test(info.accent) ? info.accent : "#4f46e5";
  const money = (n: number, c: string) => `${c}${n.toLocaleString("en-US")}`;

  const builds = siteBuildMenu(s);
  const services = aiServiceMenu(s);
  const half = (n: number) => Math.round((n * 0.5) / 10) * 10;

  const buildCards = builds
    .map(
      (b) => `<div class="card">
        <div class="card-name">${esc(b.name)}</div>
        <div class="card-price"><s>${esc(money(b.from, b.currency))}</s> ${t("from", "החל מ-")} ${esc(money(half(b.from), b.currency))}</div>
      </div>`,
    )
    .join("");

  const serviceRows = services
    .map(
      (svc) => `<tr>
        <td><div class="svc-name">${esc(svc.name)}</div><div class="svc-pitch">${esc(svc.pitch)}</div></td>
        <td class="price"><s>${esc(money(svc.monthly, svc.currency))}</s> ${esc(money(half(svc.monthly), svc.currency))}${t("/mo", "/חודש")}<div class="fine">${t("1st month", "חודש ראשון")}</div></td>
      </tr>`,
    )
    .join("");

  const pays: Array<[string, string]> = [
    [t("50% upfront, 50% on completion", "50% מקדמה, 50% בסיום"), "◑"],
    [t("Up to 3 interest-free installments", "עד 3 תשלומים ללא ריבית"), "▦"],
    [t("Card · bank transfer · Bit / PayBox", "אשראי · העברה בנקאית · ביט / פייבוקס"), "▣"],
  ];
  const payCards = pays
    .map(([label, icon]) => `<div class="pay"><span class="ic">${icon}</span>${esc(label)}</div>`)
    .join("");

  const steps: Array<[string, string]> = [
    [
      t("Free scan", "סריקה חינם"),
      t("We audit your site in 60 seconds.", "אנחנו סורקים את האתר שלכם ב-60 שניות."),
    ],
    [
      t("Leak report", "דוח פערים"),
      t("See exactly where you lose customers.", "רואים בדיוק איפה אתם מאבדים לקוחות."),
    ],
    [
      t("Fix + automate", "תיקון + אוטומציה"),
      t("We rebuild and add a 24/7 AI workforce.", "אנחנו בונים מחדש ומוסיפים צוות AI 24/7."),
    ],
  ];
  const stepCards = steps
    .map(
      ([h, d], i) =>
        `<div class="step"><div class="num">${i + 1}</div><div><b>${esc(h)}</b><div class="muted">${esc(d)}</div></div></div>`,
    )
    .join("");

  const contact = [
    info.phone ? `<a href="tel:${esc(info.phone)}">${esc(info.phone)}</a>` : "",
    info.email ? `<a href="mailto:${esc(info.email)}">${esc(info.email)}</a>` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return `<!doctype html>
<html lang="${s.lang}" dir="${s.dir}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(info.name)} — ${t("Websites & AI for local business", "אתרים ו-AI לעסקים מקומיים")}</title>
    <meta name="description" content="${t("We build websites and install a 24/7 AI workforce for local businesses.", "אנחנו בונים אתרים ומתקינים צוות AI 24/7 לעסקים מקומיים.")}" />
    ${info.url ? `<link rel="canonical" href="${esc(info.url)}" />` : ""}
    <meta property="og:title" content="${esc(info.name)}" />
    <meta property="og:type" content="website" />
    <style>
      :root { --accent: ${accent}; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif; color: #1f2430; line-height: 1.55; }
      .wrap { max-width: 960px; margin: 0 auto; padding: 0 24px; }
      .hero { background: linear-gradient(135deg, var(--accent), #0a0a0f); color: #fff; padding: 72px 0; text-align: center; }
      .hero h1 { font-size: 40px; line-height: 1.1; }
      .hero p { font-size: 19px; opacity: .92; margin-top: 14px; }
      .promo { display: inline-block; background: #ffef99; color: #7a5c00; font-weight: 800; padding: 7px 16px; border-radius: 999px; margin-bottom: 18px; letter-spacing: .3px; }
      .card-price s, .price s { color: #9aa0ad; font-weight: 500; margin-inline-end: 6px; }
      .fine { color: #5b6270; font-size: 12px; font-weight: 500; }
      .pays { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
      .pay { display: flex; align-items: center; gap: 10px; border: 1px solid #e6e8f0; border-radius: 12px; padding: 16px; font-weight: 600; }
      .pay .ic { flex: none; width: 34px; height: 34px; border-radius: 9px; background: #eef1fb; color: var(--accent); display: grid; place-items: center; font-size: 18px; }
      .btn { display: inline-block; margin-top: 26px; background: #fff; color: var(--accent); text-decoration: none; padding: 14px 30px; border-radius: 999px; font-weight: 800; }
      section { padding: 54px 0; }
      h2 { font-size: 26px; margin-bottom: 8px; }
      .lede { color: #5b6270; margin-bottom: 24px; }
      .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
      .step { display: flex; gap: 12px; align-items: flex-start; background: #f4f5fb; border-radius: 12px; padding: 18px; }
      .step .num { flex: none; width: 30px; height: 30px; border-radius: 50%; background: var(--accent); color: #fff; display: grid; place-items: center; font-weight: 800; }
      .muted { color: #5b6270; font-size: 14px; margin-top: 4px; }
      .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
      .card { border: 1px solid #e6e8f0; border-radius: 12px; padding: 18px; }
      .card-name { font-weight: 700; }
      .card-price { color: var(--accent); font-weight: 800; margin-top: 6px; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 14px 12px; border-bottom: 1px solid #eceef4; vertical-align: top; text-align: start; }
      .svc-name { font-weight: 700; }
      .svc-pitch { color: #5b6270; font-size: 14px; margin-top: 2px; }
      .price { white-space: nowrap; font-weight: 800; color: var(--accent); text-align: end; }
      .cta { background: #f4f5fb; text-align: center; border-radius: 16px; padding: 40px 24px; }
      .cta .btn { background: var(--accent); color: #fff; }
      footer { text-align: center; color: #5b6270; font-size: 14px; padding: 30px 0; }
      @media (max-width: 640px) { .steps, .cards, .pays { grid-template-columns: 1fr; } .hero h1 { font-size: 30px; } }
    </style>
  </head>
  <body>
    <header class="hero">
      <div class="wrap">
        <div class="promo">${t("🔥 Launch offer — 50% OFF", "🔥 מבצע השקה — 50% הנחה")}</div>
        <h1>${esc(info.name)}</h1>
        <p>${esc(info.tagline ?? t("Websites + a 24/7 AI workforce for local businesses.", "אתרים + צוות AI 24/7 לעסקים מקומיים."))}</p>
        <a class="btn" href="#contact">${t("Get a free website audit", "לקבלת בדיקת אתר חינם")}</a>
      </div>
    </header>

    <section class="wrap">
      <h2>${t("How it works", "איך זה עובד")}</h2>
      <div class="steps">${stepCards}</div>
    </section>

    <section class="wrap">
      <h2>${t("Website builds", "בניית אתרים")}</h2>
      <p class="lede">${t("A modern, mobile, SEO-ready site — WordPress you own.", "אתר מודרני, מותאם למובייל ומוכן ל-SEO — וורדפרס בבעלותכם.")}</p>
      <div class="cards">${buildCards}</div>
    </section>

    <section class="wrap">
      <h2>${t("AI workforce", "צוות AI")}</h2>
      <p class="lede">${t("Recurring services that work while you sleep.", "שירותים חודשיים שעובדים בזמן שאתם ישנים.")}</p>
      <table><tbody>${serviceRows}</tbody></table>
    </section>

    <section class="wrap">
      <h2>${t("Payment options", "אפשרויות תשלום")}</h2>
      <p class="lede">${t("Flexible terms — pay as you see results.", "תנאים גמישים — משלמים ככל שרואים תוצאות.")}</p>
      <div class="pays">${payCards}</div>
    </section>

    <section class="wrap">
      <div class="cta" id="contact">
        <h2>${t("See what you're losing — free", "גלו כמה אתם מפסידים — בחינם")}</h2>
        <p class="lede">${t("We scan your site and show you exactly where the leaks are.", "אנחנו סורקים את האתר ומראים לכם איפה בדיוק הפערים.")}</p>
        ${contact ? `<p>${contact}</p>` : ""}
        <a class="btn" href="${info.email ? `mailto:${esc(info.email)}` : "#"}">${t("Book my free audit", "לקביעת בדיקה חינם")}</a>
      </div>
    </section>

    <footer>© ${esc(info.name)}</footer>
  </body>
</html>
`;
}
