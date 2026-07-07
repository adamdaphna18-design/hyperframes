export type LocaleCode = "en" | "he";
export type Direction = "ltr" | "rtl";

/**
 * The full set of user-facing strings the generators emit, so a site/video/
 * directory can be produced end-to-end in any supported language. Functions are
 * used where a value is interpolated (name, count, place) because word order and
 * plural/gender rules differ between English and Hebrew.
 */
export interface Strings {
  code: LocaleCode;
  dir: Direction;
  lang: string;

  // Site
  callUs: string;
  getDirections: string;
  contact: string;
  about: string;
  whatPeopleSay: string;
  visitHeading: (name: string) => string;
  addressLabel: string;
  phoneLabel: string;
  emailLabel: string;
  hoursLabel: string;
  contactFallback: string;
  builtBy: (withReviews: boolean) => string;
  /** Weekday names, Monday-first (index 0 = Monday … 6 = Sunday). */
  days: [string, string, string, string, string, string, string];
  closedLabel: string;
  open24: string;

  // Video
  visitUs: string;
  videoContactFallback: string;

  // Taglines (fallbacks when no description exists)
  nowOpen: string;
  proudlyServing: (where: string) => string;
  localCategory: (category: string) => string;
  categoryIn: (category: string, where: string) => string;

  // Directory / listing
  directoryTitle: string;
  directorySubtitle: (count: number) => string;
  businessesListed: string;
  neededWebsite: string;
  alreadyHad: string;
  sectionBuilt: string;
  sectionHasSite: string;
  hasWebsiteTag: string;
  needsWebsiteTag: string;
  reviewsCount: (n: number) => string;
  photosCount: (n: number) => string;
  openSite: string;
  promoVideo: string;
  existingSite: string;
}

const en: Strings = {
  code: "en",
  dir: "ltr",
  lang: "en",

  callUs: "Call us",
  getDirections: "Get directions",
  contact: "Contact",
  about: "About",
  whatPeopleSay: "What people say",
  visitHeading: (name) => `Visit ${name}`,
  addressLabel: "Address",
  phoneLabel: "Phone",
  emailLabel: "Email",
  hoursLabel: "Hours",
  contactFallback: "Get in touch to learn more.",
  builtBy: (withReviews) =>
    `Site auto-built by biz-site-builder from this business's public profile${withReviews ? " and community reviews" : ""}.`,
  days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  closedLabel: "Closed",
  open24: "Open 24 hours",

  visitUs: "Visit us",
  videoContactFallback: "Come visit us today",

  nowOpen: "Now open — come say hello",
  proudlyServing: (where) => `Proudly serving ${where}`,
  localCategory: (category) => `Your local ${category.toLowerCase()}`,
  categoryIn: (category, where) => `${category} in ${where}`,

  directoryTitle: "Business Directory",
  directorySubtitle: (count) =>
    `Scraped and listed ${count} businesses. Sites and promo videos were auto-built for those without one.`,
  businessesListed: "businesses listed",
  neededWebsite: "needed a website",
  alreadyHad: "already had one",
  sectionBuilt: "Websites built for these businesses",
  sectionHasSite: "Already have a website",
  hasWebsiteTag: "has website",
  needsWebsiteTag: "needs website",
  reviewsCount: (n) => `${n} review${n === 1 ? "" : "s"}`,
  photosCount: (n) => `${n} photo${n === 1 ? "" : "s"}`,
  openSite: "Open site",
  promoVideo: "Promo video",
  existingSite: "Existing site ↗",
};

const he: Strings = {
  code: "he",
  dir: "rtl",
  lang: "he",

  callUs: "התקשרו אלינו",
  getDirections: "הוראות הגעה",
  contact: "צרו קשר",
  about: "אודות",
  whatPeopleSay: "מה הלקוחות אומרים",
  visitHeading: (name) => `בקרו ב${name}`,
  addressLabel: "כתובת",
  phoneLabel: "טלפון",
  emailLabel: "אימייל",
  hoursLabel: "שעות פעילות",
  contactFallback: "צרו איתנו קשר לפרטים נוספים.",
  builtBy: (withReviews) =>
    `האתר נבנה אוטומטית על ידי biz-site-builder מתוך הפרופיל העסקי הציבורי${withReviews ? " וביקורות הקהילה" : ""}.`,
  days: ["שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת", "ראשון"],
  closedLabel: "סגור",
  open24: "פתוח 24 שעות",

  visitUs: "בואו לבקר",
  videoContactFallback: "בואו לבקר אותנו היום",

  nowOpen: "נפתחנו — בואו להכיר",
  proudlyServing: (where) => `גאים לשרת את ${where}`,
  localCategory: (category) => `${category} השכונתי שלכם`,
  categoryIn: (category, where) => `${category} ב${where}`,

  directoryTitle: "מדריך עסקים",
  directorySubtitle: (count) =>
    `נאספו ורוכזו ${count} עסקים. עבור העסקים שאין להם אתר נבנו אתר וסרטון קידום אוטומטית.`,
  businessesListed: "עסקים ברשימה",
  neededWebsite: "נזקקו לאתר",
  alreadyHad: "כבר יש אתר",
  sectionBuilt: "אתרים שנבנו עבור עסקים אלו",
  sectionHasSite: "כבר יש להם אתר",
  hasWebsiteTag: "יש אתר",
  needsWebsiteTag: "דרוש אתר",
  reviewsCount: (n) => (n === 1 ? "ביקורת אחת" : `${n} ביקורות`),
  photosCount: (n) => (n === 1 ? "תמונה אחת" : `${n} תמונות`),
  openSite: "פתחו אתר",
  promoVideo: "סרטון קידום",
  existingSite: "אתר קיים ↗",
};

const TABLE: Record<LocaleCode, Strings> = { en, he };

export function stringsFor(code: LocaleCode): Strings {
  return TABLE[code] ?? en;
}
