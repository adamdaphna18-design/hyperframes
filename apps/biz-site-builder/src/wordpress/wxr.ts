import type { Business } from "../types.ts";
import type { Strings } from "../i18n/strings.ts";
import { taglineFor } from "../generate/util.ts";
import { aboutPage, blogPostBlocks, contactPage, homePage, reviewsPage } from "./blocks.ts";
import { blogDrafts } from "../generate/blog.ts";
import { cdata, xmlEsc } from "./xml.ts";

/**
 * Generate a WordPress WXR (eXtended RSS) import file for a business: Home,
 * About, Reviews and Contact pages with Gutenberg block bodies, plus the
 * community reviews as approved comments on the Reviews page. Import with
 * `wp import content.wxr.xml` or Tools → Import → WordPress in wp-admin.
 *
 * Deterministic: a fixed post date is used (no Date.now) so re-runs are stable.
 */
const FIXED_DATE = "2024-01-01 00:00:00";
const FIXED_DATE_GMT = "2024-01-01 00:00:00";

interface PageSpec {
  id: number;
  title: string;
  slug: string;
  content: string;
  menuOrder: number;
}

function commentXml(
  review: { author?: string; text: string; rating?: number },
  id: number,
): string {
  return `    <wp:comment>
      <wp:comment_id>${id}</wp:comment_id>
      <wp:comment_author>${cdata(review.author ?? "Customer")}</wp:comment_author>
      <wp:comment_author_email></wp:comment_author_email>
      <wp:comment_author_url></wp:comment_author_url>
      <wp:comment_date>${cdata(FIXED_DATE)}</wp:comment_date>
      <wp:comment_date_gmt>${cdata(FIXED_DATE_GMT)}</wp:comment_date_gmt>
      <wp:comment_content>${cdata(review.rating !== undefined ? `[${review.rating}/5] ${review.text}` : review.text)}</wp:comment_content>
      <wp:comment_approved>${cdata("1")}</wp:comment_approved>
      <wp:comment_type>${cdata("comment")}</wp:comment_type>
      <wp:comment_parent>0</wp:comment_parent>
      <wp:comment_user_id>0</wp:comment_user_id>
    </wp:comment>`;
}

function itemXml(page: PageSpec, base: string, comments = ""): string {
  return `  <item>
    <title>${xmlEsc(page.title)}</title>
    <link>${xmlEsc(`${base}/${page.slug}/`)}</link>
    <pubDate>Mon, 01 Jan 2024 00:00:00 +0000</pubDate>
    <dc:creator>${cdata("admin")}</dc:creator>
    <guid isPermaLink="false">${xmlEsc(`${base}/?page_id=${page.id}`)}</guid>
    <description></description>
    <content:encoded>${cdata(page.content)}</content:encoded>
    <excerpt:encoded>${cdata("")}</excerpt:encoded>
    <wp:post_id>${page.id}</wp:post_id>
    <wp:post_date>${cdata(FIXED_DATE)}</wp:post_date>
    <wp:post_date_gmt>${cdata(FIXED_DATE_GMT)}</wp:post_date_gmt>
    <wp:comment_status>${cdata("closed")}</wp:comment_status>
    <wp:ping_status>${cdata("closed")}</wp:ping_status>
    <wp:post_name>${cdata(page.slug)}</wp:post_name>
    <wp:status>${cdata("publish")}</wp:status>
    <wp:post_parent>0</wp:post_parent>
    <wp:menu_order>${page.menuOrder}</wp:menu_order>
    <wp:post_type>${cdata("page")}</wp:post_type>
    <wp:post_password></wp:post_password>
    <wp:is_sticky>0</wp:is_sticky>
${comments}
  </item>`;
}

