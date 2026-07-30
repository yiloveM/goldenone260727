---
name: businessweb-seo-geo
description: Audit and improve a generic international B2B business website for product SEO, generative engine optimization, structured data, multilingual discoverability, content governance, and reusable template safety.
---

# BusinessWeb SEO/GEO Skill

Use this repo-local guidance when editing public pages, product collections, article collections, translations, JSON-LD, sitemap, robots rules, Keystatic config, or manager content workflows. Also use it whenever the owner provides an industry plus core keywords, or asks for full-site SEO/GEO optimization.

## Boundaries

- Keep `/keystatic/` for owner-level Git-backed editing and advanced site operations.
- Keep `/manager/` for content-level administrators, draft review, R2 asset browsing, AI translation dispatch, and publish requests.
- Keep `/api/`, `/r2/`, `/keystatic/`, and `/manager/` out of public search indexing.
- Do not hard-code a final customer brand, product family, address, phone, repo owner, or Cloudflare account into the template.
- Treat `src/data/industry-profile.json` as the brand, market, SEO, product-architecture, visual, and launch-governance source of truth. It is owner-editable through the Keystatic **Brand and industry foundation** singleton.
- Treat `src/data/site-language-settings.json` as the only enabled-language source of truth. The owner controls it through the Keystatic **网站语言** singleton. Manager and AI translation choices must come from this setting, never from a hard-coded active-language list.
- Public pages are for international external buyers. Do not expose template, CMS, deployment, draft, R2, D1, or internal-workflow wording in buyer-facing copy after an industry brief is supplied.

## Two-phase workflow

### Phase one: industry visual build

When the owner gives an industry, one or more core keywords, and optional non-English target locales:

1. Read `docs/CODEX-INDUSTRY-WORKFLOW.md` and run `npm run industry:brief --` with the parsed values. The `--locales` option may preselect the owner-facing language checkboxes, but `/keystatic/` **网站语言** remains authoritative.
2. Determine whether the business is an industrial model-series catalog, discrete product catalog, service business, solution business, or hybrid. Record common attributes, model-specific attributes, buyer roles, target markets, public categories, and design direction in the industry profile.
3. Rebuild the public site around actual buyer evaluation: a specific high-end visual direction, genuine product/process/project media, concise commercial positioning, information-rich catalog/application paths, and direct inquiry flows.
4. Keep the stack and ownership boundaries unchanged. Do not remove custom Keystatic widgets, manager drafts/review, R2 media, D1, KV, translation, contact, or publishing routes/workflows.
5. Do not manufacture commercial facts. Run `npm run check`, `npm run check:template`, and `npm run build` after the change.

### Phase two: current SEO and GEO research

When the owner asks for SEO/GEO optimization after real content is present:

1. Browse current official Google Search Central documentation before changing rich-result or structured-data behavior. Use Schema.org only as vocabulary context, not as proof of Google eligibility.
2. Research live target-market SERPs, high-value core and long-tail queries, buyer questions, and leading commercial competitors. Build a keyword-to-page and intent-to-page map rather than inserting the same keywords everywhere.
3. Compare public competitor information architecture and content depth, then write original, fact-supported, human commercial copy. Remove formulaic AI language and unsupported superlatives.
4. Use `Product`/`ProductGroup` only for real physical offerings, preserve common versus model-specific properties, and use `Service` for services or engineered solutions. Only emit Offers, reviews, or ratings where real visible data exists.
5. Update page metadata, internal links, image alt text, JSON-LD, `product-catalog.json`, `llms.txt`, and translations as facts permit. Keep canonical, hreflang, sitemap, and non-indexed administration paths intact.
6. Record sources/date in the industry profile. Complete `npm run check`, `npm run check:template -- --production`, `npm run check:seo`, and `npm run build`.

## SEO Rules

- Public pages must produce canonical URLs, locale alternates, Open Graph/Twitter metadata, and JSON-LD from centralized data helpers.
- Product pages must support quote-based B2B catalogs, model/specification tables, Product or ProductGroup entities, FAQ data, and model-specific variant URLs where table data exists.
- Category and article pages should stay useful when their collections are empty, because this template ships without customer content.
- Translations must preserve model codes, SKUs, URLs, units, table shape, Markdown/Markdoc syntax, and structured frontmatter keys.

## Reuse Checklist

- During template and phase-one visual work, clearly recognizable sample contact values may remain visible so page layouts can be compared. Treat them as examples, not verified company facts.
- Replace `BusinessWeb`, `businessweb.pages.dev`, `your-org/businessweb`, `cdn.example.com`, and `inquiries@example.com` before production launch.
- Replace or verify all sample email, phone, WhatsApp, office, and operating-address values before production launch.
- Configure Cloudflare Pages, R2, D1, GitHub App OAuth, `KEYSTATIC_SECRET`, `CONTACT_FORM_SECRET`, Resend, and Gemini keys per deployment.
- Populate product and article collections through `/keystatic/` or `/manager/`; do not add template demo content to production without editing it for the target industry.
