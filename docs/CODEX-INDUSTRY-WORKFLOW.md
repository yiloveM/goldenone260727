# BusinessWeb Two-Phase Industry Workflow

This workflow turns the neutral repository into a specific international business website. The public design is not selected from a fixed skin. It is derived from current industry evidence, buyer tasks, the company's verified material, and the visual conventions of leading sites.

English remains the source language. Enabled target locales come only from `src/data/site-language-settings.json`, edited through `/keystatic/` under **Website languages**.

## Prompt rules versus template code

Research sequence, migration triggers, source ownership, copy treatment, visual direction, gated-download page selection, interaction QA, and approval gates belong in Codex instructions. Reusable deterministic operations, including shared CAPTCHA, D1/Resend form delivery, a disabled-by-default download allowlist, and static asset routing, belong in template code and audits. Customer routes, customer content, document entries, asset maps, and industry visuals belong only in the customer repository after real inputs are known. A phase-one instruction must not be implemented as a customer-specific mother-template runtime behavior.

## Phase one: researched industry and visual build

For an authorized migration, phase one must populate the customer site from the
old site's information architecture and information layer, verified copy,
product specifications, metadata, media, and exact original URLs. Do not leave
starter content in place where verified legacy content exists. Preserve every
fact and technical meaning, but rewrite the prose only after studying the
buyer language, terminology, information density, and sentence rhythm used by
current high-ranking Google results in the industry. Legacy page copy remains
the mandatory rewrite source; ranking pages provide language-pattern research
only. Never discard the legacy source and generate replacement copy from the
ranking-site style alone. Remove formulaic AI phrasing and empty superlatives
without copying competitors or inventing new claims. Legacy metadata may be
reused and improved only when its page mapping
and search intent remain intact.

### 1. Initialize the brief

Parse the supplied industry, English core keywords, optional brand, commercial model, markets, buyer roles, target locales, authorized old-site URL, reference-site URLs, and reference template/theme name. Keep the old-site URL separate from visual references unless the owner explicitly assigns both roles:

```powershell
npm run industry:brief -- --industry "industrial centrifugal pump manufacturer" --keywords "API 610 pump, process pump, centrifugal pump" --locales "de,es" --mode "industrial-series"

npm run industry:brief -- --industry "commercial bakery equipment" --keywords "bakery oven manufacturer, dough processing line" --references "https://example-reference.com" --template "local sample HTML" --reference-mode "close-alignment"
```

The initializer creates planning data, not researched facts. Do not start styling immediately after it runs.

When the request contains `旧站迁移+网址` or equivalent explicit authorization, complete `docs/OLD-SITE-MIGRATION.md` before information-architecture or public-page work. Capture into local `/oldsite`, create exact route and page/media mappings, and generate the manifest-driven R2 package. The template supplies engineering, the old site supplies facts/media/routes, and visual references supply presentation.

### 2. Classify the offer and buyer task

Determine which model actually fits:

- `industrial-series`: product families, common series data, model rows, application and system context;
- `discrete-products`: image-led categories, materials, options, customization, presentation, and ordering inputs;
- `services`: expertise, scope, process, deliverables, evidence, and engagement path;
- `solutions`: application or problem pages, configuration inputs, project scope, and implementation evidence;
- `hybrid`: clearly separated product, service, and solution journeys.

Record buyer roles, primary evaluation tasks, common attributes, model-specific attributes, and public categories in `src/data/industry-profile.json`. Do not force industrial model tables, after-sales modules, technical diagrams, or factory language onto industries that do not need them.

## Visual research gate

Current web research is mandatory before public visual reconstruction. Design inputs are optional. If the owner supplies no reference URL, local sample, or template name, independently research the industry, competitors, and suitable adjacent sites, then derive an original visual system from that evidence. If a reference is supplied, use `referenceMode`: `inspiration` means extract reusable principles, while `close-alignment` makes the supplied reference the primary visual authority. The wider research set always supplies industry and buyer context.

### Research set

Normally inspect at least five live sites:

- at least two current industry leaders or direct competitors;
- other strong companies serving the same buyer intent or product category;
- one adjacent international design reference when it adds a useful interaction or editorial pattern;
- a current, reputable Astro implementation may be inspected for accessibility and engineering patterns, but it must not dictate the industry's visual identity.

The hard minimum recorded in `visual.referenceSites` is three sites, including two industry leaders or direct competitors.

The local `astrowind-main` checkout is an engineering reference only. Follow
`docs/ASTROWIND-INTEGRATION.md`: it does not count toward the industry research
minimum, and its demo widgets, palette, hero composition, or animation system
must not be treated as buyer evidence.

### What to inspect

Inspect real desktop and mobile pages, not only screenshots or search snippets:

