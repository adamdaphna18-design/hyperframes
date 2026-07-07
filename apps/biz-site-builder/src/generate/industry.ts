import type { Business } from "../types.ts";
import type { Strings } from "../i18n/strings.ts";
import { stringsFor } from "../i18n/strings.ts";
import { painPointFor } from "./painpoints.ts";

/**
 * Per-category **business intelligence** — the static profile behind a targeted
 * pitch: an industry-average deal size and lead→customer close rate (used by the
 * ROI estimator), the must-have features a site in that category needs, and a
 * closing line. Deterministic: a lookup table, EN + Hebrew. The deal size and
 * close rate are **industry averages** (clearly labelled as assumptions wherever
 * they surface) — not a measurement of any specific business.
 */

export interface IndustryProfile {
  key: string;
  /** Localized category label. */
  displayName: string;
  /** Industry-average deal / order value in ILS (an assumption, not a measurement). */
  avgDealSize: number;
  /** Industry-average lead → customer close rate (0–1, an assumption). */
  conversionRate: number;
  /** Must-have features a site in this category needs. */
  requiredFeatures: string[];
  /** A category-specific closing line. */
  closingPitch: string;
  /** The industry pain point (single source of truth: painpoints.ts). */
  painPoint: string;
}

interface ProfileData {
  key: string;
  match: RegExp;
  avgDealSize: number;
  conversionRate: number;
  en: { name: string; features: string[]; pitch: string };
  he: { name: string; features: string[]; pitch: string };
}

