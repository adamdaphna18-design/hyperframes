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
 * The flagship tier: an autonomous **AI Agent** that runs the business's
 * recurring workflows end to end (answer → qualify → follow up → schedule →
 * post → report), not just one channel. Offered when the audit found gaps across
 * **two or more areas** — enough operational surface that a single agent
 * orchestrating everything beats bolting on point tools.
 */
const AI_AGENT = {
  key: "ai-agent",
  monthly: 899,
  en: {
    name: "AI Agent (autonomous workflows)",
    pitch:
      "One agent runs your whole funnel — answers, qualifies, follows up, schedules and reports — 24/7.",
  },
  he: {
    name: "סוכן AI (וורקפלואו אוטונומי)",
    pitch: "סוכן אחד מריץ את כל המשפך — עונה, מסנן, עושה מעקב, קובע פגישות ומדווח — 24/7.",
  },
};

/**
 * The full recurring-service menu (every tier, independent of any audit) — for
 * the agency landing page. One source of truth with the finding-anchored path.
 */
export function aiServiceMenu(s: Strings = stringsFor("en")): AiService[] {
  const he = s.code === "he";
  const currency = "₪";
  const items = TRIGGERS.map((t) => {
    const c = he ? t.he : t.en;
    return { key: t.key, name: c.name, pitch: c.pitch, monthly: t.monthly, currency };
  });
  const a = he ? AI_AGENT.he : AI_AGENT.en;
  items.push({
    key: AI_AGENT.key,
    name: a.name,
    pitch: a.pitch,
    monthly: AI_AGENT.monthly,
    currency,
  });
  return items;
}

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
  // Flagship agent when the business has gaps across ≥2 areas.
  if (areas.size >= 2) {
    const copy = he ? AI_AGENT.he : AI_AGENT.en;
    services.push({
      key: AI_AGENT.key,
      name: copy.name,
      pitch: copy.pitch,
      monthly: AI_AGENT.monthly,
      currency,
    });
  }
  const sum = services.reduce((n, x) => n + x.monthly, 0);
  const bundleMonthly = services.length > 1 ? Math.round((sum * 0.8) / 10) * 10 : sum;
  return { services, bundleMonthly, currency };
}
