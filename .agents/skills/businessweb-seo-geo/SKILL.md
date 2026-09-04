---
name: businessweb-seo-geo
description: Audit and improve the Golden One international B2B website for industry-fit visuals, product SEO, generative engine optimization, multilingual discoverability, content governance, and preserved application capability.
---

# Golden One Industry, SEO, and GEO Skill

Use this repo-local guidance when editing public pages, product collections, article collections, translations, JSON-LD, sitemap, robots rules, Keystatic config, or manager content workflows. Also use it whenever the owner provides an industry plus core keywords, or asks for full-site SEO/GEO optimization.

## Boundaries

- Keep `/keystatic/` for owner-level Git-backed editing and advanced site operations.
- Keep `/manager/` for content-level administrators, draft review, R2 asset browsing, AI translation dispatch, and publish requests.
- Keep `/api/`, `/r2/`, `/keystatic/`, and `/manager/` out of public search indexing.
- Preserve Astro 6 Cloudflare Workers, static-assets-first routing, KV sessions, D1, R2, the Golden One artwork inquiry, shared CAPTCHA, Resend delivery to `CONTACT_TO_EMAIL`, D1 lead persistence, owner-configurable controlled downloads, analytics, and publishing workflows.
- Preserve Golden One's verified brand, product families, contact details, repository owner, and Cloudflare resource identities. Reusable engineering additions must not replace them with mother-template defaults.
- Treat `src/data/industry-profile.json` as the brand, market, SEO, product-architecture, visual, and launch-governance source of truth. It is owner-editable through the Keystatic **Brand and industry foundation** singleton.
- Treat `src/data/site-language-settings.json` as the only enabled-language source of truth. The owner controls it through the Keystatic **网站语言** singleton. Manager and AI translation choices must come from this setting, never from a hard-coded active-language list.
- Public pages are for international external buyers. Do not expose template, CMS, deployment, draft, R2, D1, or internal-workflow wording in buyer-facing copy after an industry brief is supplied.
- Preserve each existing owner-selected feature state. New locales and controlled downloads enter disabled unless the owner explicitly enables them; never reset reviews, analytics, languages, R2, or customer content to template defaults.
- Keystatic JSON singleton paths omit `.json`; reject and migrate any `*.json.json` file.
- Manager hides owner-disabled review navigation and uses the same industry-profile owner label on its main and analytics screens.

## Authorized old-site migration

Trigger only from explicit authorization such as `旧站迁移+网址`.

1. Read `docs/OLD-SITE-MIGRATION.md`.
2. Capture public routes, raw HTML, copy, parameters, metadata, JSON-LD, contacts, images, documents, and asset metadata into ignored `/oldsite`.
3. Generate per-page management folders, stable readable R2 keys, `r2-upload-manifest.json`, and `upload.ps1` with `npm run oldsite:prepare`.
4. Keep viable legacy pathnames, including `.html`, as primary routes. Do not add 301 logic for an exactly retained path.
5. Replace old-host media dependencies with the generated R2/CDN mapping.
6. Apply the legacy information architecture, information layer, verified copy, specifications, metadata, media, and URLs to the customer site. Each old page is the mandatory factual and copy source.
7. Research current high-ranking industry pages only for buyer vocabulary, professional terminology, information density, and sentence rhythm. Rewrite the old copy to remove formulaic AI phrasing without factual drift, unsupported claims, competitor imitation, or from-scratch replacement based only on ranking-site style.

## Two-phase workflow

### Phase one: industry visual build

When the owner gives an industry, one or more core keywords, and optional non-English target locales:

1. Read `docs/CODEX-INDUSTRY-WORKFLOW.md`, `docs/AI-INDUSTRY-BUILD-PROMPT.md`, `docs/ASTROWIND-INTEGRATION.md`, and `docs/PUBLIC-VISUAL-FOUNDATION.md`, then run `npm run industry:brief --` with the parsed values. The `--locales` option may preselect the owner-facing language checkboxes, but `/keystatic/` **网站语言** remains authoritative.
2. Determine whether the business is an industrial model-series catalog, discrete product catalog, service business, solution business, or hybrid. Record common attributes, model-specific attributes, buyer roles, target markets, public categories, and design direction in the industry profile.
3. Rebuild the public site around actual buyer evaluation: a specific high-end visual direction, genuine product/process/project media, concise commercial positioning, information-rich catalog/application paths, and direct inquiry flows. If the task is only an engineering-capability migration, preserve the established Golden One visual layer unchanged.
4. Keep the stack and ownership boundaries unchanged. Do not remove custom Keystatic widgets, manager drafts/review, R2 media, D1, KV, translation, contact, or publishing routes/workflows.
5. Audit navigation, submenu pointer paths, keyboard focus, mobile controls, galleries, tabs, filters, sharing, inquiry cart, forms, CAPTCHA load/refresh/expiry, loading/success/error states, touch, Escape, back/forward, overflow, duplicate headings, and template residue.
6. Do not manufacture commercial facts. Run `npm run check`, `npm run check:template`, and `npm run build` after the change.

