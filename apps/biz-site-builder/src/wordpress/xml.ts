/** Escape text for an XML text node or attribute value. */
export function xmlEsc(input: string | undefined | null): string {
  if (input === undefined || input === null) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Wrap arbitrary content (HTML / block markup) in a CDATA section, safely
 * splitting any `]]>` that would otherwise close it early. WordPress WXR stores
 * post bodies this way.
 */
export function cdata(input: string | undefined | null): string {
  const text = input ?? "";
  return `<![CDATA[${text.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}