- first-viewport product or service signal;
- navigation density, grouping, alignment, and quote/contact placement;
- category and product-detail architecture;
- image size, crop, aspect ratio, sequencing, galleries, and visual evidence;
- section rhythm, whitespace, grids, full-width bands, and shared-background sequences;
- typography scale, hierarchy, line length, and information density;
- palette, contrast, status colors, material or category cues;
- meaningful motion, dynamic text, hover behavior, sticky behavior, and reduced-motion handling;
- inquiry, quotation, specification, download, distributor, booking, or contact workflows;
- mobile menu, text fit, tap targets, overflow, and whether the product remains visually dominant.

Do not copy wording, logos, trademarks, product photography, or another company's brand voice. When close alignment is requested, matching composition, module order, spacing, proportions, interaction patterns, and general visual language is expected, using this project's own content and media.

### Required research record

For each item in `visual.referenceSites`, record:

- `url`;
- `role`: `industry-leader`, `direct-competitor`, `adjacent-reference`, or `technical-reference`;
- `observations`: concrete layout, image, typography, color, motion, and buyer-flow observations;
- `adopt`: the original design principle to absorb;
- `avoid`: the weakness or mismatch not to repeat.

Set `visual.lastResearchDate` to the actual research date and `visual.researchStatus` to `complete` only after the matrix and design decisions are finished.

### Required design decisions

Complete all of these fields before styling:

- `archetype`: the specific visual character appropriate to the industry;
- `primaryVisualEvidence`: what buyers must see first;
- `heroDirection`: first-viewport composition and media;
- `layoutDirection`: density, grids, module rhythm, and page architecture;
- `typographyDirection`: type character, scale, hierarchy, and multilingual implications;
- `colorDirection`: palette logic grounded in the category, product, or market;
- `motionDirection`: what motion communicates and where it is prohibited;
- `imageRules`: real-image priority, crop, background, replacement, and alt-text rules;
- `avoidPatterns`: industry-specific and template-derived mistakes to remove.

The result must explain why the design fits this business. “Modern,” “premium,” “clean,” and “international” are not sufficient design directions by themselves.

## Visual evidence hierarchy

Choose imagery in this order:

1. verified company product, work, project, process, material, venue, team, or outcome;
2. owner-approved R2 assets;
3. suitable placeholder or generated imagery when real assets are not yet available.

Construction-stage placeholder products and images may be used to complete the page design without per-item source records or code restrictions. Phase one should create only a small set of clearly labeled, industry-neutral demo reviews for visual preview; never import or invent platform reviews. Do not present fabricated customer logos, certifications, case studies, ratings, facilities, employees, project locations, or performance as verified proof, and do not feed demonstrations into eligible structured data.

## Public visual reconstruction

After the research gate:

1. Rebuild the public navigation, homepage, categories, detail pages, about, FAQ, contact, footer, and repeated inquiry paths as one system.
2. Keep the first viewport image-led when the industry sells an object, destination, experience, visual result, or physical product.
3. Use the information density buyers actually need. A visual consumer product and a technical model-series catalog should not share the same module order.
4. Replace neutral template modules when research indicates a better structure. Do not merely recolor the starter.
5. Preserve `/keystatic/`, `/manager/`, R2, D1, KV, AI translation, shared CAPTCHA, public-form D1/Resend delivery, configurable controlled downloads, content schemas, and publishing workflows.
6. Keep public wording external. Do not mention templates, CMS fields, drafts, R2, D1, or deployment on buyer-facing pages.
7. Use reusable role/state class names. Do not copy customer, industry, facility, reference-site, old-theme, color, or temporary-effect names into template classes.
8. If implementation would change the technical stack, an engineering capability, application boundary, or deployment ownership, stop before editing. Explain the exact before/after behavior and wait for the owner's exact reply `确认修改能力`.

### Controlled document downloads

The mother template contains the capability but no customer files. `src/data/catalog-downloads.json` stays disabled and empty until a customer owner explicitly requires lead-gated documents and supplies verified HTTPS R2/CDN URLs.

For an approved customer implementation:

1. Record the document title, real PDF filename, stable ID, optional description, and verified HTTPS URL in Keystatic **受控下载**.
2. Select the public page and module placement from buyer-flow research; importing `CatalogDownloadGate.astro` and styling that customer-facing module are phase-one public-layer work.
3. Keep the total switch off until the list, page, copy, Resend variables, D1 binding, and CAPTCHA have been checked; then enable it and explicitly publish the site.
4. Do not render a blank download section when the switch is off or the allowlist is empty.
5. Do not expose direct document URLs in initial HTML. The server returns only the selected allowlisted URL after a valid submission is saved to D1 and delivered through Resend.

### Visual rules

