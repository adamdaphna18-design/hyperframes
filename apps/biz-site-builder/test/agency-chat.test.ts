import { describe, expect, test } from "bun:test";
import { stringsFor } from "../src/i18n/strings.ts";
import { generateAgencyPage } from "../src/generate/agency.ts";
import { chatWidgetSnippet, hasChatWidget } from "../src/generate/chatwidget.ts";
import { generateSite } from "../src/generate/site.ts";
import { siteBuildMenu } from "../src/generate/quote.ts";

const en = stringsFor("en");
const he = stringsFor("he");

describe("agency landing page", () => {
  test("renders services, the 50% offer, struck prices and payment options", () => {
    const html = generateAgencyPage({ name: "Acme Web", email: "hi@acme.co", phone: "050-1" }, en);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Acme Web");
    expect(html).toContain("50% OFF");
    expect(html).toContain("Payment options");
    expect(html).toContain("50% upfront");
    expect(html).toContain("interest-free");
    // A build price is shown struck-through next to its half price.
    const cheapest = Math.min(...siteBuildMenu(en).map((b) => b.from));
    expect(html).toContain(`<s>₪${cheapest.toLocaleString("en-US")}</s>`);
    expect(html).toContain(`₪${(Math.round((cheapest * 0.5) / 10) * 10).toLocaleString("en-US")}`);
    // Flagship AI Agent appears in the service menu.
    expect(html).toContain("AI Agent");
    expect(html).toContain("hi@acme.co");
  });
  test("localizes to Hebrew (RTL) with the launch offer", () => {
    const html = generateAgencyPage({ name: "סטודיו דנה" }, he);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("50% הנחה");
    expect(html).toContain("אפשרויות תשלום");
    expect(html).toContain("ביט / פייבוקס");
  });
  test("escapes untrusted brand input", () => {
    const html = generateAgencyPage({ name: "A&B <x>" }, en);
    expect(html).toContain("A&amp;B &lt;x&gt;");
    expect(html).not.toContain("<x>");
  });
});

describe("chat widget embed", () => {
  const biz = { id: "b", name: "Cafe", images: [], reviews: [] };
  test("hasChatWidget guards on a configured src", () => {
    expect(hasChatWidget(undefined)).toBe(false);
    expect(hasChatWidget({ src: "" })).toBe(false);
    expect(hasChatWidget({ src: "https://x/embed.js" })).toBe(true);
  });
  test("emits a script embed with data attributes", () => {
    const snip = chatWidgetSnippet(
      { src: "https://x/embed.js", embedId: "agent_7", greeting: "Hi" },
      "ltr",
    );
    expect(snip).toContain('src="https://x/embed.js"');
    expect(snip).toContain('data-embed-id="agent_7"');
    expect(snip).toContain('data-greeting="Hi"');
    expect(snip).toContain('data-position="right"');
  });
  test("defaults the bubble to the left on RTL sites", () => {
    expect(chatWidgetSnippet({ src: "https://x/embed.js" }, "rtl")).toContain(
      'data-position="left"',
    );
  });
  test("renders into a generated site only when configured", () => {
    expect(generateSite(biz, en)).not.toContain("data-embed-id");
    const withChat = generateSite(biz, en, {
      chatWidget: { src: "https://x/e.js", embedId: "a1" },
    });
    expect(withChat).toContain('data-embed-id="a1"');
  });
});