const PROFILES: ProfileData[] = [
  {
    key: "electrician",
    match: /electric|electrician|חשמלאי|חשמל/i,
    avgDealSize: 800,
    conversionRate: 0.35,
    en: {
      name: "Electrician",
      features: [
        "Fast booking form",
        "“Available now” widget",
        "Certifications gallery",
        "Service-area map",
      ],
      pitch:
        "You lose jobs every week to missed calls — put a digital worker on the phone for you.",
    },
    he: {
      name: "חשמלאי",
      features: ["טופס הזמנת תור מהיר", "וידג'ט 'זמין עכשיו'", "גלריית תעודות", "מפת אזורי שירות"],
      pitch: "אתם מפסידים עבודות כל שבוע בגלל שיחות שלא נענו — תנו לעובד דיגיטלי לענות במקומכם.",
    },
  },
  {
    key: "plumber",
    match: /plumb|plumber|שרברב|אינסטלט|אינסטלציה/i,
    avgDealSize: 650,
    conversionRate: 0.4,
    en: {
      name: "Plumber",
      features: [
        "Click-to-call",
        "Instant price estimate",
        "Before/after gallery",
        "Emergency booking",
      ],
      pitch:
        "Every day without a findable site, the plumber who shows up first in search takes your customer.",
    },
    he: {
      name: "שרברב",
      features: ["חייגן מהיר", "הערכת מחיר מיידית", "גלריית לפני/אחרי", "הזמנה דחופה"],
      pitch: "כל יום בלי אתר שנמצא בחיפוש, השרברב שמופיע ראשון לוקח לכם את הלקוח.",
    },
  },
  {
    key: "handyman",
    match: /handyman|contractor|technician|renovation|הנדימן|קבלן|טכנאי|שיפוצ/i,
    avgDealSize: 900,
    conversionRate: 0.3,
    en: {
      name: "Handyman / Contractor",
      features: [
        "Transparent price list",
        "Reviews & testimonials",
        "Portfolio of past work",
        "Quick quote form",
      ],
      pitch:
        "Without a price list and reviews online, prospects can't tell you apart — so they pick on price.",
    },
    he: {
      name: "הנדימן / קבלן",
      features: ["מחירון שקוף", "ביקורות והמלצות", "תיק עבודות", "טופס הצעת מחיר מהירה"],
      pitch: "בלי מחירון וביקורות ברשת, לקוחות לא מבדילים ביניכם — אז בוחרים לפי מחיר.",
    },
  },
  {
    key: "restaurant",
    match: /restaurant|cafe|coffee|bar|bakery|diner|trattoria|מסעדה|קפה|בר|מאפייה/i,
    avgDealSize: 150,
    conversionRate: 0.15,
    en: {
      name: "Restaurant / Café",
      features: ["Online table booking", "Live-updating menu", "Food gallery", "Map & hours"],
      pitch:
        "You lose evening covers every night the phone goes unanswered — let bookings come in 24/7.",
    },
    he: {
      name: "מסעדה / בית קפה",
      features: ["הזמנת שולחן אונליין", "תפריט שמתעדכן", "גלריית אוכל", "מפה ושעות פעילות"],
      pitch: "אתם מפסידים שולחנות כל ערב שהטלפון לא נענה — תנו להזמנות להיכנס 24/7.",
    },
  },
  {
    key: "salon",
    match: /salon|barber|hair|beauty|spa|nails|מספרה|ספר|יופי|ספא|קוסמט/i,
    avgDealSize: 250,
    conversionRate: 0.35,
    en: {
      name: "Salon / Beauty",
      features: ["Online appointment booking", "Work gallery", "Service menu", "Product portal"],
      pitch: "Every phone-tag booking is a client you could have won while you were with another.",
    },
    he: {
      name: "מספרה / יופי",
      features: ["קביעת תורים אונליין", "גלריית עבודות", "תפריט טיפולים", "פורטל מוצרים"],
      pitch: "כל תור שנקבע בטלפון הוא לקוח שיכולתם לזכות בו בזמן שטיפלתם באחר.",
    },
  },
  {
    key: "lawyer",
    match:
      /lawyer|attorney|accountant|consult|advisor|notary|עורך דין|עו"ד|רואה חשבון|יועץ|נוטריון/i,
    avgDealSize: 3000,
    conversionRate: 0.2,
    en: {
      name: "Lawyer / Consultant",
      features: [
        "Detailed service pages",
        "Client testimonials",
        "Professional articles",
        "Instant contact form",
      ],
      pitch: "A credible site is what convinces a prospect to trust you before they ever call.",
    },
    he: {
      name: "עורך דין / יועץ",
      features: ["דפי שירות מפורטים", "המלצות לקוחות", "מאמרים מקצועיים", "טופס יצירת קשר מיידי"],
      pitch: "אתר אמין הוא מה שמשכנע לקוח לסמוך עליכם עוד לפני שהוא מתקשר.",
    },
  },
  {
    key: "clinic",
    match:
      /clinic|dentist|dental|doctor|medical|therap|psycholog|מרפאה|רופא|שיניים|קליניקה|פסיכולוג/i,
    avgDealSize: 500,
    conversionRate: 0.3,
    en: {
      name: "Clinic / Practitioner",
      features: ["Appointment booking", "Service pages", "Health articles", "Secure patient area"],
      pitch:
        "Patients book the practice they can find and reach online — make that practice yours.",
    },
    he: {
      name: "מרפאה / מטפל",
      features: ["קביעת תורים", "דפי שירות", "מאמרי בריאות", "אזור מטופלים מאובטח"],
      pitch: "מטופלים קובעים תור אצל מי שמוצאים ומשיגים אונליין — שזה יהיה אתם.",
    },
  },
  {
    key: "gym",
    match: /gym|fitness|yoga|studio|pilates|מכון כושר|חדר כושר|יוגה|סטודיו|פילאטיס/i,
    avgDealSize: 300,
    conversionRate: 0.25,
    en: {
      name: "Gym / Studio",
      features: ["Live class schedule", "Online signup", "Member portal", "Instructional videos"],
      pitch: "A stale schedule sends members to the studio with a smoother booking experience.",
    },
    he: {
      name: "מכון כושר / סטודיו",
      features: ["לוח שיעורים בזמן אמת", "הרשמה אונליין", "פורטל מתאמנים", "סרטוני הדרכה"],
      pitch: "לוח שיעורים לא מעודכן שולח מתאמנים לסטודיו עם חוויית הרשמה נוחה יותר.",
    },
  },
  {
    key: "shop",
    match: /shop|store|retail|boutique|market|goods|fashion|חנות|בוטיק|קמעונאות|אופנה/i,
    avgDealSize: 350,
    conversionRate: 0.02,
    en: {
      name: "Shop / Boutique",
      features: [
        "Product catalog",
        "Advanced search",
        "Secure checkout",
        "High-quality product photos",
      ],
      pitch:
        "Shoppers who buy online first can't find your inventory — that's revenue walking away.",
    },
    he: {
      name: "חנות / בוטיק",
      features: ["קטלוג מוצרים", "חיפוש מתקדם", "סליקה מאובטחת", "תמונות מוצר איכותיות"],
      pitch: "קונים שמחפשים אונליין קודם לא מוצאים את המלאי שלכם — זו הכנסה שהולכת לאיבוד.",
    },
  },
  {
    key: "auto",
    match: /auto|mechanic|garage|repair|מוסך|רכב/i,
    avgDealSize: 700,
    conversionRate: 0.35,
    en: {
      name: "Auto / Garage",
      features: ["Booking system", "Service & price list", "Quick diagnosis form", "Reviews"],
      pitch: "Drivers pick the trusted garage they can find and book — be the one that shows up.",
    },
    he: {
      name: "מוסך / רכב",
      features: ["מערכת תורים", "מחירון שירותים", "טופס אבחון מהיר", "ביקורות"],
      pitch: "נהגים בוחרים מוסך אמין שאפשר למצוא ולהזמין — שזה יהיה אתם.",
    },
  },
  {
    key: "hotel",
    match: /hotel|motel|hostel|bnb|guesthouse|צימר|מלון|אירוח|אכסני/i,
    avgDealSize: 900,
    conversionRate: 0.05,
    en: {
      name: "Hotel / Guesthouse",
      features: ["Booking engine", "Room gallery", "Reviews", "Interactive map & local tips"],
      pitch: "No instant booking means travelers reserve with whoever lets them book on the spot.",
    },
    he: {
      name: "מלון / צימר",
      features: ["מנוע הזמנות", "גלריית חדרים", "ביקורות", "מפה אינטראקטיבית והמלצות מקומיות"],
      pitch: "בלי הזמנה מיידית, מטיילים מזמינים אצל מי שמאפשר להזמין במקום.",
    },
  },
];