- Do not make a public homepage look like an internal dashboard.
- Do not default to the starter's composition. A user-supplied reference may intentionally use split heroes, glass, gradients, decorative effects, or other patterns; follow it when requested and verify readability, responsiveness, performance, and accessibility.
- Cards are for repeated individual items, not every section.
- Do not place cards inside cards.
- Keep hero text over a relevant full-bleed image or immersive product scene when the business is image-led.
- Ensure every first viewport shows the brand, offer, product, place, person, or service category and leaves a hint of the following section.
- Use a single large shared background across consecutive modules only when it creates a coherent product, process, material, or story sequence.
- Dynamic text must clarify the offer, product choice, process, material, or outcome. It must remain readable, stable in size, and useful without animation.
- Public status feedback uses non-red modern tokens unless a safety-critical destructive action genuinely requires red.

### Motion policy

- Base content is visible without JavaScript.
- A reference-driven reveal system may use opacity, blur, clipping, or other effects, but critical content must remain visible when JavaScript fails and the effect must not harm readability.
- Choose transform, clip, underline, color, image motion, blur, WebGL, or another technique according to the selected design direction rather than a starter-wide visual rule.
- Continuous motion is allowed when the reference design calls for it and it remains readable, pauses on user interaction where appropriate, and respects reduced motion.
- Respect `prefers-reduced-motion`.
- Keep animated text dimensions stable so it cannot move surrounding layout.

## Phase-one QA gate

Run:

```powershell
npm run check
npm run check:template
npm run build
```

Use a real browser to inspect at minimum:

- 1440 x 900 desktop;
- 1024 x 768 compact desktop or tablet;
- 390 x 844 mobile;
- 360 x 800 narrow mobile.

Verify:

- navigation alignment and mobile-menu behavior;
- every submenu remains reachable while the pointer crosses from its trigger, and keyboard focus can open, traverse, and close it;
- carousels, galleries, tabs, filters, accordions, sharing controls, quantity controls, inquiry cart, forms, validation, loading, success, and error states perform their real task;
- every public form can load and refresh its CAPTCHA and handles expired or incorrect answers without trapping the visitor;
- each valid contact submission is recorded in D1 with its source page and sent to `CONTACT_TO_EMAIL`; when controlled downloads are enabled, the same check includes the selected PDF identity and confirms its direct URL is absent before success;
- hover, focus-visible, active, disabled, drag, swipe, escape, back/forward, and touch behavior are coherent and do not trap the visitor;
- no horizontal overflow;
- no text clipping, overlap, or unstable fixed-format controls;
- image assets load and crops preserve the product or subject;
- no console errors;
- content remains visible when scripting or motion is unavailable;
- blur, backdrop filters, WebGL, and other visual effects are intentional, aligned with the selected direction, and have readable fallbacks;
- reduced-motion mode remains usable;
- English metadata remains the source and only approved target locales enter hreflang and sitemap.
- repeated labels, duplicate module headings, formulaic AI phrasing, template residue, and visually inconsistent contact or conversion sections are removed.

Record unresolved factual, image, translation, and design-approval items. Do not set `production-ready` merely because the visual build compiles.

## Product architecture decision record

| Decision | What it controls |
| --- | --- |
| `offeringType` | `physical-product`, `service`, or `solution` structured-data behavior |
| `modelStrategy` | `single-model`, `series`, `configurable`, or `not-applicable` |
| Common attributes | Values shared across a product family or service scope |
| Model attributes | Values that distinguish a stable model, SKU, or code |
| Category plan | Buyer-facing navigation, not an internal department taxonomy |

For a real model series, the first specification-table column must identify `Model`, `SKU`, `Code`, or an equivalent stable identifier. Services and project solutions must not receive fake model rows or merchant offers.

## Phase two: current SEO and GEO research

Run phase two only after verified products, imagery, company facts, and target markets are present.

1. Browse current official Google Search Central guidance before changing search behavior or rich-result data.
2. Research current target-market SERPs, buyer questions, commercial modifiers, long-tail queries, and ranking page types.
3. Build a keyword-to-page and intent-to-page map. Do not repeat the same keyword set across every page.
4. Write original, fact-supported commercial copy. Remove formulaic AI language and unsupported superlatives.
5. Emit `Product` or `ProductGroup` only for real physical offerings, `Service` for services and solutions, and Offers/reviews/ratings only when visible and verified.
6. Update metadata, internal links, image alt text, JSON-LD, `product-catalog.json`, `llms.txt`, canonical URLs, hreflang, sitemap, and translations as facts permit.
7. Record current sources and date in `seo.competitorReferences` and `seo.lastResearchDate`.

Validate:

```powershell
npm run check
npm run check:template:production
npm run check:seo
npm run build
```

Use `check:rich-results` or `check:merchant-listings` only when real visible offers, ratings, or prices qualify.

## Evidence standard

AI may improve structure, clarity, hierarchy, usability, and visual treatment. It must not create business facts. Missing certifications, specifications, facilities, lead times, prices, case studies, customer proof, market coverage, or commercial terms belong in an owner action list rather than public copy.
