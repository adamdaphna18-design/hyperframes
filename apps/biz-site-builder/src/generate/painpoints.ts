import type { Business } from "../types.ts";
import type { Strings } from "../i18n/strings.ts";

/**
 * Industry-specific "pain point" lines — a one-sentence cost-of-inaction tailored
 * to the business category, injected into quotes and audit reports so the pitch
 * is relevant rather than generic. Deterministic; English + Hebrew.
 */

const PAIN_POINTS: Array<{ match: RegExp; en: string; he: string }> = [
  {
    match: /restaurant|cafe|coffee|bar|bakery|diner|trattoria|מסעדה|קפה|בר|מאפייה/i,
    en: "Customers can't order or book a table online — you're losing evening covers to competitors.",
    he: "לקוחות לא יכולים להזמין מקום או אוכל אונליין — אתם מפסידים הזמנות ערב למתחרים.",
  },
  {
    match: /salon|barber|hair|beauty|spa|nails|מספרה|ספר|יופי|ספא|קוסמט/i,
    en: "No online booking means missed appointments and time wasted on the phone.",
    he: "בלי קביעת תורים אונליין מפספסים לקוחות ומבזבזים זמן על טלפונים.",
  },
  {
    match:
      /lawyer|attorney|accountant|consult|advisor|notary|עורך דין|עו"ד|רואה חשבון|יועץ|נוטריון/i,
    en: "A weak site doesn't convey trust — prospects quietly choose a competitor who looks credible.",
    he: "אתר חלש לא משדר אמינות — לקוחות פוטנציאליים בוחרים במתחרה שנראה מקצועי יותר.",
  },
  {
    match: /shop|store|retail|boutique|market|goods|חנות|בוטיק|קמעונאות/i,
    en: "Without an online store you're invisible to shoppers who buy online first.",
    he: "בלי חנות אונליין אתם בלתי נראים לקונים שמחפשים ברשת קודם.",
  },
  {
    match: /clinic|dentist|dental|doctor|medical|therap|מרפאה|רופא|שיניים|קליניקה/i,
    en: "Patients can't find or book you online — appointments slip to clinics that are easier to reach.",
    he: "מטופלים לא מוצאים או קובעים תור אונליין — התורים עוברים למרפאות נגישות יותר.",
  },
  {
    match: /gym|fitness|yoga|studio|pilates|מכון כושר|חדר כושר|יוגה|סטודיו/i,
    en: "No online schedule or signup — members drift to studios with a smoother experience.",
    he: "בלי לוח שיעורים והרשמה אונליין — מתאמנים עוברים לסטודיו עם חוויה נוחה יותר.",
  },
  {
    match: /auto|mechanic|garage|repair|מוסך|רכב/i,
    en: "Drivers searching for a nearby, trusted garage never find you — the job goes elsewhere.",
    he: "נהגים שמחפשים מוסך אמין באזור לא מוצאים אתכם — העבודה הולכת למישהו אחר.",
  },
  {
    match: /electric|electrician|חשמלאי|חשמל/i,
    en: "Callers can't reach you mid-job — the urgent call goes to whoever answers first.",
    he: "לקוחות לא משיגים אתכם באמצע עבודה — הקריאה הדחופה עוברת למי שעונה ראשון.",
  },
  {
    match: /plumb|plumber|שרברב|אינסטלט|אינסטלציה/i,
    en: "When a pipe bursts, people call the plumber they can find online — not the one they can't.",
    he: "כשצינור מתפוצץ, מתקשרים לשרברב שמוצאים ברשת — לא לזה שלא מוצאים.",
  },
  {
    match: /handyman|contractor|technician|renovation|הנדימן|קבלן|טכנאי|שיפוצ/i,
    en: "Without reviews and a price list online, prospects can't tell you apart — so they pick the cheapest.",
    he: "בלי ביקורות ומחירון ברשת, לקוחות לא יודעים להבדיל ביניכם — אז בוחרים בזול ביותר.",
  },
  {
    match: /hotel|motel|hostel|bnb|guesthouse|צימר|מלון|אירוח|אכסני/i,
    en: "No online booking means travelers reserve with the property that lets them book on the spot.",
    he: "בלי הזמנה אונליין, מטיילים מזמינים אצל מי שמאפשר להזמין במקום.",
  },
];

const DEFAULT = {
  en: "Customers can't easily find or trust you online — you're losing business to competitors who can be found.",
  he: "לקוחות לא מוצאים או סומכים עליכם ברשת — אתם מפסידים עסקים למתחרים שכן נמצאים.",
};

export function painPointFor(business: Business, s: Strings): string {
  const c = business.category ?? "";
  for (const p of PAIN_POINTS) if (p.match.test(c)) return s.code === "he" ? p.he : p.en;
  return s.code === "he" ? DEFAULT.he : DEFAULT.en;
}