const DEFAULT: ProfileData = {
  key: "general",
  match: /.^/, // never matches
  avgDealSize: 500,
  conversionRate: 0.2,
  en: {
    name: "Business",
    features: [
      "Responsive website",
      "Clear call-to-action",
      "Contact form",
      "Reviews / trust signals",
    ],
    pitch:
      "A findable, credible site turns searches into calls — the ones going to competitors today.",
  },
  he: {
    name: "עסק",
    features: ["אתר רספונסיבי", "קריאה ברורה לפעולה", "טופס יצירת קשר", "ביקורות / אותות אמון"],
    pitch: "אתר שנמצא ומשדר אמינות הופך חיפושים לשיחות — אלה שהולכות היום למתחרים.",
  },
};

/** Resolve the industry profile for a business (or a raw category string). */
export function getIndustryProfile(
  business: Business | { category?: string; name?: string },
  s: Strings = stringsFor("en"),
): IndustryProfile {
  const category = business.category ?? "";
  const data = PROFILES.find((p) => p.match.test(category)) ?? DEFAULT;
  const copy = s.code === "he" ? data.he : data.en;
  const biz: Business =
    "id" in business
      ? (business as Business)
      : { id: "x", name: business.name ?? "", category, images: [], reviews: [] };
  return {
    key: data.key,
    displayName: copy.name,
    avgDealSize: data.avgDealSize,
    conversionRate: data.conversionRate,
    requiredFeatures: copy.features,
    closingPitch: copy.pitch,
    painPoint: painPointFor(biz, s),
  };
}