### Public forms and controlled downloads

- Contact and other public lead forms use the shared signed CAPTCHA, persist complete visitor data plus `form_type`, `source_page`, and delivery status in D1 `public_form_submissions`, and send through Resend to `CONTACT_TO_EMAIL`.
- Preserve Golden One's artwork attachment behavior and record the attachment filename in D1; do not email or persist unsupported file types.
- `src/data/catalog-downloads.json` remains `enabled: false` with an empty list until the owner supplies verified R2/CDN HTTPS PDF URLs and explicitly asks for a lead-gated page.
- The Keystatic **受控下载** order is: upload and verify PDFs, populate the server allowlist, place the component on the buyer-appropriate customer page, verify D1/Resend/CAPTCHA, then enable and explicitly publish.
- Direct document URLs stay out of initial HTML. The API releases an allowlisted URL only after successful validation, D1 persistence, and Resend delivery.

### Phase two: current SEO and GEO research

When the owner asks for SEO/GEO optimization after real content is present:

1. Browse current official Google Search Central documentation before changing rich-result or structured-data behavior. Use Schema.org only as vocabulary context, not as proof of Google eligibility.
2. Research live target-market SERPs, high-value core and long-tail queries, buyer questions, and leading commercial competitors. Build a keyword-to-page and intent-to-page map rather than inserting the same keywords everywhere.
3. Compare public competitor information architecture and content depth, then write original, fact-supported, human commercial copy. Remove formulaic AI language and unsupported superlatives.
4. Use `Product`/`ProductGroup` only for real physical offerings, preserve common versus model-specific properties, and use `Service` for services or engineered solutions. Only emit Offers, reviews, or ratings where real visible data exists.
5. Update page metadata, internal links, image alt text, JSON-LD, `product-catalog.json`, `llms.txt`, and translations as facts permit. Keep canonical, hreflang, sitemap, and non-indexed administration paths intact.
6. Record sources/date in the industry profile. Complete `npm run check`, `npm run check:template -- --production`, `npm run check:seo`, and `npm run build`.

### Review and rating workflow

1. Read `src/data/customer-reviews.json` and `src/data/customerReviews.ts` before changing review copy or product JSON-LD. Treat the store summary and individual review records as different evidence classes.
2. Respect the owner-controlled `enabled` switch. When it is false, public review sections and all review-derived structured data must be suppressed without deleting records.
3. A store-level score may be displayed as supplier reputation only when its public source and last-checked date are present. Never copy that supplier score into every product's `AggregateRating`.
4. An individual review may become Product `Review` JSON-LD only when `kind` is `verified`, it is verbatim and visible, has a traceable source URL, includes reviewer and publication date, is assigned through `productSlugs`, and has `seoEligible: true`.
5. `kind: demo` records are construction previews only. They must be visibly labeled, must never enter JSON-LD, and must be removed or replaced before production launch.
6. Product `AggregateRating` remains controlled by the product content fields. Populate it only from a real aggregate for that exact product or product group, not from the Alibaba supplier profile and not from a hand-counted subset of selected reviews.
7. Manager review edits remain D1 drafts until the dedicated apply workflow writes the record to the Git-backed JSON source; only the owner controls the global switch through Keystatic.
8. During full-site SEO/GEO work, audit visible review cards against emitted JSON-LD, test affected product URLs in Rich Results Test or Schema Markup Validator, and record the source check date.

## SEO Rules

- Public pages must produce canonical URLs, locale alternates, Open Graph/Twitter metadata, and JSON-LD from centralized data helpers.
- Product pages must support quote-based B2B catalogs, model/specification tables, Product or ProductGroup entities, FAQ data, and model-specific variant URLs where table data exists.
- Product review markup must follow the review workflow above. Supplier reputation and product-specific review evidence must remain separate.
- Category and article pages should stay useful when a collection is temporarily empty, without replacing Golden One's existing customer content with template examples.
- Translations must preserve model codes, SKUs, URLs, units, table shape, Markdown/Markdoc syntax, and structured frontmatter keys.

## Production Checklist

- Keep verified Golden One company and contact data in `industry-profile.json`; report contradictions instead of replacing them from a template or competitor.
- Replace or verify every remaining sample review, image, product claim, certification, capacity, lead time, price, customer, or case study before production launch.
- Configure Cloudflare Workers, R2, D1, GitHub App OAuth, `KEYSTATIC_SECRET`, `CONTACT_TO_EMAIL`, Resend, and Gemini keys per deployment.
- Populate product and article collections through `/keystatic/` or `/manager/`; do not add template demo content to production without editing it for the target industry.
