import type { Business } from "../types.ts";
import type { Strings } from "../i18n/strings.ts";
import { getIndustryProfile } from "./industry.ts";

/**
 * A **services / price menu** for the site — the thing a barber, restaurant or
 * clinic page is useless without. If the business supplies its own `services`
 * they win; otherwise we render a sensible **starter menu for its trade** (clearly
 * a template the owner edits) so the page is never an empty shell. Deterministic,
 * EN + Hebrew. Also provides the category glyph used for visual identity when a
 * business has no photos yet.
 */
export interface ServiceItem {
  name: string;
  /** Free-form price string, e.g. "₪80" or "from ₪120". */
  price?: string;
  note?: string;
}

/** Barber menus differ from beauty salons — detect the men's-barber case first. */
const BARBER = /barber|ספר\b|מספר/i;

const BARBER_MENU: { en: ServiceItem[]; he: ServiceItem[] } = {
  en: [
    { name: "Men's haircut", price: "₪80" },
    { name: "Haircut + beard", price: "₪110" },
    { name: "Beard sculpt", price: "₪40" },
    { name: "Hot-towel shave", price: "₪60" },
    { name: "Kids' cut", price: "₪50" },
  ],
  he: [
    { name: "תספורת גבר", price: "₪80" },
    { name: "תספורת + עיצוב זקן", price: "₪110" },
    { name: "עיצוב זקן", price: "₪40" },
    { name: "גילוח מגבת חמה", price: "₪60" },
    { name: "תספורת ילד", price: "₪50" },
  ],
};

/** Starter menus keyed by industry profile key. */
const MENUS: Record<string, { en: ServiceItem[]; he: ServiceItem[] }> = {
  salon: {
    en: [
      { name: "Cut & blow-dry", price: "₪150" },
      { name: "Color", price: "from ₪280" },
      { name: "Highlights", price: "from ₪400" },
      { name: "Treatment", price: "₪120" },
      { name: "Styling", price: "₪90" },
    ],
    he: [
      { name: "תספורת + פן", price: "₪150" },
      { name: "צבע", price: "החל מ-₪280" },
      { name: "גוונים", price: "החל מ-₪400" },
      { name: "טיפול", price: "₪120" },
      { name: "עיצוב", price: "₪90" },
    ],
  },
  restaurant: {
    en: [
      { name: "Starters", price: "₪28–₪52" },
      { name: "Mains", price: "₪62–₪120" },
      { name: "Business lunch", price: "₪59" },
      { name: "Desserts", price: "₪34" },
      { name: "Wine by the glass", price: "from ₪32" },
    ],
    he: [
      { name: "ראשונות", price: "₪28–₪52" },
      { name: "עיקריות", price: "₪62–₪120" },
      { name: "עסקית צהריים", price: "₪59" },
      { name: "קינוחים", price: "₪34" },
      { name: "יין בכוס", price: "החל מ-₪32" },
    ],
  },
  clinic: {
    en: [
      { name: "Consultation", price: "₪250" },
      { name: "Checkup", price: "₪200" },
      { name: "Cleaning / hygiene", price: "₪350" },
      { name: "Follow-up", price: "₪150" },
    ],
    he: [
      { name: "ייעוץ", price: "₪250" },
      { name: "בדיקה", price: "₪200" },
      { name: "ניקוי / היגיינה", price: "₪350" },
      { name: "מעקב", price: "₪150" },
    ],
  },
  gym: {
    en: [
      { name: "Monthly membership", price: "₪199" },
      { name: "10-class pass", price: "₪450" },
      { name: "Drop-in class", price: "₪60" },
      { name: "Personal training", price: "₪180 / session" },
    ],
    he: [
      { name: "מנוי חודשי", price: "₪199" },
      { name: "כרטיסייה 10", price: "₪450" },
      { name: "שיעור בודד", price: "₪60" },
      { name: "אימון אישי", price: "₪180 לאימון" },
    ],
  },
  auto: {
    en: [
      { name: "Diagnostics", price: "₪150" },
      { name: "Oil & filter", price: "from ₪280" },
      { name: "Brake service", price: "from ₪400" },
      { name: "Annual test prep", price: "₪250" },
    ],
    he: [
      { name: "אבחון", price: "₪150" },
      { name: "שמן ומסנן", price: "החל מ-₪280" },
      { name: "טיפול בלמים", price: "החל מ-₪400" },
      { name: "הכנה לטסט", price: "₪250" },
    ],
  },
};

/** The services to render: the business's own, else a trade-appropriate starter. */
export function servicesFor(business: Business, s: Strings): ServiceItem[] {
  if (business.services?.length) return business.services;
  const he = s.code === "he";
  if (BARBER.test(business.category ?? "")) return he ? BARBER_MENU.he : BARBER_MENU.en;
  const menu = MENUS[getIndustryProfile(business, s).key];
  return menu ? (he ? menu.he : menu.en) : [];
}

/** Whether the starter menu is a template (no owner-supplied services). */
export function isStarterMenu(business: Business): boolean {
  return !business.services?.length;
}
