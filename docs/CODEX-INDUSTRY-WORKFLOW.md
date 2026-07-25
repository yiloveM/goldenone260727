# BusinessWeb Two-Phase Industry Workflow

This document tells Codex how to turn this generic repository into an external-facing international B2B site. It is intentionally separate from the deployment guide: it governs creative, content, search, and information-architecture decisions, while the README explains how the owner deploys and operates the system.

## Phase one: industry visual build

The owner can send a short request such as:

```text
行业：工业离心泵制造商；核心关键词：API 610 pump, process pump, centrifugal pump；其它语种：德语、西班牙语
```

Codex must do the following:

1. Parse the industry and English core keywords. English remains the source language. Target locales are owner-controlled in `/keystatic/` under **网站语言**; a locale included in the request may be preselected through the initializer, but Codex must not create a second language list elsewhere. If the brand name, commercial model, buyer countries, or product facts are unknown, use neutral placeholders and identify them as unverified rather than inventing facts.
2. Run the initializer, for example:

```powershell
npm run industry:brief -- --industry "industrial centrifugal pump manufacturer" --keywords "API 610 pump, process pump, centrifugal pump" --locales "de,es" --mode "industrial-series"
```

3. Update `src/data/industry-profile.json` with the accurate buyer roles, markets, commercial positioning, category plan, common attributes, model-specific attributes, and visual direction. This file is also editable by the site owner in `/keystatic/` under **Brand and industry foundation**. Read enabled languages only from `src/data/site-language-settings.json`.
4. Research the industry enough to make design decisions, then rebuild the public frontend around real buyer evaluation. Use the actual product, service, material, process, installation, project, or work environment as visual evidence. Do not leave generic office imagery, generic “website template” copy, or content-management wording visible to public visitors.
5. Make the homepage a high-end international brand site, not an internal dashboard. Give the first screen a specific visual point of view, concise commercial positioning, direct catalog/inquiry paths, and a visible continuation into the next section. Keep navigation and repeated buyer tasks compact and predictable.
6. Shape the public information architecture to the offer:
   - `industrial-series`: product families, series pages, common series attributes, and model-table rows.
   - `discrete-products`: individual product pages and comparison attributes.
   - `services`: capability, scope, process, outcomes, and inquiry paths. Do not force fake model tables.
   - `solutions`: application/problem pages, configurable scope, technical evidence, and commercial next steps.
   - `hybrid`: retain both product and service paths with clearly separated buyer intent.
7. Keep source content factual. No price, rating, certification, standard, lead-time, market-coverage, or performance claim may be created without an owner-provided source.
8. Preserve the existing two-level governance model and every backend integration. Public visual work must not remove Keystatic, the manager portal, R2, D1, KV, AI translation, contact delivery, or publishing APIs/workflows.
9. Run `npm run check`, `npm run check:template`, and `npm run build`. Report changes and unresolved facts.

## Product-architecture decision record

Before product content is uploaded, document these choices in the industry profile:

| Decision | What it controls |
| --- | --- |
| `offeringType` | Whether a page represents a physical product, a service, or an engineered solution. Physical products can emit Product/ProductGroup data; service and solution pages emit Service data. |
| `modelStrategy` | `single-model`, `series`, `configurable`, or `not-applicable`. It prevents a service page from receiving fake SKU/model content. |
| Common attributes | Series-wide attributes, such as material, application, ingress protection, or service scope. They belong in overview specs. |
| Model attributes | Values that distinguish a purchasable/configurable model, such as capacity, voltage, dimensions, flow, pressure, or code. They belong in machine-readable model rows. |
| Category plan | Public buyer navigation. It is not an internal department or database taxonomy. |

For an industrial model series, the first column of the specification table must identify `Model`, `SKU`, `Code`, or an equivalent stable identifier. The template then produces a `ProductGroup` and linked model `Product` entities. Do not represent a configurable service or an unpriced project quote as a merchant listing.

## Phase two: current SEO and GEO research

The owner performs this only after deployment and after verified products, images, company facts, and target markets have been uploaded. A valid request is:

```text
全站SEO和GEO优化 + 工业离心泵制造商 + API 610 pump, process pump, centrifugal pump
```

Codex must browse the current web before making search-related claims. This is required because Google Search documentation, rich-result requirements, SERPs, and competitors change over time.

1. Read the current industry profile, the enabled locales from `src/data/site-language-settings.json`, public product content, images, and technical documents. Identify whether the site is industrial, catalog-led, discrete-product, solution-led, service-led, or hybrid.
2. Research the latest official Google Search Central guidance relevant to the pages being changed, including structured-data and rich-result eligibility. Use Google documentation as the authority for Google behavior, and Schema.org for vocabulary definitions. Record consulted primary-source URLs and the research date in `seo.competitorReferences` and `seo.lastResearchDate`.
3. Research the target-market search landscape: core terms, modifiers, buyer questions, application terms, standards only when verified, procurement language, and high-value long-tail queries. Inspect ranking competitor pages to understand information depth, page type, and buyer questions. Do not copy their wording or imitate their brand voice.
4. Build a keyword-to-page map with one primary intent per page. Prefer useful product/category/application/article pages over keyword stuffing. Update the industry profile with verified core keywords, long-tail terms, entities, intent summary, and real target markets.
5. Rework titles, descriptions, headings, introductions, internal links, articles, product copy, image alt text, JSON-LD, `product-catalog.json`, and `llms.txt` where the facts support it. Copy must be clear, specific, and commercially literate. Remove generic AI phrasing, empty superlatives, repeated conclusions, and unsupported claims.
6. Apply structured data by content type:
   - Physical, identifiable products: `Product` or `ProductGroup` with only visible, verified attributes.
   - Series models: stable code, model-specific table values, and group/variant relationships.
   - Services and engineered solutions: `Service`, not an invented product offer.
   - FAQ: only visible, substantive questions and answers.
   - Offers, merchant listings, review/rating data: only when actual visible, current, and policy-compliant data exists. Never manufacture a zero price or placeholder review.
7. Preserve canonical URLs, hreflang, sitemap behavior, robots exclusions, Open Graph, Twitter metadata, and public machine-readable catalog outputs. Do not index administration or API paths.
8. Set `lifecycle` to `researched` when research and implementation are complete. Set it to `production-ready` and `governance.factsVerified` to `true` only after the owner verifies all factual claims.
9. Run the validation sequence below and fix all errors before recommending publication.

```powershell
npm run check
npm run check:template:production
npm run check:seo
npm run build
```

Run `npm run check:rich-results` only for physical-product pages that really show a qualifying, visible offer, review, or aggregate rating. Run `npm run check:merchant-listings` only when the site publicly displays real active prices. A quote-only industrial catalog should not be forced into merchant-listing rules.

## Evidence standard

Codex may improve structure, readability, information hierarchy, and visual treatment. It must not create business facts. If a result depends on missing product documentation, certifications, model data, customer proof, market authorization, or commercial terms, place it in a clearly labeled owner action list rather than publishing it.
