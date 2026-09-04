# Golden One Codex Operating Rules

This repository is the in-progress Golden One international commercial website, not an untouched template or an internal admin product. Preserve the Golden One brand, metal-gift product architecture, public visual layer, content, artwork-upload inquiry flow, URLs, and production resource identities.

## Detect required workflows

Treat any of these user requests as a required workflow, even if the user does not name a skill:

- An industry plus one or more core keywords, optionally with target languages: run the phase-one industry build.
- A public visual reconstruction or supplied competitor/reference site: run the phase-one research and interaction workflow.
- `旧站迁移+网址` or equivalent explicit authorization: complete the old-site capture, mapping, R2 package, exact-route, and copy-rework workflow before public reconstruction.
- `全站SEO和GEO优化` or an equivalent request with an industry and keywords: run the phase-two current-data SEO/GEO workflow.

Read `.agents/skills/businessweb-seo-geo/SKILL.md`, `docs/CODEX-INDUSTRY-WORKFLOW.md`, `docs/AI-INDUSTRY-BUILD-PROMPT.md`, `docs/ASTROWIND-INTEGRATION.md`, and `docs/PUBLIC-VISUAL-FOUNDATION.md` before acting. For a migration also read `docs/OLD-SITE-MIGRATION.md`. Use `src/data/industry-profile.json` as the single public brand and market brief. Use `src/data/site-language-settings.json`, edited through `/keystatic/` **网站语言**, as the only source of truth for enabled target locales. The source language stays English; target locales are translations, not a replacement source language.

Before phase-one edits, classify each requirement as a Codex decision rule, reusable engineering capability, Golden One public implementation, or ignored customer-data output. Do not encode prompt-only decisions as buyer-facing runtime behavior.

## Non-negotiable system boundaries

- Keep `/keystatic/` as the owner-only Git-backed surface.
- Keep `/manager/` as the content-administrator portal with D1 drafts, R2 media, review, and approval/write-back flow.
- In production, expose those surfaces only through two different dedicated custom domains plus two different secret UUID entry paths. Both portals must then require the configured GitHub App slug as username and `KEYSTATIC_SECRET` as password before opening a 12-hour signed session.
- Keep the two UUIDs, GitHub App Client Secret, portal password, and backend GitHub token in Cloudflare Worker encrypted Secrets, never in committed files. The GitHub App Client Secret is the root for purpose-separated runtime secrets; do not restore separate session, analytics, or contact-form secrets.
- Do not add Cloudflare Access JWT/email verification or browser-stored Manager bearer tokens unless the owner explicitly requests a separate identity layer.
- Preserve the custom Keystatic fields, AI translation APIs/workflow, R2 routes, Astro 6 Cloudflare Workers adapter, static-assets-first routing, KV session binding, D1 binding, Golden One artwork inquiry, shared CAPTCHA, public-form D1/Resend delivery, controlled downloads, analytics, and publish workflow.
- Every valid public lead form must save complete visitor data, source page, and delivery status to D1 `public_form_submissions`, then send through Resend to `CONTACT_TO_EMAIL`. Do not report success when either required step fails.
- Controlled downloads are owner-configurable through Keystatic, server allowlisted, and disabled by default. Never expose a document URL in initial HTML; release it only after CAPTCHA, D1 persistence, and successful Resend delivery.
- Keystatic JSON singleton paths must omit the `.json` extension. Never create or retain `*.json.json` content files.
- Preserve current customer feature states. A capability migration may add new disabled options, but must not reset existing language, review, analytics, R2, download, or public-module settings.
- Manager navigation must hide owner-disabled modules. The Manager main and analytics screens must derive their top-left company label from the same industry-profile owner value.
- Keep `/keystatic/`, `/manager/`, `/api/`, and `/r2/` out of public indexing.
- Do not use fabricated prices, availability, reviews, ratings, certifications, manufacturing claims, customer logos, dates, or case studies.
- While `industry-profile.json` is in `template` or `briefed` lifecycle, clearly recognizable sample email, phone, WhatsApp, and address values may remain visible for frontend visual comparison. Keep them obviously exemplary; do not replace them with realistic but unverified company details.
- Before a real production launch, replace or verify every sample contact value. `npm run check:template:production` must reject remaining sample contacts.

