import type { Strings } from "../i18n/strings.ts";
import { stringsFor } from "../i18n/strings.ts";
import type { AuditArea, AuditReport } from "./audit.ts";

/**
 * AI-service **opportunities** — the recurring-revenue upsell that rides on top of
 * the one-time audit fix. Each recommended service is anchored to a real finding
 * the deterministic audit produced (an SEO gap → a content agent, a social/response
 * gap → a 24/7 receptionist), so the pitch is grounded, not invented. Deterministic:
 * a static rate card + a findings → service lookup, EN + Hebrew. It stops at the
 * *recommendation*; actually provisioning a Twilio/LLM agent is stateful, network-
 * bound work for the separate operational layer.
 */

export interface AiService {
  key: string;
  name: string;
  /** Outcome-oriented pitch, tied to the finding that triggered it. */
  pitch: string;
  /** Recurring monthly price (same currency as the audit estimate). */
  monthly: number;
  currency: string;
}

export interface OpportunitySet {
  services: AiService[];
  /** Bundle price when taking every recommended service (20% off, rounded to ₪10). */
  bundleMonthly: number;
  currency: string;
}

/** Which finding area unlocks which recurring AI service. */
const TRIGGERS: Array<{
  key: string;
  areas: AuditArea[];
  monthly: number;
  en: { name: string; pitch: string };
  he: { name: string; pitch: string };
}> = [
  {
    key: "seo-content",
    areas: ["seo", "tech"],
    monthly: 199,
    en: {
      name: "SEO & Content Agent",
      pitch: "Auto-generates schema, blogs, and meta so you rank while you sleep.",
    },
    he: {
      name: "סוכן תוכן ו-SEO",
      pitch: "מייצר אוטומטית סכמות, מאמרים ותיאורים כדי שתדורגו בזמן שאתם ישנים.",
    },
  },
  {
    key: "receptionist",
    areas: ["social", "mobile"],
    monthly: 299,
    en: {
      name: "AI Receptionist",
      pitch: "Answers WhatsApp & calls 24/7 so you never miss an after-hours inquiry.",
    },
    he: {
      name: "פקיד קבלה AI",
      pitch: "עונה בוואטסאפ ובטלפון 24/7 כדי שלא תפספסו אף פנייה אחרי שעות העבודה.",
    },
  },
  {
    key: "lead-qualifier",
    areas: ["security", "performance", "accessibility"],
    monthly: 249,
    en: {
      name: "Lead Qualifier",
      pitch: "Captures visitors the fixed site brings in, qualifies them, and books meetings.",
    },
    he: {
      name: "מסנן לידים",
      pitch: "לוכד את המבקרים שהאתר המתוקן מביא, מסנן אותם וקובע פגישות.",
    },
  },
];

/**
 * Recommend recurring AI services for an audited business — each anchored to a
 * finding the audit actually surfaced. A healthy site (no findings) returns an
 * empty set: no manufactured upsell.
 */
export function recommendAiServices(
  report: AuditReport,
  s: Strings = stringsFor("en"),
): OpportunitySet {
  const he = s.code === "he";
  const areas = new Set<AuditArea>(report.findings.map((f) => f.area));
  const currency = report.estimate.currency;
  const services: AiService[] = [];
  for (const trigger of TRIGGERS) {
    if (!trigger.areas.some((a) => areas.has(a))) continue;
    const copy = he ? trigger.he : trigger.en;
    services.push({
      key: trigger.key,
      name: copy.name,
      pitch: copy.pitch,
      monthly: trigger.monthly,
      currency,
    });
  }
  const sum = services.reduce((n, x) => n + x.monthly, 0);
  const bundleMonthly = services.length > 1 ? Math.round((sum * 0.8) / 10) * 10 : sum;
  return { services, bundleMonthly, currency };
}
