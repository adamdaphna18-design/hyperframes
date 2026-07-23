import { esc, jsStr } from "./util.ts";

/**
 * Optional **AI chat-widget embed** for a generated site — the deliverable of the
 * "AI Agent" service. Like the analytics snippet, this is pure templating: it
 * injects the operator's chosen embeddable widget (e.g. AnythingLLM's
 * `anythingllm-embed`, Fleek's chatbox, or any script that reads `data-*`
 * config) with a `<script src>` + data attributes. It runs **no LLM at build
 * time** and ships nothing when unconfigured — the live agent backend is the
 * operator's (stateful, network-bound) responsibility, exactly like a GA id.
 */
export interface ChatWidgetOptions {
  /** Embed script URL. Required — nothing renders without it (no fake bubble). */
  src: string;
  /** Embed / agent id, emitted as `data-embed-id`. */
  embedId?: string;
  /** Button colour (hex). */
  buttonColor?: string;
  /** Opening greeting. */
  greeting?: string;
  /** Corner to dock the bubble. */
  position?: "left" | "right";
}

export function hasChatWidget(opts?: ChatWidgetOptions): opts is ChatWidgetOptions {
  return Boolean(opts?.src);
}

/**
 * A `<script>` embed for the configured widget, or "" when unconfigured. Layout
 * direction is passed through so the bubble docks correctly on RTL (Hebrew)
 * sites unless the operator pins a side.
 */
export function chatWidgetSnippet(opts: ChatWidgetOptions, dir: "ltr" | "rtl" = "ltr"): string {
  if (!opts.src) return "";
  const attrs: string[] = [`src="${esc(opts.src)}"`];
  if (opts.embedId) attrs.push(`data-embed-id="${esc(opts.embedId)}"`);
  if (opts.buttonColor) attrs.push(`data-button-color="${esc(opts.buttonColor)}"`);
  if (opts.greeting) attrs.push(`data-greeting="${esc(opts.greeting)}"`);
  const position = opts.position ?? (dir === "rtl" ? "left" : "right");
  attrs.push(`data-position="${position}"`);
  attrs.push(`data-no-sponsor="true"`);
  // A defensive inline shim so a blocked/missing embed never throws on the page.
  return `<script>window.__bsbChat=${jsStr(opts.embedId ?? "")};</script>
    <script async ${attrs.join(" ")}></script>`;
}