## Deployment ownership boundary

- This boundary is owner-locked. No AI or automation may change it without the owner's explicit approval for that specific change.
- `.github/workflows/site-publish.yml` is the only site build/deploy system. It deploys qualifying `main` pushes automatically and keeps `workflow_dispatch` for explicit owner or administrator publishing.
- Cloudflare Workers Builds and its Git repository connection must remain disabled or disconnected. Never chain a GitHub Actions build into Workers Builds or perform two production builds for one publish request.
- A separately named `goldenone-preview` Worker may connect Cloudflare Git only to an owner-approved non-`main` preview branch. If that branch does not exist remotely, do not build, deploy, create, or connect the preview Worker. It may reuse existing R2, D1, analytics, and public runtime configuration, but must not receive production custom-domain traffic.
- Product, article, translation, site-language, and Keystatic JSON write-backs remain excluded from automatic deployment so drafts wait for explicit publishing. `src/data/customer-reviews.json` remains deploy-triggering.
- GitHub Actions content write-back jobs must not build or deploy the site themselves; only a resulting non-excluded commit may trigger `site-publish.yml`.
- The deployment workflow reads only `CLOUDFLARE_API_TOKEN` from GitHub Secrets. Golden One's Cloudflare Account ID remains in `wrangler.toml`; do not add a second Account ID variable without owner approval.
- Keep `keep_vars = true` so Wrangler deployments preserve Cloudflare Dashboard variables. Never commit Worker Secret values.

## Authorized old-site migration

- Trigger only after explicit owner authorization and a supplied public old-site URL.
- Capture public routes, raw HTML, copy, tables, metadata, JSON-LD, media, documents, and asset metadata into ignored `/oldsite`; generate per-page folders, route maps, a manifest-driven R2 package, and `upload.ps1`.
- Keep every viable old pathname, including historic `.html`, as the new primary route. Do not add a 301 when the same pathname is retained exactly.
- The old site supplies authorized facts, copy, media, metadata, information architecture, and URLs. Named reference sites supply visual direction only unless the owner explicitly assigns both roles.
- Each old page's verified copy is the mandatory rewrite source. Current high-ranking industry pages may inform buyer vocabulary, terminology, information density, and sentence rhythm, but cannot replace the old page as the factual source. Preserve specifications and meaning, remove formulaic AI language, and never copy competitors or invent claims.
- The new runtime must use the configured R2/CDN mapping rather than depend on the retired host or CDN.

## README structure

- Keep `README.md` in the same exact eight-chapter order as the mother template: Repo feature summary; step-by-step deployment; collapsed Keystatic guide; collapsed Manager guide; important project locations; collapsed two-stage Codex build flow; collapsed troubleshooting guide; collapsed preview guide. Content must remain Golden One-specific.
- Update information only in its matching chapter. Do not rename, reorder, split, merge, or add peer chapters without owner approval.
- Keep deployment ownership, portal login, variable setup, publish rules, and verified incident conclusions. Avoid reference-document lists and repeated warnings.

## Required verification

After meaningful public, content-schema, or deployment changes, run:

```powershell
npm run types:cloudflare -- --check
npm run check
npm run check:template
npm run build
```

Before a real production launch, run `npm run check:template:production` after the industry brief, company information, and product data are verified.

Browser QA for phase one covers desktop and mobile navigation, submenu pointer transitions, keyboard focus, touch, galleries, carousels, filters, forms, CAPTCHA loading/refresh/expiry, error/success states, no-script/reduced-motion behavior, overflow, image loading, and duplicate/template residue. Do not modify Golden One public styling during an engineering-capability migration.