/** A blog post `<item>` (post_type=post), body as Gutenberg blocks. */
function postItemXml(
  post: { id: number; title: string; slug: string; content: string; excerpt: string },
  base: string,
): string {
  return `  <item>
    <title>${xmlEsc(post.title)}</title>
    <link>${xmlEsc(`${base}/${post.slug}/`)}</link>
    <pubDate>Mon, 01 Jan 2024 00:00:00 +0000</pubDate>
    <dc:creator>${cdata("admin")}</dc:creator>
    <guid isPermaLink="false">${xmlEsc(`${base}/?p=${post.id}`)}</guid>
    <description></description>
    <content:encoded>${cdata(post.content)}</content:encoded>
    <excerpt:encoded>${cdata(post.excerpt)}</excerpt:encoded>
    <wp:post_id>${post.id}</wp:post_id>
    <wp:post_date>${cdata(FIXED_DATE)}</wp:post_date>
    <wp:post_date_gmt>${cdata(FIXED_DATE_GMT)}</wp:post_date_gmt>
    <wp:comment_status>${cdata("open")}</wp:comment_status>
    <wp:ping_status>${cdata("open")}</wp:ping_status>
    <wp:post_name>${cdata(post.slug)}</wp:post_name>
    <wp:status>${cdata("publish")}</wp:status>
    <wp:post_parent>0</wp:post_parent>
    <wp:menu_order>0</wp:menu_order>
    <wp:post_type>${cdata("post")}</wp:post_type>
    <wp:post_password></wp:post_password>
    <wp:is_sticky>0</wp:is_sticky>
  </item>`;
}

export interface WxrOptions {
  /** Also import the per-trade SEO blog as WordPress posts. */
  blog?: boolean;
}

export function generateWxr(business: Business, s: Strings, opts: WxrOptions = {}): string {
  const base = "http://localhost";
  const pages: PageSpec[] = [
    { id: 10, title: business.name, slug: "home", content: homePage(business, s), menuOrder: 0 },
    { id: 11, title: s.about, slug: "about", content: aboutPage(business, s), menuOrder: 1 },
    {
      id: 12,
      title: s.whatPeopleSay,
      slug: "reviews",
      content: reviewsPage(business, s),
      menuOrder: 2,
    },
    { id: 13, title: s.contact, slug: "contact", content: contactPage(business, s), menuOrder: 3 },
  ];

  const reviewComments = business.reviews.map((r, i) => commentXml(r, 100 + i)).join("\n");
  let items = pages
    .map((page) => itemXml(page, base, page.slug === "reviews" ? reviewComments : ""))
    .join("\n");

  // The per-trade SEO blog, imported as real WordPress posts.
  if (opts.blog) {
    const posts = blogDrafts(business, s).map((d, i) =>
      postItemXml(
        {
          id: 20 + i,
          title: d.title,
          slug: d.slug,
          content: blogPostBlocks(d, s),
          excerpt: d.description,
        },
        base,
      ),
    );
    items += "\n" + posts.join("\n");
  }

  const language = s.code === "he" ? "he-IL" : "en-US";

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by biz-site-builder for ${xmlEsc(business.name)}. WordPress WXR 1.2. -->
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wfw="http://wellformedweb.org/CommentAPI/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/"
>
<channel>
  <title>${xmlEsc(business.name)}</title>
  <link>${xmlEsc(base)}</link>
  <description>${xmlEsc(taglineFor(business, s))}</description>
  <pubDate>Mon, 01 Jan 2024 00:00:00 +0000</pubDate>
  <language>${language}</language>
  <wp:wxr_version>1.2</wp:wxr_version>
  <wp:base_site_url>${xmlEsc(base)}</wp:base_site_url>
  <wp:base_blog_url>${xmlEsc(base)}</wp:base_blog_url>
  <wp:author>
    <wp:author_id>1</wp:author_id>
    <wp:author_login>${cdata("admin")}</wp:author_login>
    <wp:author_email>${cdata(business.email ?? "admin@example.com")}</wp:author_email>
    <wp:author_display_name>${cdata(business.name)}</wp:author_display_name>
    <wp:author_first_name>${cdata("")}</wp:author_first_name>
    <wp:author_last_name>${cdata("")}</wp:author_last_name>
  </wp:author>
  <generator>https://github.com/heygen-com/hyperframes</generator>
${items}
</channel>
</rss>
`;
}
