import type { Business } from "../types.ts";
import type { Strings } from "../i18n/strings.ts";
import type { ResolvedPlugin } from "./plugins.ts";
import { themeSlug } from "./theme.ts";

/**
 * Generate a WP-CLI provisioning script that stands up a complete WordPress site
 * for the business on a target host: download core, install the language pack
 * (he_IL for the Israel market), install + activate the block child theme,
 * install plugins from the WordPress.org directory, and import the WXR content.
 */
export function generateProvisionScript(
  business: Business,
  s: Strings,
  opts: { plugins: ResolvedPlugin[]; baseTheme: string },
): string {
  const slug = themeSlug(business);
  const language = s.code === "he" ? "he_IL" : "en_US";
  const pluginInstalls = opts.plugins
    .map((p) => `wp plugin install ${p.slug} --activate --allow-root   # ${p.reason}`)
    .join("\n");

  return `#!/usr/bin/env bash
# Provision a WordPress site for "${business.name}" with WP-CLI.
# Prereqs: wp-cli, PHP, and a configured database. Run from an empty web root.
# Usage: DB_NAME=... DB_USER=... DB_PASS=... SITE_URL=https://example.com bash provision.sh
set -euo pipefail

SITE_URL="\${SITE_URL:-http://localhost}"
SITE_TITLE=${shq(business.name)}
ADMIN_USER="\${ADMIN_USER:-admin}"
ADMIN_PASS="\${ADMIN_PASS:-change-me-please}"
ADMIN_EMAIL="\${ADMIN_EMAIL:-${business.email ?? "admin@example.com"}}"
BASE_THEME="${opts.baseTheme}"
CHILD_THEME="${slug}"

# 1. Core: download + configure + install
wp core download --locale=${language} --allow-root || true
wp config create --dbname="\${DB_NAME}" --dbuser="\${DB_USER}" --dbpass="\${DB_PASS}" \\
  --dbhost="\${DB_HOST:-localhost}" --skip-check --allow-root || true
wp core install --url="\${SITE_URL}" --title="\${SITE_TITLE}" \\
  --admin_user="\${ADMIN_USER}" --admin_password="\${ADMIN_PASS}" \\
  --admin_email="\${ADMIN_EMAIL}" --skip-email --allow-root

# 2. Language (installs Hebrew for the Israel market)
wp language core install ${language} --activate --allow-root || true

# 3. Base theme + our generated block child theme
wp theme install "\${BASE_THEME}" --allow-root || true
cp -R "theme/\${CHILD_THEME}" "$(wp theme path --dir --allow-root)/\${CHILD_THEME}" 2>/dev/null || \\
  cp -R "theme/\${CHILD_THEME}" "wp-content/themes/\${CHILD_THEME}"
wp theme activate "\${CHILD_THEME}" --allow-root

# 3b. Must-use plugins (schema.org structured data) — auto-activate
if [ -d mu-plugins ]; then
  mkdir -p wp-content/mu-plugins
  cp -R mu-plugins/. wp-content/mu-plugins/
fi

# 4. Plugins from the WordPress.org directory
${pluginInstalls || "# (no extra plugins resolved)"}

# 5. Import the business content (pages, reviews)
wp plugin install wordpress-importer --activate --allow-root || true
wp import content.wxr.xml --authors=create --allow-root

# 6. Make the Home page the front page
HOME_ID=$(wp post list --post_type=page --fields=ID,post_name --format=csv --allow-root | awk -F, '$2=="home"{print $1}' | head -1)
if [ -n "\${HOME_ID:-}" ]; then
  wp option update show_on_front page --allow-root
  wp option update page_on_front "\${HOME_ID}" --allow-root
fi

# 7. Locale + permalinks
wp option update WPLANG ${language} --allow-root || true
wp rewrite structure '/%postname%/' --allow-root || true

echo "✓ ${business.name} provisioned at \${SITE_URL}"
`;
}

/** Shell-quote a value for safe single-quoted embedding. */
function shq(v: string): string {
  return `'${v.replace(/'/g, "'\\''")}'`;
}
